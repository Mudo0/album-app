package com.mudo.app.gallery

import android.Manifest
import android.content.ContentResolver
import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import androidx.exifinterface.media.ExifInterface
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.ByteArrayOutputStream
import java.io.FileNotFoundException
import java.util.concurrent.Callable
import java.util.concurrent.Executors

/**
 * Plugin nativo de galería — "espejo" del MediaStore.
 *
 * La app NO copia las fotos a su storage: guarda la `sourceUri` nativa
 * (content://media/...) y este plugin resuelve la lectura redimensionando y
 * comprimiendo EN KOTLIN, de modo que la imagen full nunca cruza el puente JS
 * (evita los strings base64 gigantes que matan el WebView por OOM).
 *
 * Thumbnails: se usan las MINIATURAS DEL SISTEMA (cache del MediaProvider),
 * nunca se decodifica la imagen original para el grid o el thumb del álbum:
 *  - API 29+: ContentResolver.loadThumbnail(uri, Size, null)
 *  - API 24-28: tabla MediaStore.Images.Thumbnails (MINI_KIND ~512px)
 * Las miniaturas del sistema ya vienen con la orientación EXIF aplicada → NO
 * se rotan. La rotación EXIF manual (ExifInterface + Matrix.postRotate) queda
 * SOLO para getMediaFull, donde BitmapFactory no aplica la orientación.
 */
@CapacitorPlugin(
    name = "Gallery",
    permissions = [
        // Android 13+: permisos granulares de media
        Permission(alias = "mediaLibrary", strings = [Manifest.permission.READ_MEDIA_IMAGES]),
        // Android 12 y menor: storage legacy (el maxSdkVersion=32 lo define el manifest)
        Permission(alias = "storageLegacy", strings = [Manifest.permission.READ_EXTERNAL_STORAGE]),
    ],
)
class GalleryPlugin : Plugin() {

    companion object {
        const val EC_MEDIA_NOT_FOUND = "mediaNotFound"
        const val EC_ACCESS_DENIED = "accessDenied"
        const val EC_INVALID_ARGUMENT = "invalidArgument"

        private const val API_LEVEL_26 = 26
        private const val API_LEVEL_29 = 29
        private const val API_LEVEL_33 = 33
        private const val DEFAULT_PAGE_SIZE = 100
        private const val GRID_THUMB_SIZE = 256
        private const val GRID_THUMB_QUALITY = 70
        private const val KIND_MINI = 1 // MediaStore.Images.Thumbnails.MINI_KIND
        /** Hilos del pool dedicado a los thumbs del grid (fijo: pico de RAM acotado). */
        private const val THUMB_THREADS = 4
        /** Tope de fotos por llamada a getMediaThumbnails (validación defensiva). */
        private const val MAX_BATCH_THUMBS = 50
    }

    // Ejecutor SERIAL: páginas de galería, thumbs de guardado y la full se
    // procesan uno a la vez (requisito de memoria del proyecto); la UI nunca
    // se congela.
    private val executor = Executors.newSingleThreadExecutor()

    // Pool FIJO solo para los thumbs del GRID: los 100 de una página se generan
    // en paralelo (~4x más rápido que en serie). Los bitmaps son de 256px y se
    // reciclan al instante, así el pico de memoria queda acotado a THUMB_THREADS
    // decodificaciones simultáneas — nunca 100.
    private val thumbExecutor = Executors.newFixedThreadPool(THUMB_THREADS)

    // ── Permisos ────────────────────────────────────────────────────────────

