import { Injectable, inject } from '@angular/core';
import { Image } from '../../models/image.model';
import { DbService } from '../../services/db.service';
import { IImageRepository } from '../../interfaces/repositories/IImageRepository';

@Injectable({ providedIn: 'root' })
export class LocalImageRepository implements IImageRepository {
  private readonly dbService = inject(DbService);

  async getByAlbum(albumId: string): Promise<Image[]> {
    return this.dbService.getImagesByAlbum(albumId);
  }

  async getById(id: string): Promise<Image | undefined> {
    return this.dbService.getImage(id);
  }

  async getLastByAlbum(albumId: string): Promise<Image | undefined> {
    return this.dbService.getLastImageByAlbum(albumId);
  }

  async add(image: Image): Promise<void> {
    // El repositorio recibe la entidad Image ya armada por el servicio superior
    await this.dbService.insertImage(image);
  }

  async updatePosition(id: string, x: number, y: number): Promise<void> {
    await this.dbService.updateImagePosition(id, x, y);
  }

  async updateOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    await this.dbService.updateImagesOrder(updates);
  }

  async delete(id: string): Promise<void> {
    await this.dbService.deleteImage(id);
  }
}
