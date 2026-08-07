import { Injectable } from '@angular/core';
import { ImageRepository } from '../../interfaces/repositories/image.repository';
import { Image } from '../../models/image.model';
import { Position } from '../../models/position.model';

@Injectable({ providedIn: 'root' })
export class RemoteImageRepository implements ImageRepository {
  async getByAlbum(albumId: string): Promise<Image[]> {
    throw new Error('Method not implemented.');
  }
  async getById(id: string): Promise<Image | undefined> {
    throw new Error('Method not implemented.');
  }
  async getLastByAlbum(albumId: string): Promise<Image | undefined> {
    throw new Error('Method not implemented.');
  }
  async add(image: Image): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async updatePosition(id: string, position: Position, z?: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async updateOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async delete(id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
