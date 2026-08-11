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
  }
}






