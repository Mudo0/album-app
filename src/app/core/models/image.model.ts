export interface Image {
  id: string;
  albumId: string;
  data: Blob;
  thumbnail?: Blob;
  filename: string;
  //tipo de archivo png, jpeg
  mimeType: string;
  order: number;
  createdAt: Date;
}
