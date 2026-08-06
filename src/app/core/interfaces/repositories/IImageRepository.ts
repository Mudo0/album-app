// core/interfaces/image-repository.interface.ts
import { Image } from '../../models/image.model';

export interface IImageRepository {
  getByAlbum(albumId: string): Promise<Image[]>;
  getById(id: string): Promise<Image | undefined>;
  getLastByAlbum(albumId: string): Promise<Image | undefined>;
  add(image: Image): Promise<void>;
  updatePosition(id: string, x: number, y: number, z?: number): Promise<void>;
  updateOrder(updates: Array<{ id: string; order: number }>): Promise<void>;
  delete(id: string): Promise<void>;
}
