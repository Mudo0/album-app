/**
 * Item de la galería nativa tal como lo devuelve GalleryPlugin.getGallery.
 * SOLO metadatos: el picker pide los thumbnails bajo demanda con
 * getMediaThumbnails (ventana visible + cache LRU), nunca vienen acá.
 */
export interface GalleryMedia {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  dateAdded: number;
}
