import { Injectable, inject } from '@angular/core';
import { Image } from '../../models/image.model';
import { LocalDbContext } from '../../services/LocalDbContext';
import { IImageRepository } from '../../interfaces/repositories/IImageRepository';

@Injectable({ providedIn: 'root' })
export class LocalImageRepository implements IImageRepository {
  private readonly db = inject(LocalDbContext);

  async getByAlbum(albumId: string): Promise<Image[]> {
    return this.db.images.where('albumId').equals(albumId).sortBy('order');
  }

  async getById(id: string): Promise<Image | undefined> {
    return this.db.images.get(id);
  }

  // Devuelve la última imagen para que ImageService pueda calcular el 'order', 'x' e 'y'
  async getLastByAlbum(albumId: string): Promise<Image | undefined> {
    return this.db.images.where('albumId').equals(albumId).last();
  }

  async add(image: Image): Promise<void> {
    // El repositorio recibe la entidad Image ya armada por el servicio superior
    await this.db.images.add(image);
  }

  async updatePosition(id: string, x: number, y: number): Promise<void> {
    await this.db.images.update(id, { x, y });
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
