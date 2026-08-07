import { Injectable } from '@angular/core';
import { IAlbumRepository } from '../../interfaces/repositories/IAlbumRepository';
import { Album } from '../../models/album.model';

@Injectable({ providedIn: 'root' })
export class RemoteAlbumRepository implements IAlbumRepository {
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
