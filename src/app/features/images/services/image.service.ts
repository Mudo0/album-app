import { Injectable, inject } from '@angular/core';
import type { Image } from '../models/image.model';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly db = inject(DbService);

  getByAlbum(albumId: string): Promise<Image[]> {
    return this.db.getImagesByAlbum(albumId);
  }

  getById(id: string): Promise<Image | undefined> {
    return this.db.getImage(id);
  }

  add(albumId: string, file: File): Promise<Image> {
    return this.db.addImage(albumId, file);
  }

  remove(id: string): Promise<void> {
    return this.db.deleteImage(id);
  }

  updatePosition(id: string, x: number, y: number): Promise<void> {
    return this.db.updateImagePosition(id, x, y);
  }
}
