import { Position } from './position.model';

export interface Image {
  id: string;
  albumId: string;
  /** URI nativa del MediaStore (content://media/...) — espejo de la galería, sin copias. */
  sourceUri: string;
  /** Thumbnail liviano (webp) persistido para el álbum y la lista. */
  thumbnail: Blob;
  /** MimeType del thumbnail guardado (image/webp). */
  thumbnailMime: string;
  filename: string;
  mimeType: string;
  order: number;
  position: Position;
  createdAt: Date;
}
