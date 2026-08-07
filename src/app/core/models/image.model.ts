import { Position } from './position.model';

export interface Image {
  id: string;
  albumId: string;
  data: Blob;
  thumbnail?: Blob;
  filename: string;
  mimeType: string;
  order: number;
  position: Position;
  createdAt: Date;
}
