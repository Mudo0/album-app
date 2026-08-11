import { Injectable, inject } from '@angular/core';
import { Image } from '../../models/image.model';
import { LocalDbContext } from '../../services/LocalDbContext';
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

  async getLastByAlbum(albumId: string): Promise<Image | undefined> {
    return this.db.images.where('albumId').equals(albumId).last();
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
