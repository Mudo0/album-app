import { Injectable } from '@angular/core';
import { AlbumRepository } from '../../interfaces/repositories/album.repository';
import { Album } from '../../models/album.model';

@Injectable({ providedIn: 'root' })
export class RemoteAlbumRepository implements AlbumRepository {
  async getAll(): Promise<Album[]> {
    throw new Error('Method not implemented.');
  }
  async getById(id: string): Promise<Album | undefined> {
    throw new Error('Method not implemented.');
  }
  async create(album: Album): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async update(album: Album): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async delete(id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
