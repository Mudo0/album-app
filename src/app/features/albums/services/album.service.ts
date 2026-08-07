import { Injectable, inject } from '@angular/core';
import { ALBUM_REPOSITORY } from '../../../core/tokens/album-repository.token';
import { Album } from '../../../core/models/album.model';

@Injectable({ providedIn: 'root' })
export class AlbumService {
  // Inyectamos el Token, Angular nos devolverá la instancia que decidió el Factory
  private readonly albumRepo = inject(ALBUM_REPOSITORY);

  async getAll(): Promise<Album[]> {
    return this.albumRepo.getAll();
  }

  async create(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
    const now = new Date();
    const newAlbum: Album = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await this.albumRepo.create(newAlbum);

    return newAlbum;
  }

  async getById(id: string): Promise<Album | undefined> {
    return await this.albumRepo.getById(id);
  }
  async updateName(album: Album, newName: string): Promise<void> {
    const changes: Partial<Album> = { name: newName };
    await this.albumRepo.update(album, changes);
  }

  async updateFull(album: Album): Promise<void> {
    await this.albumRepo.update(album);
  }

  async remove(id: string): Promise<void> {
    await this.albumRepo.delete(id);
  }
}
