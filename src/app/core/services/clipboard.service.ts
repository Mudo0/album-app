import { Injectable, inject } from '@angular/core';
import { CLIPBOARD_PLUGIN } from '../tokens/clipboard-plugin.token';
import type { ClipboardPluginInterface } from '../interfaces/clipboard-plugin.interface';

/**
 * Servicio wrapper del plugin nativo Clipboard.
 * Los componentes y servicios de dominio NO tocan el plugin directo.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly plugin = inject(CLIPBOARD_PLUGIN);

  /**
   * Copia una imagen nativa al portapapeles del sistema.
   * La operación completa ocurre en Kotlin — la WebView solo
   * recibe { success: true } o un error.
   *
   * @param uri - content:// URI nativa del MediaStore
   * @param maxSize - lado máximo en px (default: 1024)
   * @param quality - calidad de compresión 1-100 (default: 85)
   */
  async copyImageToClipboard(
    uri: string,
    options?: { maxSize?: number; quality?: number },
  ): Promise<void> {
    await this.plugin.copyImageToClipboard({
      uri,
      ...options,
    });
  }
}
