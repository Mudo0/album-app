import { Image } from './image.model';

export interface StickerBounds {
  /** Posición X relativa al canvas (px). */
  x: number;
  /** Posición Y relativa al canvas (px). */
  y: number;
  /** Ancho del sticker en el DOM (px). */
  width: number;
  /** Alto del sticker en el DOM (px). */
  height: number;
}

export interface StickerImage extends Image {
  x: number;
  y: number;
  objectUrl: string;
}
