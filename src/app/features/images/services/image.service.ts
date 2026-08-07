import { Injectable, inject } from '@angular/core';
import { Image } from '../../../core/models/image.model';

import { IMAGE_REPOSITORY } from '../../../core/tokens/image-repository.token';
import { Position } from '../../../core/models/position.model';
@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly imageRepo = inject(IMAGE_REPOSITORY);

  async addImage(albumId: string, file: File): Promise<Image> {
    const data = await file.arrayBuffer();
    const blob = new Blob([data], { type: file.type });

    const lastImage = await this.imageRepo.getLastByAlbum(albumId);

    const order = (lastImage?.order ?? -1) + 1;
    const x = 20 + ((order * 55) % 240);
    const y = 20 + ((order * 35) % 560);

    const image: Image = {
      id: crypto.randomUUID(),
      albumId,
      data: blob,
      filename: file.name,
      mimeType: file.type,
      order,
      position: { x, y },
      createdAt: new Date(),
    };

    await this.imageRepo.add(image);
    return image;
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

  async deleteImage(id: string): Promise<void> {
    await this.imageRepo.delete(id);
  }
}
