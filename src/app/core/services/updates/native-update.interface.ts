// core/services/updates/native-update.interface.ts
// Contrato TS del plugin nativo Update (android/.../updates/UpdatePlugin.kt).
// Sigue el patrón del repo: interfaz + token + registerPlugin (ver gallery/clipboard).

import type { PluginListenerHandle } from '@capacitor/core';

/** Datos que reporta el polling de progreso de la descarga. */
export interface DownloadProgress {
  bytes: number;
  total: number;
}

export interface UpdatePluginInterface {
  /**
   * Descarga un APK con el DownloadManager del sistema a getExternalFilesDir.
   * Sobrevive si matás la app; el progreso llega por el canal `download-progress`.
   */
  download(options: { url: string; fileName: string }): Promise<{ downloadId: number }>;

  /**
   * Lanza el instalador nativo (FileProvider + ACTION_VIEW).
   * Rechaza con `code === 'unknownSourcesRequired'` si falta el permiso de
   * orígenes desconocidos — NO abre el settings: el JS muestra su cartel y
   * el usuario llega al settings recién con openUnknownSourcesSettings().
   */
  install(options: { fileName: string }): Promise<{ started: boolean }>;

  /**
   * Abre la pantalla de "orígenes desconocidos" de la app (Android 8+).
   * Se llama SOLO después de que install() rechazó con unknownSourcesRequired;
   * al volver, el usuario reintenta y install() ya puede lanzar el instalador.
   */
  openUnknownSourcesSettings(): Promise<void>;

  /**
   * Consulta la descarga guardada (sobrevive a la muerte de la app). Emite el
   * evento correspondiente: download-complete / download-progress / download-error.
   */
  resumePending(): Promise<{ state: 'none' | number }>;

  addListener(event: string, callback: (data: Record<string, unknown>) => void): Promise<PluginListenerHandle>;
}