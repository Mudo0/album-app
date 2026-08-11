import { Image } from '../../models/image.model';
import { Position } from '../../models/position.model';

export interface ImageRepository {
  getByAlbum(albumId: string): Promise<Image[]>;
  getById(id: string): Promise<Image | undefined>;
  getLastByAlbum(albumId: string): Promise<Image | undefined>;
  add(image: Image): Promise<void>;
  updatePosition(id: string, position: Position): Promise<void>;
  updateOrder(updates: Array<{ id: string; order: number }>): Promise<void>;
  delete(id: string): Promise<void>;
}
