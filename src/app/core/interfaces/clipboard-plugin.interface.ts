export interface ClipboardPluginInterface {
  /**
   * Copia una imagen nativa al portapapeles del sistema.
   * La decodificación y compresión ocurren 100% en Kotlin —
   * el base64 nunca cruza el puente JS.
   *
   * @param options.uri - content:// URI nativa del MediaStore
   * @param options.maxSize - lado máximo en px (default: 1024)
   * @param options.quality - calidad de compresión 1-100 (default: 85)
   */
  copyImageToClipboard(options: {
    uri: string;
    maxSize?: number;
    quality?: number;
  }): Promise<{ success: boolean }>;
}
