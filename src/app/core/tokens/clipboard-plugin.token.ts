import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import type { ClipboardPluginInterface } from '../interfaces/clipboard-plugin.interface';

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
