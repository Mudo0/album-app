/**
 * Resultado de una lectura/compresión nativa.
 *
 * - Thumbnails: `data` (base64) — se usa en el grid y el picker.
 * - Full (viewer): `filePath` — la WebView lo convierte con
 *   `Capacitor.convertFileSrc()` y el <img> streama del disco a la GPU.
 */
export interface MediaResult {
  /** base64 del archivo comprimido (thumbnails). */
  data?: string;
  /** Ruta absoluta del archivo temporal en cache dir (full images). */
  filePath?: string;
  mimeType: string;
  width: number;
  height: number;
}
