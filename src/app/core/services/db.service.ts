import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import type { Album } from '../models/album.model';
import type { Image } from '../models/image.model';

class AlbumDB extends Dexie {
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

@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly db = new AlbumDB();

  // ============================================================
  //  Albums
  // ============================================================

  async getAllAlbums(): Promise<Album[]> {
    return this.db.albums.orderBy('createdAt').reverse().toArray();
  }

  async getAlbum(id: string): Promise<Album | undefined> {
    return this.db.albums.get(id);
  }

  async createAlbum(data: Omit<Album, 'id' | 'createdAt' | 'updatedAt'>): Promise<Album> {
    const now = new Date();
    const album: Album = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await this.db.albums.add(album);
    return album;
  }

  async updateAlbum(
    id: string,
    changes: Partial<Pick<Album, 'name' | 'coverImageId'>>,
  ): Promise<void> {
    await this.db.albums.update(id, { ...changes, updatedAt: new Date() });
  }

  async deleteAlbum(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.albums, this.db.images, async () => {
      await this.db.images.where('albumId').equals(id).delete();
      await this.db.albums.delete(id);
    });
  }

  // ============================================================
  //  Images
  // ============================================================

  async getImagesByAlbum(albumId: string): Promise<Image[]> {
    return this.db.images.where('albumId').equals(albumId).sortBy('order');
  }

  async getImage(id: string): Promise<Image | undefined> {
    return this.db.images.get(id);
  }

  async addImage(albumId: string, file: File): Promise<Image> {
    const data = await file.arrayBuffer();
    const blob = new Blob([data], { type: file.type });

    const lastImage = await this.db.images
      .where('albumId')
      .equals(albumId)
      .last();

    const image: Image = {
      id: crypto.randomUUID(),
      albumId,
      data: blob,
      filename: file.name,
      mimeType: file.type,
      order: (lastImage?.order ?? -1) + 1,
      createdAt: new Date(),
    };

    await this.db.images.add(image);
    return image;
  }

  async deleteImage(id: string): Promise<void> {
    await this.db.images.delete(id);
  }
}
