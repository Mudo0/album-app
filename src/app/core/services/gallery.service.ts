import { Injectable, inject } from '@angular/core';
import { GALLERY_PLUGIN } from '../tokens/gallery-plugin.token';
import type {
  GalleryResponse,
  MediaPermissions,
  MediaResult,
} from '../interfaces/gallery-plugin.interface';

export type GalleryErrorCode = 'mediaNotFound' | 'accessDenied' | 'unknown';

/**
 * Error tipado del dominio de la galería. mediaNotFound = la foto original
 * fue borrada/movida de la galería del usuario → la URI del espejo murió.
 */
export class GalleryError extends Error {
  constructor(
    public readonly code: GalleryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GalleryError';
  }
}

/**
 * Único punto de contacto con el plugin nativo Gallery. Los componentes y
 * servicios de dominio NO tocan el plugin directo: acá se mapean los códigos
 * de error nativos (mediaNotFound/accessDenied) a errores tipados.
 */
@Injectable({ providedIn: 'root' })
export class GalleryService {
  private readonly plugin = inject(GALLERY_PLUGIN);

  async getGallery(limit: number, offset: number): Promise<GalleryResponse> {
    try {
      return await this.plugin.getGallery({ limit, offset });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getMediaThumbnail(
    uri: string,
    options: { size: number; format: 'webp' | 'jpeg'; quality?: number },
  ): Promise<MediaResult> {
    try {
      return await this.plugin.getMediaThumbnail({ uri, ...options });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Batch: una sola llamada nativa para N fotos. `thumbs[i]` corresponde a
   * `uris[i]`; una uri fallida llega como null (la reporta el llamador por
   * nombre, sin abortar el resto del lote).
   */
  async getMediaThumbnails(
    uris: string[],
    options: { size: number; format: 'webp' | 'jpeg'; quality?: number },
  ): Promise<Array<MediaResult | null>> {
    try {
      const { thumbs } = await this.plugin.getMediaThumbnails({ uris, ...options });
      return thumbs;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getMediaFull(
    uri: string,
    options?: { maxSize?: number; format?: 'webp' | 'jpeg'; quality?: number },
  ): Promise<MediaResult> {
    try {
      return await this.plugin.getMediaFull({ uri, ...options });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async checkPermissions(): Promise<MediaPermissions> {
    try {
      return await this.plugin.checkPermissions();
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async requestPermissions(): Promise<MediaPermissions> {
    try {
      return await this.plugin.requestPermissions();
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): GalleryError {
    const capacitorError = error as { code?: string; message?: string };
    switch (capacitorError?.code) {
      case 'mediaNotFound':
        return new GalleryError(
          'mediaNotFound',
          'La foto original ya no está en tu galería. Reubicá la imagen o eliminá esta del álbum.',
        );
      case 'accessDenied':
        return new GalleryError(
          'accessDenied',
          'Necesitás dar permiso para leer la galería.',
        );
      default:
        return new GalleryError(
          'unknown',
          capacitorError?.message ?? 'Error inesperado de la galería.',
        );
    }
  }
}
