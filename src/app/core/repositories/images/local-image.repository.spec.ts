import { TestBed } from '@angular/core/testing';
import { LocalImageRepository } from './local-image.repository';
import { LocalDbContext } from '../../services/LocalDbContext';
import type { Image } from '../../models/image.model';

describe('LocalImageRepository', () => {
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

  const mockImage: Image = {
    id: 'img1',
    albumId: 'a1',
    data: new Blob(['fake'], { type: 'image/jpeg' }),
    filename: 'foto.jpg',
    mimeType: 'image/jpeg',
    order: 0,
    position: { x: 20, y: 20 },
    createdAt: new Date('2026-01-01'),
  };

  let imagesTable: ReturnType<typeof mockTable>;
  let transactionSpy: ReturnType<typeof vi.fn>;
  let repo: LocalImageRepository;

  beforeEach(async () => {
    imagesTable = mockTable();
    transactionSpy = vi.fn();

    await TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalDbContext,
          useValue: {
            albums: mockTable(),
            images: imagesTable,
            transaction: transactionSpy,
          },
        },
      ],
    }).compileComponents();

    repo = TestBed.inject(LocalImageRepository);
  });

  describe('getByAlbum', () => {
    it('should filter by albumId and sort by order', async () => {
      await repo.getByAlbum('a1');

      expect(imagesTable['where']).toHaveBeenCalledWith('albumId');
      expect(imagesTable['equals']).toHaveBeenCalledWith('a1');
      expect(imagesTable['sortBy']).toHaveBeenCalledWith('order');
    });
  });

  describe('getById', () => {
    it('should return image by id', async () => {
      imagesTable['get'].mockResolvedValue(mockImage);

      const result = await repo.getById('img1');

      expect(imagesTable['get']).toHaveBeenCalledWith('img1');
      expect(result).toBe(mockImage);
    });
  });

  describe('getLastByAlbum', () => {
    it('should return the last image of the album', async () => {
      await repo.getLastByAlbum('a1');

      expect(imagesTable['where']).toHaveBeenCalledWith('albumId');
      expect(imagesTable['equals']).toHaveBeenCalledWith('a1');
      expect(imagesTable['last']).toHaveBeenCalled();
    });
  });

  describe('add', () => {
    it('should persist the given image', async () => {
      await repo.add(mockImage);

      expect(imagesTable['add']).toHaveBeenCalledWith(mockImage);
    });
  });

  describe('updatePosition', () => {
    it('should persist the position object', async () => {
      await repo.updatePosition('img1', { x: 150, y: 300 });

      expect(imagesTable['update']).toHaveBeenCalledWith('img1', {
        position: { x: 150, y: 300 },
      });
    });
  });

  describe('updateOrder', () => {
    it('should persist the full sequence inside a transaction', async () => {
      transactionSpy.mockImplementation(
        (_mode: string, _t1: unknown, fn: () => Promise<void>) => fn(),
      );

      await repo.updateOrder([
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

  describe('delete', () => {
    it('should delete image by id', async () => {
      await repo.delete('img1');

      expect(imagesTable['delete']).toHaveBeenCalledWith('img1');
    });
  });
});
