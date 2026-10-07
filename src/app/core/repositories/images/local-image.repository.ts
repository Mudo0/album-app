import { Injectable, inject } from '@angular/core';
import { Image } from '../../models/image.model';
import { LocalDbContext } from '../../services/local-db.context';
import { ImageRepository } from '../../interfaces/repositories/image.repository';
import { Position } from '../../models/position.model';

@Injectable({ providedIn: 'root' })
export class LocalImageRepository implements ImageRepository {
  private readonly db = inject(LocalDbContext);

  async getByAlbum(albumId: string): Promise<Image[]> {
    return this.db.images.where('albumId').equals(albumId).sortBy('order');
  }

  async getById(id: string): Promise<Image | undefined> {
    return this.db.images.get(id);
  }

  /**
   * Última imagen = la de mayor `order`, NO la última del índice `albumId`
   * (`.last()` recorre ese índice en orden de primary key → UUID aleatorio y
   * podía devolver una imagen que no es la de arriba de todo, colisionando el
   * próximo order al agregar). `sortBy('order')` ordena por el campo y
   * `.at(-1)` toma el mayor.
   */
  async getLastByAlbum(albumId: string): Promise<Image | undefined> {
    const images = await this.db.images
      .where('albumId')
      .equals(albumId)
      .sortBy('order');
    return images.at(-1);
  }

  async add(image: Image): Promise<void> {
    
    await this.db.images.add(image);
  }

  async updatePosition(id: string, position: Position): Promise<void> {
    await this.db.images.update(id, { position });
  }

  async updateOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    await this.db.transaction('rw', this.db.images, async () => {
      for (const { id, order } of updates) {
        await this.db.images.update(id, { order });
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.images.delete(id);
  }
}
