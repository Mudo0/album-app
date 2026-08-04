import { Injectable, inject } from '@angular/core';
import type { Album } from '../models/album.model';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class AlbumService {
  private readonly db = inject(DbService);

  getAll(): Promise<Album[]> {
    return this.db.getAllAlbums();
  }

  getById(id: string): Promise<Album | undefined> {
    return this.db.getAlbum(id);
  }

  create(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
    return this.db.createAlbum(data);
  }

  update(
    id: string,
    changes: Partial<Pick<Album, 'name' | 'coverImageId'>>,
  ): Promise<void> {
    return this.db.updateAlbum(id, changes);
  }

  delete(id: string): Promise<void> {
    return this.db.deleteAlbum(id);
  }
}
