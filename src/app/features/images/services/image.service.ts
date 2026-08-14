import { Injectable, inject } from '@angular/core';
import { Image } from '../../../core/models/image.model';

import { IMAGE_REPOSITORY } from '../../../core/tokens/image-repository.token';
import { Position } from '../../../core/models/position.model';
import { GalleryService } from '../../../core/services/gallery.service';
import type { GalleryMedia } from '../../../core/interfaces/gallery-plugin.interface';
import { base64ToBlob } from '../../../core/utils/base64.util';

/** Lado máximo del thumbnail webp que se persiste para el álbum. */
export const ALBUM_THUMB_SIZE = 512;

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly imageRepo = inject(IMAGE_REPOSITORY);
  private readonly gallery = inject(GalleryService);

  /**
   * Agrega una foto de la galería como ESPEJO: persiste la sourceUri nativa y
   * un thumbnail webp liviano. La imagen full nunca se copia ni cruza el
   * puente JS — el plugin la redimensiona y comprime en Kotlin.
   */
  async addFromGallery(albumId: string, media: GalleryMedia): Promise<Image> {
    const thumb = await this.gallery.getMediaThumbnail(media.uri, {
      size: ALBUM_THUMB_SIZE,
      format: 'webp',
    });

    // base64 -> Blob y soltamos el string apenas termina (memoria/OOM: el
    // string base64 vive en el heap hasta que el GC lo barra)
    const thumbnail = base64ToBlob(thumb.data, thumb.mimeType);

    const lastImage = await this.imageRepo.getLastByAlbum(albumId);

    const order = (lastImage?.order ?? -1) + 1;
    const x = 20 + ((order * 55) % 240);
    const y = 20 + ((order * 35) % 560);

    const image: Image = {
      id: crypto.randomUUID(),
      albumId,
      sourceUri: media.uri,
      thumbnail,
      thumbnailMime: thumb.mimeType,
      filename: media.name,
      mimeType: media.mimeType,
      order,
      position: { x, y },
      createdAt: new Date(),
    };

    await this.imageRepo.add(image);
    return image;
  }

  /**
   * Resuelve la imagen full para el viewer. Si la URI murió (foto borrada de
   * la galería), el GalleryService lanza GalleryError(mediaNotFound) — el
   * componente decide si avisar para reubicar o eliminar la imagen.
   */
  async resolveSource(image: Image): Promise<string> {
    if (image.sourceUri) {
      const full = await this.gallery.getMediaFull(image.sourceUri);
      return `data:${full.mimeType};base64,${full.data}`;
    }
    if (image.data) {
      return URL.createObjectURL(image.data);
    }
    throw new Error('La imagen no tiene un origen disponible.');
  }

  async getLastByAlbum(albumId: string): Promise<Image | undefined> {
    return await this.imageRepo.getLastByAlbum(albumId);
  }
  async updatePosition(id: string, position: Position): Promise<void> {
    await this.imageRepo.updatePosition(id, position);
  }

  async updateOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    await this.imageRepo.updateOrder(updates);
  }

  async getByAlbum(albumId: string): Promise<Image[]> {
    return await this.imageRepo.getByAlbum(albumId);
  }

  async remove(id: string): Promise<void> {
    // Con el espejo no hay archivo propio que borrar: la foto vive en la
    // galería del usuario y acá solo cae la fila (sourceUri + thumbnail).
    await this.imageRepo.delete(id);
  }
}
