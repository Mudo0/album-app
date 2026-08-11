import { Image } from './image.model';
export interface StickerImage extends Image {
  x: number;
  y: number;
  objectUrl: string;
}
