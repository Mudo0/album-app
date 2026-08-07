import { Injectable } from '@angular/core';
import { AlbumRepository } from '../../interfaces/repositories/album.repository';
import { Album } from '../../models/album.model';

@Injectable({ providedIn: 'root' })
export class RemoteAlbumRepository implements AlbumRepository {
  update(album: Album, changes?: Partial<Album>): Promise<void> {
   throw new Error('Method not implemented.');
  }
  async getAll(): Promise<Album[]> {
    throw new Error('Method not implemented.');
  }
  async getById(id: string): Promise<Album | undefined> {
    throw new Error('Method not implemented.');
  }
  async create(album: Album): Promise<void> {
    throw new Error('Method not implemented.');
  }
  // async update(album: Album, changes?: Partial<Album>): Promise<void> {
  //   const dataToSave = changes ?? album;
  //   // Si hay changes específicos, hacés PATCH; si mandas todo, hacés PUT (o PATCH con todo)
  //   const method = changes ? 'patch' : 'put';
  //   await firstValueFrom(this.http[method](`${this.apiUrl}/${album.id}`, dataToSave));
  // }
  async delete(id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
