import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

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

/**
 * Token del plugin nativo Clipboard. En tests se provee un mock con useValue;
 * en runtime el factory registra el plugin real (registerPlugin es seguro
 * aunque el plugin nativo no exista, p.ej. en web: las llamadas rechazan).
 */
export const CLIPBOARD_PLUGIN = new InjectionToken<ClipboardPluginInterface>(
  'ClipboardPlugin',
  {
    providedIn: 'root',
    factory: () => registerPlugin<ClipboardPluginInterface>('Clipboard'),
  },
);
