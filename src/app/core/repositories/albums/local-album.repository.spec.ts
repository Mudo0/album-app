import { TestBed } from '@angular/core/testing';
import { LocalAlbumRepository } from './local-album.repository';
import { LocalDbContext } from '../../services/LocalDbContext';
import type { Album } from '../../models/album.model';

describe('LocalAlbumRepository', () => {
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

  const mockAlbum: Album = {
    id: 'a1',
    name: 'Vacaciones',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let albumsTable: ReturnType<typeof mockTable>;
  let imagesTable: ReturnType<typeof mockTable>;
  let transactionSpy: ReturnType<typeof vi.fn>;
  let repo: LocalAlbumRepository;

  beforeEach(async () => {
    albumsTable = mockTable();
    imagesTable = mockTable();
    transactionSpy = vi.fn();

    await TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalDbContext,
          useValue: {
            albums: albumsTable,
            images: imagesTable,
            transaction: transactionSpy,
          },
        },
      ],
    }).compileComponents();

    repo = TestBed.inject(LocalAlbumRepository);
  });

  describe('getAll', () => {
    it('should order by createdAt descending', async () => {
      const mockData: Album[] = [
        { ...mockAlbum, id: 'a2', name: 'B', createdAt: new Date('2026-02-01') },
        mockAlbum,
      ];
      albumsTable['toArray'].mockResolvedValue(mockData);

      const result = await repo.getAll();

      expect(albumsTable['orderBy']).toHaveBeenCalledWith('createdAt');
      expect(albumsTable['reverse']).toHaveBeenCalled();
      expect(result).toEqual(mockData);
    });
  });

  describe('getById', () => {
    it('should return album by id', async () => {
      albumsTable['get'].mockResolvedValue(mockAlbum);

      const result = await repo.getById('a1');

      expect(albumsTable['get']).toHaveBeenCalledWith('a1');
      expect(result).toBe(mockAlbum);
    });
  });

  describe('create', () => {
    it('should persist the album', async () => {
      await repo.create(mockAlbum);

      expect(albumsTable['add']).toHaveBeenCalledWith(mockAlbum);
    });
  });

  describe('update', () => {
    it('should persist only the given changes', async () => {
      await repo.update(mockAlbum, { name: 'Renamed' });

      expect(albumsTable['update']).toHaveBeenCalledWith('a1', {
        name: 'Renamed',
        updatedAt: expect.any(Date),
      });
    });

    it('should persist the full album when no changes given', async () => {
      await repo.update(mockAlbum);

      expect(albumsTable['update']).toHaveBeenCalledWith('a1', {
        ...mockAlbum,
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('delete', () => {
    it('should delete album and its images in a transaction', async () => {
      transactionSpy.mockImplementation(
        (_mode: string, _t1: unknown, _t2: unknown, fn: () => Promise<void>) => fn(),
      );

      await repo.delete('a1');

      expect(transactionSpy).toHaveBeenCalled();
      expect(imagesTable['where']).toHaveBeenCalledWith('albumId');
      expect(imagesTable['equals']).toHaveBeenCalledWith('a1');
      expect(imagesTable['delete']).toHaveBeenCalled();
      expect(albumsTable['delete']).toHaveBeenCalledWith('a1');
    });
  });
});
