import { Album } from '../../models/album.model';

export interface AlbumRepository {
  getAll(): Promise<Album[]>;
  getById(id: string): Promise<Album | undefined>;
  create(album: Album): Promise<void>;
  update(album: Album): Promise<void>;
  delete(id: string): Promise<void>;
}
