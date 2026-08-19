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
}
