import type { Album } from '../models/album.model';
import type { Image } from '../models/image.model';
import { DbService } from './db.service';

describe('DbService', () => {
  let service: DbService;

  /** Mock de la tabla Dexie con métodos encadenables */
  function mockTable() {
    const table: Record<string, ReturnType<typeof vi.fn>> = {
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn(),
      sortBy: vi.fn(),
      orderBy: vi.fn(),
      reverse: vi.fn(),
      last: vi.fn(),
      where: vi.fn(),
      equals: vi.fn(),
    };

    // Encadenamiento: orderBy → reverse → toArray
    table['orderBy'].mockReturnValue(table);
    table['reverse'].mockReturnValue(table);
    table['toArray'].mockResolvedValue([]);

    // Encadenamiento: where → equals → sortBy / last / delete
    table['where'].mockReturnValue(table);
    table['equals'].mockReturnValue(table);
    table['sortBy'].mockResolvedValue([]);
    table['last'].mockResolvedValue(undefined);
    table['delete'].mockResolvedValue(undefined);

    return table;
  }

  let albumsTable: ReturnType<typeof mockTable>;
  let imagesTable: ReturnType<typeof mockTable>;
  let transactionSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    albumsTable = mockTable();
    imagesTable = mockTable();
    transactionSpy = vi.fn();

    service = new DbService();

    // Reemplazar el db interno de Dexie por el mock
    (service as unknown as { db: Record<string, unknown> }).db = {
      albums: albumsTable,
      images: imagesTable,
      transaction: transactionSpy,
    };
  });

  // ============================================================
  //  Albums
  // ============================================================

  describe('getAllAlbums', () => {
    it('should order by createdAt descending', async () => {
      const mockData: Album[] = [
        { id: 'a2', name: 'B', createdAt: new Date('2026-02-01'), updatedAt: new Date() },
        { id: 'a1', name: 'A', createdAt: new Date('2026-01-01'), updatedAt: new Date() },
      ];
      albumsTable['toArray'].mockResolvedValue(mockData);

      const result = await service.getAllAlbums();

      expect(albumsTable['orderBy']).toHaveBeenCalledWith('createdAt');
      expect(albumsTable['reverse']).toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });
  });

  describe('getAlbum', () => {
    it('should return album by id', async () => {
      const album: Album = { id: 'a1', name: 'Test', createdAt: new Date(), updatedAt: new Date() };
      albumsTable['get'].mockResolvedValue(album);

      const result = await service.getAlbum('a1');

      expect(albumsTable['get']).toHaveBeenCalledWith('a1');
      expect(result).toBe(album);
    });
  });

  describe('createAlbum', () => {
    it('should generate UUID, timestamps, and persist', async () => {
      const result = await service.createAlbum({ name: 'Nuevo' });

      expect(result.name).toBe('Nuevo');
      expect(result.id).toMatch(/^[0-9a-f-]+$/);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(albumsTable['add']).toHaveBeenCalledWith(result);
    });
  });

  describe('updateAlbum', () => {
    it('should update name and set updatedAt', async () => {
      await service.updateAlbum('a1', { name: 'Renamed' });

      expect(albumsTable['update']).toHaveBeenCalledWith('a1', {
        name: 'Renamed',
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('deleteAlbum', () => {
    it('should delete album and its images in a transaction', async () => {
      transactionSpy.mockImplementation(
        (_mode: string, _t1: unknown, _t2: unknown, fn: () => Promise<void>) => fn(),
      );

      await service.deleteAlbum('a1');

      expect(transactionSpy).toHaveBeenCalled();
      expect(imagesTable['where']).toHaveBeenCalledWith('albumId');
      expect(imagesTable['equals']).toHaveBeenCalledWith('a1');
      expect(imagesTable['delete']).toHaveBeenCalled();
      expect(albumsTable['delete']).toHaveBeenCalledWith('a1');
    });
  });

  // ============================================================
  //  Images
  // ============================================================

  describe('getImagesByAlbum', () => {
    it('should filter by albumId and sort by order', async () => {
      await service.getImagesByAlbum('a1');

      expect(imagesTable['where']).toHaveBeenCalledWith('albumId');
      expect(imagesTable['equals']).toHaveBeenCalledWith('a1');
      expect(imagesTable['sortBy']).toHaveBeenCalledWith('order');
    });
  });

  describe('addImage', () => {
    it('should read file, calculate order, and persist', async () => {
      const file = new File(['fake-bytes'], 'foto.jpg', { type: 'image/jpeg' });
      const lastImage = { id: 'img1', order: 5 } as Image;
      imagesTable['last'].mockResolvedValue(lastImage);

      const result = await service.addImage('a1', file);

      expect(result.albumId).toBe('a1');
      expect(result.filename).toBe('foto.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.order).toBe(6);
      expect(result.data).toBeInstanceOf(Blob);
      expect(result.id).toMatch(/^[0-9a-f-]+$/);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(imagesTable['add']).toHaveBeenCalledWith(result);
    });

    it('should start order at 0 when album has no images', async () => {
      const file = new File(['x'], 'first.jpg', { type: 'image/png' });
      imagesTable['last'].mockResolvedValue(undefined);

      const result = await service.addImage('a1', file);

      expect(result.order).toBe(0);
    });
  });

  describe('updateImagesOrder', () => {
    it('should persist the full sequence inside a transaction', async () => {
      transactionSpy.mockImplementation(
        (_mode: string, _t1: unknown, fn: () => Promise<void>) => fn(),
      );

      await service.updateImagesOrder([
        { id: 'img2', order: 0 },
        { id: 'img3', order: 1 },
        { id: 'img1', order: 2 },
      ]);

      expect(transactionSpy).toHaveBeenCalled();
      expect(imagesTable['update']).toHaveBeenCalledWith('img2', { order: 0 });
      expect(imagesTable['update']).toHaveBeenCalledWith('img3', { order: 1 });
      expect(imagesTable['update']).toHaveBeenCalledWith('img1', { order: 2 });
    });
  });

  describe('deleteImage', () => {
    it('should delete image by id', async () => {
      await service.deleteImage('img1');

      expect(imagesTable['delete']).toHaveBeenCalledWith('img1');
    });
  });
});
