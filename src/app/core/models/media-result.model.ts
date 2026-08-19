/** Resultado de una lectura/compresión nativa (nunca la full original). */
export interface MediaResult {
  /** base64 del archivo ya redimensionado y comprimido en Kotlin. */
  data: string;
  mimeType: string;
  width: number;
  height: number;
}
