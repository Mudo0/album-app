import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import type { GalleryPluginInterface } from '../interfaces/gallery-plugin.interface';

/**
 * Token del plugin nativo Gallery. En tests se provee un mock con useValue;
 * en runtime el factory registra el plugin real (registerPlugin es seguro
 * aunque el plugin nativo no exista, p.ej. en web: las llamadas rechazan).
 */
export const GALLERY_PLUGIN = new InjectionToken<GalleryPluginInterface>('GalleryPlugin', {
  providedIn: 'root',
  factory: () => registerPlugin<GalleryPluginInterface>('Gallery'),
});
