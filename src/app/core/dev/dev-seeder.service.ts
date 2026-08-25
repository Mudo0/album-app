import { Injectable, inject, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { AlbumService } from '../../features/albums/services/album.service';
import { IMAGE_REPOSITORY } from '../tokens/image-repository.token';
import { Image } from '../models/image.model';

/** Marca en localStorage: el seed corre UNA sola vez por navegador. */
const SEED_FLAG = 'dev:album-seeded-v1';

/** Cantidad de stickers de prueba — suficientes para ver solapamiento. */
const TEST_IMAGE_COUNT = 8;

/** Lado del canvas de prueba — mismo tamaño que ALBUM_THUMB_SIZE del flujo real. */
const TEST_IMAGE_SIZE = 512;

/**
 * Seeder de datos de prueba para desarrollo en DESKTOP (web).
 *
 * En desktop no se puede cargar imágenes (la galería es un plugin nativo),
 * así que este servicio genera placeholders con canvas y los persiste por la
 * misma puerta que el flujo real: AlbumService + IMAGE_REPOSITORY (Dexie).
 *
 * Guardas: solo corre con isDevMode() + plataforma web + una única vez por
 * navegador (flag en localStorage). Borrar la key 'dev:album-seeded-v1'
 * reintenta la siembra en el próximo arranque.
 */
@Injectable({ providedIn: 'root' })
export class DevSeederService {
  private readonly albumService = inject(AlbumService);
  private readonly imageRepo = inject(IMAGE_REPOSITORY);

  async seedOnceForDev(): Promise<void> {
    if (!isDevMode()) return;
    if (Capacitor.isNativePlatform()) return;
    if (localStorage.getItem(SEED_FLAG)) return;

    // Se marca ANTES de sembrar: si recargan a mitad del await no se duplica.
    // Tradeoff aceptado: si algo falla a mitad, quedan datos parciales sin
    // reintento automático (borrar la key lo fuerza de nuevo).
    localStorage.setItem(SEED_FLAG, '1');

    try {
      const album = await this.albumService.create({ name: 'Álbum de prueba' });
      const firstImageId = await this.seedImages(album.id);

      // Portada = primera imagen, mismo campo que setea el flujo real
      await this.albumService.updateFull({ ...album, coverImageId: firstImageId });
    } catch (error) {
      console.warn('[dev-seeder] Falló la siembra de datos de prueba:', error);
    }
  }

  /** Persiste las imágenes de prueba y devuelve el id de la primera. */
  private async seedImages(albumId: string): Promise<string> {
    let firstId = '';

    for (let i = 0; i < TEST_IMAGE_COUNT; i++) {
      const thumbnail = await this.drawTestImage(i);
      const order = i;

      const image: Image = {
        id: crypto.randomUUID(),
        albumId,
        // URI fake: en web nunca se resuelve (el viewer depende del plugin nativo)
        sourceUri: `dev://seed/${i + 1}`,
        thumbnail,
        thumbnailMime: thumbnail.type,
        filename: `test-${i + 1}.${thumbnail.type === 'image/webp' ? 'webp' : 'png'}`,
        mimeType: thumbnail.type,
        order,
        // Misma fórmula de dispersión que ImageService.addFromGallery
        position: {
          x: 20 + ((order * 55) % 240),
          y: 20 + ((order * 35) % 560),
        },
        createdAt: new Date(),
      };

      await this.imageRepo.add(image);

      if (i === 0) firstId = image.id;
    }

    return firstId;
  }

  /**
   * Dibuja un placeholder cuadrado con canvas: color HSL distinto por índice,
   * borde blanco (para ver el límite del sticker sobre la grilla del papel) y
   * el número grande al centro. Devuelve el canvas como Blob.
   *
   * `toBlob('image/webp')` cae a PNG automáticamente donde no hay codificador
   * webp — el type real viaja en blob.type y el filename se ajusta a eso.
   */
  private drawTestImage(index: number): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = TEST_IMAGE_SIZE;
    canvas.height = TEST_IMAGE_SIZE;

    const ctx = canvas.getContext('2d')!;
    const hue = Math.round((360 / TEST_IMAGE_COUNT) * index);

    ctx.fillStyle = `hsl(${hue} 70% 60%)`;
    ctx.fillRect(0, 0, TEST_IMAGE_SIZE, TEST_IMAGE_SIZE);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, TEST_IMAGE_SIZE - 12, TEST_IMAGE_SIZE - 12);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = 'bold 180px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), TEST_IMAGE_SIZE / 2, TEST_IMAGE_SIZE / 2);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob devolvió null'))),
        'image/webp',
        0.85,
      );
    });
  }
}
