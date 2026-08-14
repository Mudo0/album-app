import { Position } from './position.model';

export interface Image {
  id: string;
  albumId: string;
  /** URI nativa del MediaStore (content://media/...) — espejo de la galería, sin copias. */
  sourceUri?: string;
  /** Thumbnail liviano (webp) persistido para el álbum. */
  thumbnail?: Blob;
  /** MimeType del thumbnail guardado (image/webp | image/jpeg). */
  thumbnailMime?: string;
  /** LEGACY: fotos viejas guardadas como blob completo. Solo lectura. */
  data?: Blob;
  filename: string;
  mimeType: string;
  order: number;
  position: Position;
  createdAt: Date;
}
