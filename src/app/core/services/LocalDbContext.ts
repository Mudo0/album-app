import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import type { Album } from '../models/album.model';
import type { Image } from '../models/image.model';

@Injectable({ providedIn: 'root' })
export class LocalDbContext extends Dexie {
  albums!: Table<Album, string>;
  images!: Table<Image, string>;

  constructor() {
    super('AlbumDB');

    this.version(1).stores({
      albums: 'id, createdAt',
      images: 'id, albumId, order',
    });

    // v2: los datos de alpha son volátiles. Las imágenes legacy (guardadas
    // como Blob completo en `data`, sin thumbnail/sourceUri) rompen el render
    // nuevo (espejo de galería): se purgan una única vez al abrir la app.
    // Los álbumes y las imágenes nuevas (thumbnail + sourceUri) se conservan.
    this.version(2)
      .stores({
        albums: 'id, createdAt',
        images: 'id, albumId, order',
      })
      .upgrade(async (tx) => {
        await tx
          .table('images')
          .filter((img) => !img.thumbnail || !img.sourceUri)
          .delete();
      });
  }
}






