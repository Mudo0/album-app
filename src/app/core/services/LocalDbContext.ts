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



//   async addImage(albumId: string, file: File): Promise<Image> {
//     const data = await file.arrayBuffer();
//     const blob = new Blob([data], { type: file.type });

//     const lastImage = await this.db.images.where('albumId').equals(albumId).last();

//     const order = (lastImage?.order ?? -1) + 1;
//     const x = 20 + ((order * 55) % 240);
//     const y = 20 + ((order * 35) % 560);

//     const image: Image = {
//       id: crypto.randomUUID(),
//       albumId,
//       data: blob,
//       filename: file.name,
//       mimeType: file.type,
//       order,
//       x,
//       y,
//       createdAt: new Date(),
//     };

//     await this.db.images.add(image);
//     return image;
//   }


