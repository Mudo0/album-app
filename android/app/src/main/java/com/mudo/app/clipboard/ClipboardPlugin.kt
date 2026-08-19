package com.mudo.app.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mudo.app.gallery.ImageDecoder
import java.io.File
import java.util.concurrent.Executors

/**
 * Plugin nativo de portapapeles — copia imágenes al clipboard del sistema.
 *
 * La operación completa vive en Kotlin: decodifica la imagen original del
 * MediaStore, la comprime a PNG, escribe un archivo temporal en cache dir,
 * obtiene un content:// URI vía FileProvider y lo pega al ClipboardManager.
 *
 * El base64 NUNCA cruza el puente JS — la WebView solo recibe { success: true }.
 *
 * El archivo temporal usa un nombre fijo (clipboard_temp.png) que se
 * sobreescribe en cada copia, evitando acumulación de archivos.
 */
@CapacitorPlugin(name = "Clipboard")
class ClipboardPlugin : Plugin() {

    companion object {
        private const val TEMP_FILENAME = "clipboard_temp.png"
        private const val TEMP_DIR = "clipboard"
        private const val CLIP_LABEL = "Sticker"
        private const val DEFAULT_MAX_SIZE = 1024
        private const val DEFAULT_QUALITY = 85

        /** Duración de la vibración de feedback (ms). */
        private const val VIBRATE_MS = 50L
    }

    private val executor = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun copyImageToClipboard(call: PluginCall) {
        val uriString = call.getString("uri") ?: run {
            call.reject("uri requerida")
            return
        }
        val maxSize = (call.getInt("maxSize", DEFAULT_MAX_SIZE) ?: DEFAULT_MAX_SIZE)
            .coerceIn(128, 4096)
        val quality = (call.getInt("quality", DEFAULT_QUALITY) ?: DEFAULT_QUALITY)
            .coerceIn(1, 100)

        executor.execute {
            try {
                val uri = Uri.parse(uriString)
                val resolver = context.contentResolver

                // 1) Decodificar + comprimir a PNG (sin base64 en JS)
                val compressed = ImageDecoder.decodeAndCompressBytes(
                    resolver, uri, maxSize, "png", quality,
                ) ?: run {
                    call.reject("La imagen original ya no existe en la galería.")
                    return@execute
                }

                // 2) Escribir a archivo temporal (nombre fijo, se sobreescribe)
                val clipDir = File(context.cacheDir, TEMP_DIR)
                clipDir.mkdirs()
                val tempFile = File(clipDir, TEMP_FILENAME)
                tempFile.writeBytes(compressed.bytes)

                // 3) Obtener content:// URI vía FileProvider
                val contentUri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    tempFile,
                )

                // 4) Copiar al clipboard del sistema
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE)
                    as ClipboardManager
                val clip = ClipData.newUri(context.contentResolver, CLIP_LABEL, contentUri)
                clipboard.setPrimaryClip(clip)

                // 5) Feedback háptico
                vibrate()

                // 6) Resolver éxito (el componente TS muestra toast)
                val result = JSObject().apply {
                    put("success", true)
                }
                call.resolve(result)
            } catch (e: SecurityException) {
                call.reject("No se pudo acceder a la imagen.")
            } catch (e: Exception) {
                call.reject("Error al copiar al portapapeles: ${e.message}")
            }
        }
    }

    /**
     * Vibración nativa — más confiable que navigator.vibrate() en WebViews.
     * Android 10+ usa VibratorManager; versiones anteriores usan Vibrator directo.
     */
    private fun vibrate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE)
                    as VibratorManager
                manager.defaultVibrator.vibrate(
                    VibrationEffect.createOneShot(VIBRATE_MS, VibrationEffect.DEFAULT_AMPLITUDE),
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                vibrator.vibrate(
                    VibrationEffect.createOneShot(VIBRATE_MS, VIBRATE_DEFAULT_AMPLITUDE),
                )
            }
        } catch (_: Exception) {
            // Vibración no disponible — no romper la copia por esto
        }
    }
}
