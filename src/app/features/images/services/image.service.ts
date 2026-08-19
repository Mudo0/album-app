import { Injectable, inject } from '@angular/core';
import { Image } from '../../../core/models/image.model';

import { IMAGE_REPOSITORY } from '../../../core/tokens/image-repository.token';
import { Position } from '../../../core/models/position.model';
import { GalleryService } from '../../../core/services/gallery.service';
import { ClipboardService } from '../../../core/services/clipboard.service';
import type { GalleryMedia } from '../../../core/interfaces/gallery-plugin.interface';
import { base64ToBlob } from '../../../core/utils/base64.util';

/** Lado máximo del thumbnail webp que se persiste para el álbum. */
export const ALBUM_THUMB_SIZE = 512;

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly imageRepo = inject(IMAGE_REPOSITORY);
  private readonly gallery = inject(GalleryService);
  private readonly clipboard = inject(ClipboardService);

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
   * Agrega un LOTE de fotos con UNA sola llamada nativa (`getMediaThumbnails`):
   * los thumbs se generan en paralelo en Kotlin (pool de 4) y el puente se
   * cruza una vez por lote, no una vez por foto.
   *
   * El `order` se calcula con UN solo `getLastByAlbum` (no uno por foto) y los
   * `add` a Dexie son secuenciales — IndexedDB serializa las transacciones de
   * todos modos, no se gana nada en paralelo ahí. Cada base64 → Blob se suelta
   * apenas termina (ver base64.util.ts).
   *
   * Las fotos que fallen (null en el batch nativo) se reportan por nombre SIN
   * abortar el resto del lote: al final lanza un error agregado con los
   * nombres, y el llamador decide si avisarlo.
   */
  async addManyFromGallery(albumId: string, medias: GalleryMedia[]): Promise<void> {
    if (medias.length === 0) return;

    const thumbs = await this.gallery.getMediaThumbnails(
      medias.map((m) => m.uri),
      { size: ALBUM_THUMB_SIZE, format: 'webp' },
    );

    let order = (await this.imageRepo.getLastByAlbum(albumId))?.order ?? -1;
    const failed: string[] = [];

    for (let i = 0; i < medias.length; i++) {
      const media = medias[i];
      const thumb = thumbs[i];

      // Posición preservada por el plugin: null = esa foto falló (URI muerta,
      // thumb sin indexar, etc.) → se avisa y se sigue con la siguiente.
      if (thumb == null) {
        failed.push(media.name);
        continue;
      }

      order += 1;
      const x = 20 + ((order * 55) % 240);
      const y = 20 + ((order * 35) % 560);

      const image: Image = {
        id: crypto.randomUUID(),
        albumId,
        sourceUri: media.uri,
        thumbnail: base64ToBlob(thumb.data, thumb.mimeType),
        thumbnailMime: thumb.mimeType,
        filename: media.name,
        mimeType: media.mimeType,
        order,
        position: { x, y },
        createdAt: new Date(),
      };

      await this.imageRepo.add(image);
    }

    if (failed.length > 0) {
      throw new Error(
        `No se pudieron guardar ${failed.length} foto(s): ${failed.join(', ')}`,
      );
    }
  }

  /**
   * Resuelve la imagen full para el viewer a través del plugin (redimensionada
   * y comprimida en Kotlin, la full nunca cruza el puente). Si la URI murió
   * (foto borrada de la galería), el GalleryService lanza
   * GalleryError(mediaNotFound) — el componente decide si avisar para
   * reubicar o eliminar la imagen.
   */
  async resolveSource(image: Image): Promise<string> {
    const full = await this.gallery.getMediaFull(image.sourceUri);
    return `data:${full.mimeType};base64,${full.data}`;
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

  /**
   * Copia la imagen original al portapapeles del sistema.
   * La operación completa ocurre en Kotlin — la WebView solo recibe
   * success/error. El plugin vibra al completar (feedback háptico).
   */
  async copyToClipboard(image: Image): Promise<void> {
    await this.clipboard.copyImageToClipboard(image.sourceUri);
  }
}
