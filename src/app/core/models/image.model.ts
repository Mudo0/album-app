export interface Image {
  id: string;
  albumId: string;
  data: Blob;
  thumbnail?: Blob;
  filename: string;
  mimeType: string;
  order: number;
  x?: number;
  y?: number;
  createdAt: Date;
}
