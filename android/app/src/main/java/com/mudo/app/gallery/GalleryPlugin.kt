package com.mudo.app.gallery

import android.Manifest
import android.content.ContentUris
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
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
import java.util.concurrent.Executors

/**
 * Plugin nativo de galería — "espejo" del MediaStore.
 *
 * La app NO copia las fotos a su storage: guarda la `sourceUri` nativa
 * (content://media/...) y este plugin resuelve la lectura redimensionando y
 * comprimiendo EN KOTLIN, de modo que la imagen full nunca cruza el puente JS
 * (evita los strings base64 gigantes que matan el WebView por OOM).
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

        private const val API_LEVEL_33 = 33
        private const val DEFAULT_PAGE_SIZE = 100
        private const val GRID_THUMB_SIZE = 256
        private const val GRID_THUMB_QUALITY = 70
    }

    // Un solo hilo: las páginas de galería y el guardado se procesan en serie
    // (requisito de memoria del proyecto) y la UI nunca se congela.
    private val executor = Executors.newSingleThreadExecutor()

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
    fun checkPermissions(call: PluginCall) {
        val result = JSObject().apply {
            put("mediaLibrary", getPermissionState("mediaLibrary").toString())
            put("storageLegacy", getPermissionState("storageLegacy").toString())
        }
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
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

        val limit = call.getInt("limit", DEFAULT_PAGE_SIZE).coerceIn(1, 200)
        val offset = call.getInt("offset", 0).coerceAtLeast(0)

        executor.execute {
            try {
                val resolver = getContext().contentResolver
                val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC LIMIT $limit OFFSET $offset"

                val medias = JSArray()
                var count = 0

                resolver.query(
                    collection,
                    null,
                    null,
                    null,
                    sortOrder,
                )?.use { cursor ->
                    while (cursor.moveToNext() && count < limit) {
                        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                        val name = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                        val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                        val dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))

                        // WIDTH/HEIGHT existen recién en API 29+; si faltan, 0 y el JS los ignora
                        val widthIdx = cursor.getColumnIndex(MediaStore.Images.Media.WIDTH)
                        val heightIdx = cursor.getColumnIndex(MediaStore.Images.Media.HEIGHT)
                        val width = if (widthIdx >= 0) cursor.getInt(widthIdx) else 0
                        val height = if (heightIdx >= 0) cursor.getInt(heightIdx) else 0

                        val uri = ContentUris.withAppendedId(collection, id)
                        val thumb = decodeAndCompress(
                            uri = uri,
                            maxSize = GRID_THUMB_SIZE,
                            format = "jpeg",
                            quality = GRID_THUMB_QUALITY,
                        )

                        val item = JSObject().apply {
                            put("id", id.toString())
                            put("uri", uri.toString())
                            put("name", name)
                            put("mimeType", mimeType)
                            put("width", width)
                            put("height", height)
                            put("dateAdded", dateAdded)
                            put("thumbnail", thumb?.data.orEmpty())
                        }
                        medias.put(item)
                        count++
                    }
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
        val maxSize = call.getInt("size", 512).coerceIn(16, 4096)
        val format = call.getString("format") ?: "webp"
        val quality = call.getInt("quality", 80).coerceIn(1, 100)

        executor.execute { decodeAndRespond(call, Uri.parse(uri), maxSize, format, quality) }
    }

    // ── getMediaFull ────────────────────────────────────────────────────────

    @PluginMethod
    fun getMediaFull(call: PluginCall) {
        if (!requirePermission(call)) return

        val uri = call.getString("uri") ?: run {
            call.reject("uri requerida", EC_INVALID_ARGUMENT)
            return
        }
        val maxSize = call.getInt("maxSize", 2048).coerceIn(16, 8192)
        val format = call.getString("format") ?: "webp"
        val quality = call.getInt("quality", 82).coerceIn(1, 100)

        executor.execute { decodeAndRespond(call, Uri.parse(uri), maxSize, format, quality) }
    }

    // ── decode + compress (nunca cruza la full al JS) ───────────────────────

    private fun decodeAndRespond(
        call: PluginCall,
        uri: Uri,
        maxSize: Int,
        format: String,
        quality: Int,
    ) {
        try {
            val result = decodeAndCompress(uri, maxSize, format, quality)
            if (result == null) {
                call.reject("La imagen original ya no existe en la galería.", EC_MEDIA_NOT_FOUND)
                return
            }
            val response = JSObject().apply {
                put("data", result.data)
                put("mimeType", result.mimeType)
                put("width", result.width)
                put("height", result.height)
            }
            call.resolve(response)
        } catch (e: FileNotFoundException) {
            call.reject("La imagen original ya no existe en la galería.", EC_MEDIA_NOT_FOUND)
        } catch (e: SecurityException) {
            call.reject("Se necesita permiso para leer la galería.", EC_ACCESS_DENIED)
        } catch (e: Exception) {
            call.reject("Error al procesar la imagen: ${e.message}")
        }
    }

    private data class CompressedImage(
        val data: String,
        val mimeType: String,
        val width: Int,
        val height: Int,
    )

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

        // 2) Rotación EXIF (BitmapFactory NO la aplica)
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
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, decodeOptions)
        } ?: return null

        // 4) Rotar
        var bitmap: Bitmap = decoded
        if (rotateDegrees != 0f) {
            val matrix = Matrix().apply { postRotate(rotateDegrees) }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated !== bitmap) bitmap.recycle()
            bitmap = rotated
        }

        // 5) Escalar fino al tamaño pedido
        val currentMaxSide = maxOf(bitmap.width, bitmap.height)
        if (currentMaxSide > maxSize) {
            val scale = maxSize.toFloat() / currentMaxSide
            val newWidth = (bitmap.width * scale).toInt().coerceAtLeast(1)
            val newHeight = (bitmap.height * scale).toInt().coerceAtLeast(1)
            val scaled = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
            if (scaled !== bitmap) bitmap.recycle()
            bitmap = scaled
        }

        // 6) Comprimir y liberar
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
