import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import type { GalleryMedia } from '../models/gallery-media.model';
import type { MediaResult } from '../models/media-result.model';
import type { MediaPermissions } from '../models/media-permissions.model';

// Re-exports: consumidores existentes pueden seguir importando desde acá
export type { GalleryMedia } from '../models/gallery-media.model';
export type { MediaResult } from '../models/media-result.model';
export type { MediaPermissions } from '../models/media-permissions.model';

export interface GalleryResponse {
  medias: GalleryMedia[];
  hasMore: boolean;
}

export interface GalleryPluginInterface {
  getGallery(options: { limit: number; offset: number }): Promise<GalleryResponse>;
  getMediaThumbnail(options: {
    uri: string;
    size: number;
    format: 'webp' | 'jpeg';
    quality?: number;
  }): Promise<MediaResult>;
  /** Batch de getMediaThumbnail: una llamada para N fotos, orden preservado. */
  getMediaThumbnails(options: {
    uris: string[];
    size: number;
    format: 'webp' | 'jpeg';
    quality?: number;
  }): Promise<{ thumbs: Array<MediaResult | null> }>;
  getMediaFull(options: {
    uri: string;
    maxSize?: number;
    format?: 'webp' | 'jpeg';
    quality?: number;
  }): Promise<MediaResult>;
  checkPermissions(): Promise<MediaPermissions>;
  requestPermissions(): Promise<MediaPermissions>;
  /** Abre el panel de permisos de la app en Settings (estado 'denied' permanente). */
  openGallerySettings(): Promise<void>;
}

/**
 * Token del plugin nativo Gallery. En tests se provee un mock con useValue;
 * en runtime el factory registra el plugin real (registerPlugin es seguro
 * aunque el plugin nativo no exista, p.ej. en web: las llamadas rechazan).
 */
export const GALLERY_PLUGIN = new InjectionToken<GalleryPluginInterface>('GalleryPlugin', {
  providedIn: 'root',
  factory: () => registerPlugin<GalleryPluginInterface>('Gallery'),
});
