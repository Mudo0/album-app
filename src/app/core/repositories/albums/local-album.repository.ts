import { inject, Injectable } from '@angular/core';
import { AlbumRepository } from '../../interfaces/repositories/album.repository';
import { Album } from '../../models/album.model';
import { LocalDbContext } from '../../services/LocalDbContext';

@Injectable({ providedIn: 'root' })
export class LocalAlbumRepository implements AlbumRepository {
  private db = inject(LocalDbContext);
  async getAll(): Promise<Album[]> {
    return this.db.albums.orderBy('createdAt').reverse().toArray();
  }
  async getById(id: string): Promise<Album | undefined> {
    return this.db.albums.get(id);
  }
  async create(album: Album): Promise<void> {
    await this.db.albums.add(album);
  }
  async update(album: Album, changes?: Partial<Album>): Promise<void> {
    const dataToSave = changes ?? album;
    await this.db.albums.update(album.id, { ...dataToSave, updatedAt: new Date() });
  }
  async delete(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.albums, this.db.images, async () => {
      await this.db.images.where('albumId').equals(id).delete();
      await this.db.albums.delete(id);
    });
  }
}
