package com.mudo.app.gallery

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayOutputStream

/**
 * Utilidad de decodificación y compresión de imágenes — compartida por
 * GalleryPlugin (viewer/thumbs) y ClipboardPlugin (copia al portapapeles).
 *
 * Responsabilidad: leer un Bitmap desde una URI nativa, aplicar rotación EXIF,
 * escalar y comprimir. NO maneja permisos ni E/S de archivos; eso lo hace
 * el plugin que llama.
 */
object ImageDecoder {

    data class CompressedImage(
        val data: String,
        val mimeType: String,
        val width: Int,
        val height: Int,
    )

    data class CompressedBytes(
        val bytes: ByteArray,
        val mimeType: String,
        val width: Int,
        val height: Int,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is CompressedBytes) return false
            return bytes.contentEquals(other.bytes) && mimeType == other.mimeType &&
                width == other.width && height == other.height
        }

        override fun hashCode(): Int {
            var result = bytes.contentHashCode()
            result = 31 * result + mimeType.hashCode()
            result = 31 * result + width
            result = 31 * result + height
            return result
        }
    }

    /**
     * Decodifica la imagen FULL desde una URI nativa, aplica rotación EXIF,
     * escala y comprime a base64. BitmapFactory NO aplica la rotación EXIF,
     * así que se rota manualmente con Matrix antes de comprimir.
     *
     * @return CompressedImage con base64, o null si la URI está muerta.
     */
    fun decodeAndCompress(
        resolver: ContentResolver,
        uri: Uri,
        maxSize: Int,
        format: String,
        quality: Int,
    ): CompressedImage? {
        val result = decodeAndCompressBytes(resolver, uri, maxSize, format, quality)
            ?: return null
        val base64 = android.util.Base64.encodeToString(result.bytes, android.util.Base64.NO_WRAP)
        return CompressedImage(base64, result.mimeType, result.width, result.height)
    }

    /**
     * Decodifica la imagen FULL y devuelve los bytes comprimidos (sin base64).
     * Útil para ClipboardPlugin donde se escribe directo a archivo.
     */
    fun decodeAndCompressBytes(
        resolver: ContentResolver,
        uri: Uri,
        maxSize: Int,
        format: String,
        quality: Int,
    ): CompressedBytes? {
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

        // 5) Escala fina + compresión
        return compressToBytes(bitmap, maxSize, format, quality)
    }

    /**
     * Comprime un Bitmap ya decodificado (thumbnails del sistema, etc.)
     * a base64. Para thumbnails del SISTEMA NO se aplica rotación EXIF
     * porque ya vienen orientados por el MediaProvider.
     */
    fun compressBitmap(
        source: Bitmap,
        maxSize: Int,
        format: String,
        quality: Int,
    ): CompressedImage {
        val result = compressToBytes(source, maxSize, format, quality)
        val base64 = android.util.Base64.encodeToString(result.bytes, android.util.Base64.NO_WRAP)
        return CompressedImage(base64, result.mimeType, result.width, result.height)
    }

    /**
     * Escala fina al tamaño pedido y comprime a bytes.
     * Captura width/height ANTES de reciclar (bug fix: el original leía
     * dimensiones después de recycle, causando 0x0 o crash).
     */
    private fun compressToBytes(
        source: Bitmap,
        maxSize: Int,
        format: String,
        quality: Int,
    ): CompressedBytes {
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

        // Capturar dimensiones ANTES de reciclar
        val width = bitmap.width
        val height = bitmap.height

        @Suppress("DEPRECATION")
        val compressFormat = when {
            format == "webp" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
                Bitmap.CompressFormat.WEBP_LOSSY
            format == "webp" -> Bitmap.CompressFormat.WEBP
            format == "png" -> Bitmap.CompressFormat.PNG
            else -> Bitmap.CompressFormat.JPEG
        }
        val mimeType = when (format) {
            "webp" -> "image/webp"
            "png" -> "image/png"
            else -> "image/jpeg"
        }

        val output = ByteArrayOutputStream()
        bitmap.compress(compressFormat, quality, output)
        bitmap.recycle()

        return CompressedBytes(output.toByteArray(), mimeType, width, height)
    }
}
