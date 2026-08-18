import type { PermissionState } from '@capacitor/core';

/**
 * Item de la galería nativa tal como lo devuelve GalleryPlugin.getGallery.
 * SOLO metadatos: el picker pide los thumbnails bajo demanda con
 * getMediaThumbnails (ventana visible + cache LRU), nunca vienen acá.
 */
export interface GalleryMedia {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  dateAdded: number;
}

export interface GalleryResponse {
  medias: GalleryMedia[];
  hasMore: boolean;
}

/** Resultado de una lectura/compresión nativa (nunca la full original). */
export interface MediaResult {
  /** base64 del archivo ya redimensionado y comprimido en Kotlin. */
  data: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface MediaPermissions {
  mediaLibrary: PermissionState;
  storageLegacy: PermissionState;
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
