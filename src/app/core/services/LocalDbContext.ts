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

// ============================================================
//  Albums
// ============================================================

// async getAllAlbums(): Promise<Album[]> {
//   return this.db.albums.orderBy('createdAt').reverse().toArray();
// }

// async getAlbum(id: string): Promise<Album | undefined> {
//   return this.db.albums.get(id);
// }

// async createAlbum(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
//   const now = new Date();
//   const album: Album = {
//     ...data,
//     id: crypto.randomUUID(),
//     createdAt: now,
//     updatedAt: now,
//   };

//   await this.db.albums.add(album);
//   return album;
// }

// async updateAlbum(
//   id: string,
//   changes: Partial<Pick<Album, 'name' | 'coverImageId'>>,
// ): Promise<void> {
//   await this.db.albums.update(id, { ...changes, updatedAt: new Date() });
// }

// async deleteAlbum(id: string): Promise<void> {
//   await this.db.transaction('rw', this.db.albums, this.db.images, async () => {
//     await this.db.images.where('albumId').equals(id).delete();
//     await this.db.albums.delete(id);
//   });
// }

// ============================================================
//  Images
// ============================================================


//   // Inserción plana, la entidad Image ya viene armada
//   async insertImage(image: Image): Promise<void> {
//     
//   }

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

//   async updateImagePosition(id: string, x: number, y: number): Promise<void> {
//     
//   }

//   async updateImagesOrder(updates: Array<{ id: string; order: number }>): Promise<void> {
//     
//   }

//   async deleteImage(id: string): Promise<void> {
//     
//   }
// }
