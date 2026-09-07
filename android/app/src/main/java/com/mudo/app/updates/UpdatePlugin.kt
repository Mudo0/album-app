package com.mudo.app.updates

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Plugin nativo de auto-update — descarga e instalación de APKs.
 *
 * La descarga corre en el `DownloadManager` del SISTEMA (no en la WebView):
 * sobrevive si matás la app y el progreso se reporta por eventos
 * (`download-progress` / `download-complete` / `download-error`).
 *
 * Flujo:
 *  1. JS llama `download(url, fileName)` → `DownloadManager.enqueue` a
 *     `getExternalFilesDir` (cubierto por el FileProvider con el
 *     `external-files-path` de `file_paths.xml`).
 *  2. El plugin guarda UN único `downloadId` vigente en `SharedPreferences`
 *     (se sobreescribe en cada descarga — no se acumulan ids huérfanos).
 *  3. Al completar con la app viva, un `BroadcastReceiver` de
 *     `ACTION_DOWNLOAD_COMPLETE` re-emite `download-complete`.
 *  4. Al arrancar, JS llama `resumePending()`: si la descarga ya terminó
 *     mientras la app estaba muerta → `download-complete`; si sigue corriendo
 *     → sigue el progreso; si falló o el id ya no existe → `download-error`
 *     y se limpia el estado.
 *  5. `install(fileName)` valida `canRequestPackageInstalls()` (Android 8+)
 *     antes de lanzar el asistente con `FileProvider` + `ACTION_VIEW`.
 *     Si el permiso falta, RECHAZA con `unknownSourcesRequired` y NO abre el
 *     settings: el JS muestra su cartel primero y el usuario recién después
 *     llega a la pantalla de orígenes desconocidos con `openUnknownSourcesSettings()`
 *     (el orden inverso — el cartel siempre va antes que el settings).
 */
@CapacitorPlugin(name = "Update")
class UpdatePlugin : Plugin() {