    private fun mediaPermissionGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= API_LEVEL_33) {
            getPermissionState("mediaLibrary") == PermissionState.GRANTED
        } else {
            getPermissionState("storageLegacy") == PermissionState.GRANTED
        }
    }

    private fun requirePermission(call: PluginCall): Boolean {
        if (mediaPermissionGranted()) return true
        call.reject("Se necesita permiso para leer la galería.", EC_ACCESS_DENIED)
        return false
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val result = JSObject().apply {
            put("mediaLibrary", getPermissionState("mediaLibrary").toString())
            put("storageLegacy", getPermissionState("storageLegacy").toString())
        }
        call.resolve(result)
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (!mediaPermissionGranted()) {
            requestAllPermissions(call, "permissionsCallback")
        } else {
            checkPermissions(call)
        }
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        checkPermissions(call)
    }

    // ── getGallery ──────────────────────────────────────────────────────────

    @PluginMethod
    fun getGallery(call: PluginCall) {
        if (!requirePermission(call)) return

        val limit = (call.getInt("limit", DEFAULT_PAGE_SIZE) ?: DEFAULT_PAGE_SIZE)
            .coerceIn(1, 200)
        val offset = (call.getInt("offset", 0) ?: 0).coerceAtLeast(0)

        executor.execute {
            try {
                val resolver = getContext().contentResolver
                val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

                val medias = JSArray()
                val rows = mutableListOf<GalleryRow>()
                var count = 0

                // Paginación: la vía oficial (API 26+) es la QueryArgs API —
                // ContentResolver.query(Uri, String[], Bundle, CancellationSignal),
                // con LIMIT/OFFSET/SORT dentro del Bundle. Inyectar LIMIT en el
                // sortOrder de la query clásica es un truco no garantizado
                // (depende del MediaProvider); solo se usa en API 24-25, donde
                // la overload con Bundle no existe.
                val cursor = if (Build.VERSION.SDK_INT >= API_LEVEL_26) {
                    val queryArgs = Bundle().apply {
                        putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, sortOrder)
                        putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
                        putInt(ContentResolver.QUERY_ARG_OFFSET, offset)
                    }
                    resolver.query(collection, null, queryArgs, null)
                } else {
                    resolver.query(
                        collection,
                        null,
                        null,
                        null,
                        "$sortOrder LIMIT $limit OFFSET $offset",
                        null,
                    )
                }

                cursor?.use {
                    // count < limit: guard extra por si algún provider ignora el Bundle
                    while (it.moveToNext() && count < limit) {
                        val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                        val name = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                        val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                        val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))

                        // WIDTH/HEIGHT existen recién en API 29+; si faltan, 0 y el JS los ignora
                        val widthIdx = it.getColumnIndex(MediaStore.Images.Media.WIDTH)
                        val heightIdx = it.getColumnIndex(MediaStore.Images.Media.HEIGHT)
                        val width = if (widthIdx >= 0) it.getInt(widthIdx) else 0
                        val height = if (heightIdx >= 0) it.getInt(heightIdx) else 0

                        rows.add(
                            GalleryRow(
                                id = id,
                                uri = ContentUris.withAppendedId(collection, id),
                                name = name,
                                mimeType = mimeType,
                                width = width,
                                height = height,
                                dateAdded = dateAdded,
                            ),
                        )
                        count++
                    }
                }

                // Cursor ya liberado. Thumbs del SISTEMA (cache del MediaProvider)
                // generados EN PARALELO con el pool fijo; el orden se preserva.
                val thumbs = buildGridThumbs(rows, GRID_THUMB_SIZE, "jpeg", GRID_THUMB_QUALITY)

                rows.forEachIndexed { index, row ->
                    val item = JSObject().apply {
                        put("id", row.id.toString())
                        put("uri", row.uri.toString())
                        put("name", row.name)
                        put("mimeType", row.mimeType)
                        put("width", row.width)
                        put("height", row.height)
                        put("dateAdded", row.dateAdded)
                        put("thumbnail", thumbs[index]?.data.orEmpty())
                    }
                    medias.put(item)
                }

                val response = JSObject().apply {
                    put("medias", medias)
                    // Página exacta => asumimos que hay más (falso positivo tolerable)
                    put("hasMore", count == limit)
                }
                call.resolve(response)
            } catch (e: SecurityException) {
                call.reject("Se necesita permiso para leer la galería.", EC_ACCESS_DENIED)
            } catch (e: Exception) {
                call.reject("Error al leer la galería: ${e.message}")
            }
        }
    }

    // ── getMediaThumbnail ───────────────────────────────────────────────────

    @PluginMethod
    fun getMediaThumbnail(call: PluginCall) {
        if (!requirePermission(call)) return

        val uri = call.getString("uri") ?: run {
            call.reject("uri requerida", EC_INVALID_ARGUMENT)
            return
        }
        val maxSize = (call.getInt("size", 512) ?: 512).coerceIn(16, 4096)
        val format = call.getString("format") ?: "webp"
        val quality = (call.getInt("quality", 80) ?: 80).coerceIn(1, 100)

        executor.execute {
            val parsed = Uri.parse(uri)
            val imageId = ContentUris.parseId(parsed)
            val result = try {
                loadThumb(parsed, imageId, maxSize, format, quality)
            } catch (e: Exception) {
                null
            }
            respondWith(result, call)
        }
    }

    // ── getMediaThumbnails (batch) ──────────────────────────────────────────

    /**
     * Versión por LOTE de getMediaThumbnail: una sola ida y vuelta del puente
     * para N fotos (el guardado de un álbum hace N llamadas hoy).
     *
     * El lote se procesa EN PARALELO con el pool fijo (THUMB_THREADS) y el
     * orden de entrada se preserva: `thumbs[i]` corresponde a `uris[i]`.
     * Una uri inválida o muerta devuelve null en su posición — el JS reporta
     * la foto fallida por nombre sin abortar el resto del lote.
     */
    @PluginMethod
    fun getMediaThumbnails(call: PluginCall) {
        if (!requirePermission(call)) return

        val uris = call.getArray("uris") ?: run {
            call.reject("uris requerida", EC_INVALID_ARGUMENT)
            return
        }
        if (uris.length() !in 1..MAX_BATCH_THUMBS) {
            call.reject("Se requieren entre 1 y $MAX_BATCH_THUMBS uris por lote.", EC_INVALID_ARGUMENT)
            return
        }
        val maxSize = (call.getInt("size", 512) ?: 512).coerceIn(16, 4096)
        val format = call.getString("format") ?: "webp"
        val quality = (call.getInt("quality", 80) ?: 80).coerceIn(1, 100)

        executor.execute {
            try {
                // Resolver uri + id ANTES del pool: parseId puede lanzar y no
                // debe colarse dentro de un thread del pool (queda null).
                val items: List<Pair<Uri, Long>?> = (0 until uris.length()).map { index ->
                    val raw = uris.getString(index) ?: return@map null
                    try {
                        val uri = Uri.parse(raw)
                        uri to ContentUris.parseId(uri)
                    } catch (e: Exception) {
                        null
                    }
                }

                val thumbs = buildThumbsInParallel(items, maxSize, format, quality)

                val result = JSArray()
                thumbs.forEach { result.put(toJSObject(it)) }
                call.resolve(JSObject().apply { put("thumbs", result) })
            } catch (e: SecurityException) {
                call.reject("Se necesita permiso para leer la galería.", EC_ACCESS_DENIED)
            } catch (e: Exception) {
                call.reject("Error al procesar el lote: ${e.message}")
            }
        }
    }

    // ── getMediaFull ────────────────────────────────────────────────────────

    @PluginMethod
    fun getMediaFull(call: PluginCall) {
        if (!requirePermission(call)) return

        val uri = call.getString("uri") ?: run {
            call.reject("uri requerida", EC_INVALID_ARGUMENT)
            return
        }
        val maxSize = (call.getInt("maxSize", 2048) ?: 2048).coerceIn(16, 8192)
        val format = call.getString("format") ?: "webp"
        val quality = (call.getInt("quality", 82) ?: 82).coerceIn(1, 100)

        executor.execute {
            try {
                val result = decodeAndCompress(Uri.parse(uri), maxSize, format, quality)
                respondWith(result, call)
            } catch (e: SecurityException) {
                call.reject("Se necesita permiso para leer la galería.", EC_ACCESS_DENIED)
            } catch (e: Exception) {
                call.reject("Error al procesar la imagen: ${e.message}")
            }
        }
    }

    // ── Thumbnails del grid (en paralelo) ───────────────────────────────────

    /** Una fila de la galería, con todo lo que el JS necesita para el grid. */
    private data class GalleryRow(
        val id: Long,
        val uri: Uri,
        val name: String,
        val mimeType: String,
        val width: Int,
        val height: Int,
        val dateAdded: Long,
    )

    /**
     * Genera los thumbs del grid EN PARALELO con el pool fijo (THUMB_THREADS).
     * Un thumb caído NUNCA rompe la página: devuelve null y el JS muestra un
     * placeholder (el permiso ya se validó arriba, un fallo acá es un item
     * puntual: URI muerta, thumb sin indexar, etc.).
     */
    private fun buildGridThumbs(
        rows: List<GalleryRow>,
        size: Int,
        format: String,
        quality: Int,
    ): List<CompressedImage?> = buildThumbsInParallel(
        rows.map { it.uri to it.id },
        size,
        format,
        quality,
    )

    /**
     * Núcleo compartido del paralelismo de thumbs: lanza una tarea por item al
     * pool fijo (THUMB_THREADS) y espera todas con `invokeAll`, que devuelve
     * los futures EN EL MISMO ORDEN de entrada — el resultado queda estable
     * aunque un thumb tarde más que otro.
     *
     * Un item null (uri inválida) o un thumb caído devuelve null en su
     * posición, sin abortar el resto del lote.
     */
    private fun buildThumbsInParallel(
        items: List<Pair<Uri, Long>?>,
        size: Int,
        format: String,
        quality: Int,
    ): List<CompressedImage?> {
        if (items.isEmpty()) return emptyList()

        val tasks = items.map { item ->
            Callable {
                try {
                    val (uri, imageId) = item ?: return@Callable null
                    loadThumb(uri, imageId, size, format, quality)
                } catch (e: Exception) {
                    null
                }
            }
        }
        val futures = thumbExecutor.invokeAll(tasks)
        return futures.map { future ->
            try {
                future.get()
            } catch (e: Exception) {
                null
            }
        }
    }

    // ── Thumbnails del sistema ──────────────────────────────────────────────

    /**
     * Miniatura cacheada del MediaProvider, sin decodificar la imagen original.
     * Devuelve null si no existe (URI muerta, galería aún no indexada, etc.).
     * Los thumbs del sistema YA vienen con orientación aplicada: no rotar.
     */
    private fun loadThumb(uri: Uri, imageId: Long, size: Int, format: String, quality: Int): CompressedImage? {
        val resolver = getContext().contentResolver
        return try {
            val bitmap = if (Build.VERSION.SDK_INT >= API_LEVEL_29) {
                resolver.loadThumbnail(uri, Size(size, size), null)
            } else {
                loadLegacySystemThumb(resolver, imageId) ?: return null
            }
            compressBitmap(bitmap, size, format, quality)
        } catch (e: FileNotFoundException) {
            null
        } catch (e: SecurityException) {
            throw e // acceso denegado: debe llegar tipado a la capa JS
        } catch (e: Exception) {
            null // un thumb caído no debe romper la página del grid
        }
    }

    /**
     * API 24-28: thumbnails cacheados de la tabla MediaStore.Images.Thumbnails
     * (MINI_KIND ≈ 512px). También ya orientados por el sistema.
     */
    @Suppress("DEPRECATION")
    private fun loadLegacySystemThumb(resolver: ContentResolver, imageId: Long): Bitmap? {
        val projection = arrayOf(MediaStore.Images.Thumbnails.DATA)
        val selection = "${MediaStore.Images.Thumbnails.IMAGE_ID} = ? AND ${MediaStore.Images.Thumbnails.KIND} = ?"
        val selectionArgs = arrayOf(imageId.toString(), KIND_MINI.toString())

        resolver.query(
            MediaStore.Images.Thumbnails.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val dataIdx = cursor.getColumnIndex(MediaStore.Images.Thumbnails.DATA)
                val path = if (dataIdx >= 0) cursor.getString(dataIdx) else null
                if (path != null) {
                    return BitmapFactory.decodeFile(path)
                }
            }
        }
        return null
    }

    // ── decode + compress (la full nunca cruza al JS) ───────────────────────

    /** Serializa un thumb comprimido a JSObject (null se queda como null). */
    private fun toJSObject(thumb: CompressedImage?): JSObject? {
        if (thumb == null) return null
        return JSObject().apply {
            put("data", thumb.data)
            put("mimeType", thumb.mimeType)
            put("width", thumb.width)
            put("height", thumb.height)
        }
    }

    private fun respondWith(result: CompressedImage?, call: PluginCall) {
        if (result == null) {
            call.reject("La imagen original ya no existe en la galería.", EC_MEDIA_NOT_FOUND)
            return
        }
        call.resolve(toJSObject(result))
    }

    private data class CompressedImage(
        val data: String,
        val mimeType: String,
        val width: Int,
        val height: Int,
    )

    /**
     * Lee la imagen FULL y la comprime a base64. SOLO para el viewer:
     * BitmapFactory NO aplica la rotación EXIF, así que acá (y solo acá) se
     * rota manualmente con Matrix antes de comprimir.
     */
    private fun decodeAndCompress(
        uri: Uri,
        maxSize: Int,
        format: String,
        quality: Int,
    ): CompressedImage? {
        val resolver = getContext().contentResolver

        // 1) Bounds sin decodificar pixeles (una foto 4000x3000 = 48MB en RAM si no)
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, boundsOptions)
        }
        if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) return null

        // 2) Rotación EXIF, desde un stream PROPIO (ExifInterface y decodeStream
        //    compiten por el mismo InputStream: nunca compartirlo)
        val orientation = resolver.openInputStream(uri)?.use { stream ->
            ExifInterface(stream).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL,
            )
        } ?: ExifInterface.ORIENTATION_NORMAL
        val rotateDegrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }

        // 3) Muestreo por potencia de 2 (el decoder lo exige)
        var inSampleSize = 1
        val maxSide = maxOf(boundsOptions.outWidth, boundsOptions.outHeight)
        while (maxSide / (inSampleSize * 2) >= maxSize) inSampleSize *= 2

        val decodeOptions = BitmapFactory.Options().apply { inSampleSize = inSampleSize }
        var bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, decodeOptions)
        } ?: return null

        // 4) Rotar manualmente (BitmapFactory no aplica EXIF)
        if (rotateDegrees != 0f) {
            val matrix = Matrix().apply { postRotate(rotateDegrees) }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated !== bitmap) bitmap.recycle()
            bitmap = rotated
        }

        // 5) Escala fina + compresión + base64
        return compressBitmap(bitmap, maxSize, format, quality)
    }

    /** Escala fina al tamaño pedido, comprime y devuelve base64. Recicla el bitmap. */
    private fun compressBitmap(source: Bitmap, maxSize: Int, format: String, quality: Int): CompressedImage {
        var bitmap = source

        val currentMaxSide = maxOf(bitmap.width, bitmap.height)
        if (currentMaxSide > maxSize) {
            val scale = maxSize.toFloat() / currentMaxSide
            val newWidth = (bitmap.width * scale).toInt().coerceAtLeast(1)
            val newHeight = (bitmap.height * scale).toInt().coerceAtLeast(1)
            val scaled = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
            if (scaled !== bitmap) bitmap.recycle()
            bitmap = scaled
        }

        @Suppress("DEPRECATION")
        val compressFormat = when {
            format == "webp" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
                Bitmap.CompressFormat.WEBP_LOSSY
            format == "webp" -> Bitmap.CompressFormat.WEBP
            else -> Bitmap.CompressFormat.JPEG
        }
        val mimeType = if (format == "webp") "image/webp" else "image/jpeg"

        val output = ByteArrayOutputStream()
        bitmap.compress(compressFormat, quality, output)
        bitmap.recycle()

        val bytes = output.toByteArray()
        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return CompressedImage(base64, mimeType, bitmap.width, bitmap.height)
    }
}