    companion object {
        private const val PREF_NAME = "update_plugin"
        private const val PREF_DOWNLOAD_ID = "download_id"
        private const val PREF_FILE_NAME = "file_name"
        private const val POLL_INTERVAL_MS = 800L
        private const val APK_MIME = "application/vnd.android.package-archive"
        const val EC_UNKNOWN_SOURCES = "unknownSourcesRequired"
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    private val progressHandler = Handler(Looper.getMainLooper())
    private var activeDownloadId: Long? = null

    // ── Receiver de download completo ────────────────────────────────────────
    // Registrado con application context en load(): sobrevive a la activity.
    // En Android 13+ el flag RECEIVER_EXPORTED es obligatorio para receivers
    // dinámicos de broadcasts del sistema (sin él: SecurityException).
    private val downloadCompleteReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return

            val extraId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            val savedId = prefs.getLong(PREF_DOWNLOAD_ID, -1L)
            if (extraId != savedId) return

            when (queryStatus(savedId)) {
                DownloadManager.STATUS_SUCCESSFUL -> {
                    stopProgressPolling()
                    notifyListeners(
                        "download-complete",
                        JSObject().apply {
                            put("fileName", prefs.getString(PREF_FILE_NAME, null) ?: "")
                        },
                    )
                    // NO se limpian las prefs: si la app muere antes de instalar,
                    // resumePending() al reabrir debe seguir ofreciendo el APK listo.
                }
                DownloadManager.STATUS_FAILED -> {
                    stopProgressPolling()
                    prefs.edit().clear().apply()
                    notifyListeners(
                        "download-error",
                        JSObject().apply { put("message", "La descarga falló.") },
                    )
                }
            }
        }
    }

    // ── Ciclo de vida ────────────────────────────────────────────────────────

    override fun load() {
        super.load()
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        ContextCompat.registerReceiver(
            context,
            downloadCompleteReceiver,
            filter,
            ContextCompat.RECEIVER_EXPORTED,
        )
    }

    // ── download ─────────────────────────────────────────────────────────────

    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url requerida")
            return
        }
        val fileName = call.getString("fileName") ?: run {
            call.reject("fileName requerido")
            return
        }
        if (fileName.isBlank() || fileName.contains("/") || fileName.contains("\\")) {
            call.reject("fileName inválido: $fileName")
            return
        }

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

        // Cancelar un id previo (conserva UN solo downloadId vigente) y borrar
        // el archivo previo con el mismo nombre.
        val prevId = prefs.getLong(PREF_DOWNLOAD_ID, -1L)
        if (prevId != -1L) {
            dm.remove(prevId)
            stopProgressPolling()
        }
        destinationFile(fileName)?.delete()

        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setDestinationInExternalFilesDir(context, null, fileName)
            setTitle(fileName)
            setMimeType(APK_MIME)
            // Visible en la bandeja: si la app muere, el usuario ve el progreso
            // y la notificación de completado del sistema.
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            // Que no se pause en datos móviles (un APK de update es chico y el
            // usuario explícitamente pidió actualizar).
            setAllowedOverMetered(true)
        }

        val downloadId = dm.enqueue(request)

        prefs.edit()
            .putLong(PREF_DOWNLOAD_ID, downloadId)
            .putString(PREF_FILE_NAME, fileName)
            .apply()

        activeDownloadId = downloadId
        startProgressPolling(downloadId)

        call.resolve(JSObject().apply { put("downloadId", downloadId) })
    }

    // ── install ──────────────────────────────────────────────────────────────

    @PluginMethod
    fun install(call: PluginCall) {
        // Fix 3: NO se abre el settings acá. Rechaza con unknownSourcesRequired
        // y el JS muestra su cartel primero; el usuario recién después abre el
        // settings con openUnknownSourcesSettings() y vuelve a intentar.
        if (!canRequestPackageInstalls()) {
            call.reject(
                "Habilitá la instalación de apps de orígenes desconocidos.",
                EC_UNKNOWN_SOURCES,
            )
            return
        }

        val fileName = call.getString("fileName")
            ?: prefs.getString(PREF_FILE_NAME, null)
            ?: run {
                call.reject("fileName requerido")
                return
            }
        val apkFile = destinationFile(fileName)
        if (apkFile?.exists() != true) {
            call.reject("El APK no existe en disco: $fileName")
            return
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, APK_MIME)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)

        // Instalación lanzada: ya no hay descarga pendiente que retomar.
        stopProgressPolling()
        prefs.edit().clear().apply()

        call.resolve(JSObject().apply { put("started", true) })
    }

    // ── openUnknownSourcesSettings ───────────────────────────────────────────

    /**
     * Abre la pantalla de "orígenes desconocidos" de la app (Android 8+). Es
     * la contraparte del cartel del dialog: el JS decide CUÁNDO mostrar el
     * cartel (recién tras un install() rechazado con unknownSourcesRequired)
     * y recién entonces el usuario llega acá.
     */
    @PluginMethod
    fun openUnknownSourcesSettings(call: PluginCall) {
        launchUnknownSourcesSettings()
        call.resolve()
    }

    // ── resumePending ────────────────────────────────────────────────────────

    /**
     * Consulta el estado de la descarga guardada (sobrevive a la muerte de la
     * app). Emite el evento correspondiente y resuelve con el estado, para que
     * el JS sincronice su UI:
     *  - SUCCESSFUL → `download-complete` (el APK ya está listo para instalar)
     *  - RUNNING/PENDING/PAUSED → `download-progress` + retoma el polling
     *  - FAILED / id ya no existe → `download-error` y limpia el estado
     */
    @PluginMethod
    fun resumePending(call: PluginCall) {
        val downloadId = prefs.getLong(PREF_DOWNLOAD_ID, -1L)
        if (downloadId == -1L) {
            call.resolve(JSObject().apply { put("state", "none") })
            return
        }

        val progress = queryProgress(downloadId)
        if (progress == null) {
            // El sistema purgó el id (limpieza) → no hay nada que retomar
            prefs.edit().clear().apply()
            notifyListeners(
                "download-error",
                JSObject().apply { put("message", "La descarga pendiente ya no existe.") },
            )
            call.resolve(JSObject().apply { put("state", "error") })
            return
        }

        val (status, bytes, total) = progress
        when (status) {
            DownloadManager.STATUS_SUCCESSFUL -> notifyListeners(
                "download-complete",
                JSObject().apply {
                    put("fileName", prefs.getString(PREF_FILE_NAME, null) ?: "")
                },
            )
            DownloadManager.STATUS_RUNNING,
            DownloadManager.STATUS_PENDING,
            DownloadManager.STATUS_PAUSED,
            -> {
                activeDownloadId = downloadId
                startProgressPolling(downloadId)
                notifyListeners(
                    "download-progress",
                    JSObject().apply {
                        put("bytes", bytes)
                        put("total", total)
                    },
                )
            }
            else -> {
                // STATUS_FAILED (u otro estado inesperado) → limpiar
                stopProgressPolling()
                prefs.edit().clear().apply()
                notifyListeners(
                    "download-error",
                    JSObject().apply { put("message", "La descarga pendiente falló.") },
                )
            }
        }
        call.resolve(JSObject().apply { put("state", status) })
    }

    // ── Polling de progreso ──────────────────────────────────────────────────

    private fun startProgressPolling(downloadId: Long) {
        progressHandler.removeCallbacks(progressRunnable)
        progressHandler.post(progressRunnable)
    }

    private fun stopProgressPolling() {
        progressHandler.removeCallbacks(progressRunnable)
        activeDownloadId = null
    }

    private val progressRunnable = object : Runnable {
        override fun run() {
            val id = activeDownloadId ?: return
            val progress = queryProgress(id) ?: run {
                stopProgressPolling()
                return
            }
            val (status, bytes, total) = progress
            if (status == DownloadManager.STATUS_RUNNING ||
                status == DownloadManager.STATUS_PENDING ||
                status == DownloadManager.STATUS_PAUSED
            ) {
                notifyListeners(
                    "download-progress",
                    JSObject().apply {
                        put("bytes", bytes)
                        put("total", total)
                    },
                )
                progressHandler.postDelayed(this, POLL_INTERVAL_MS)
            } else {
                // Estado final: lo informa el BroadcastReceiver (o resumePending).
                stopProgressPolling()
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun destinationFile(fileName: String): File? {
        val dir = context.getExternalFilesDir(null) ?: return null
        return File(dir, fileName)
    }

    /** Status del DownloadManager (Long → Int) o null si el id ya no existe. */
    private fun queryStatus(downloadId: Long): Int? = queryProgress(downloadId)?.first

    /** (status, bytes descargados, total) o null si el id no existe. */
    private fun queryProgress(downloadId: Long): Triple<Int, Long, Long>? {
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(downloadId)
        dm.query(query)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                val bytes =
                    cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                val total =
                    cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                return Triple(status, bytes, total)
            }
        }
        return null
    }

    private fun canRequestPackageInstalls(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()
    }

    private fun launchUnknownSourcesSettings() {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}