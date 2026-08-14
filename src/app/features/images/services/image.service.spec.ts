import { TestBed } from '@angular/core/testing';
import { ImageService, ALBUM_THUMB_SIZE } from './image.service';
import { IMAGE_REPOSITORY } from '../../../core/tokens/image-repository.token';
import { GalleryService } from '../../../core/services/gallery.service';
import type { GalleryMedia } from '../../../core/interfaces/gallery-plugin.interface';
import { GalleryError } from '../../../core/services/gallery.service';

describe('ImageService', () => {
  const repo = {
    getLastByAlbum: vi.fn(),
    add: vi.fn(),
    getByAlbum: vi.fn(),
    updatePosition: vi.fn(),
    updateOrder: vi.fn(),
    delete: vi.fn(),
  };

  const gallery = {
    getGallery: vi.fn(),
    getMediaThumbnail: vi.fn(),
    getMediaFull: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
  };

  let service: ImageService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: IMAGE_REPOSITORY, useValue: repo },
        { provide: GalleryService, useValue: gallery },
      ],
    });
    service = TestBed.inject(ImageService);
  });

  function createMedia(id = 'media-1'): GalleryMedia {
    return {
      id,
      uri: `content://media/external/images/media/${id}`,
      name: 'foto.jpg',
      mimeType: 'image/jpeg',
      width: 4000,
      height: 3000,
      dateAdded: 1700000000,
      thumbnail: 'aGVsbG8=', // base64 de "hello"
    };
  }

  it('should persist a mirror: sourceUri + webp thumbnail, not the full image', async () => {
    vi.mocked(gallery.getMediaThumbnail).mockResolvedValue({
      data: 'aGVsbG8=',
      mimeType: 'image/webp',
      width: 512,
      height: 384,
    });
    vi.mocked(repo.getLastByAlbum).mockResolvedValue(undefined);
    vi.mocked(repo.add).mockResolvedValue(undefined as never);

    const media = createMedia();
    const saved = await service.addFromGallery('a1', media);

    expect(gallery.getMediaThumbnail).toHaveBeenCalledWith(media.uri, {
      size: ALBUM_THUMB_SIZE,
      format: 'webp',
    });

    const persisted = vi.mocked(repo.add).mock.calls[0][0];
    expect(persisted.sourceUri).toBe(media.uri);
    expect(persisted.thumbnailMime).toBe('image/webp');
    expect(persisted.filename).toBe('foto.jpg');
    expect(persisted.order).toBe(0);
    expect(persisted.position).toEqual({ x: 20, y: 20 });
    expect(persisted.thumbnail).toBeInstanceOf(Blob);
    await expect(persisted.thumbnail.text()).resolves.toBe('hello');
    expect(saved).toBe(persisted);
  });

  it('should continue the order sequence from the last image', async () => {
    vi.mocked(gallery.getMediaThumbnail).mockResolvedValue({
      data: 'aGVsbG8=',
      mimeType: 'image/webp',
      width: 512,
      height: 384,
    });
    vi.mocked(repo.getLastByAlbum).mockResolvedValue({
      id: 'prev',
      albumId: 'a1',
      data: new Blob(),
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      order: 3,
      position: { x: 0, y: 0 },
      createdAt: new Date(),
    });

    await service.addFromGallery('a1', createMedia());

    const persisted = vi.mocked(repo.add).mock.calls[0][0];
    expect(persisted.order).toBe(4);
  });

  it('should resolve a mirror source through the native full compression', async () => {
    vi.mocked(gallery.getMediaFull).mockResolvedValue({
      data: 'ZGF0YQ==',
      mimeType: 'image/webp',
      width: 1920,
      height: 1080,
    });

    const url = await service.resolveSource({
      id: 'img1',
      albumId: 'a1',
      sourceUri: 'content://media/external/images/media/1',
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      position: { x: 0, y: 0 },
      createdAt: new Date(),
    });

    expect(gallery.getMediaFull).toHaveBeenCalledWith(
      'content://media/external/images/media/1',
    );
    expect(url).toBe('data:image/webp;base64,ZGF0YQ==');
  });

  it('should fall back to the legacy blob for pre-refactor images', async () => {
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:legacy');
    const legacyBlob = new Blob(['old'], { type: 'image/jpeg' });

    const url = await service.resolveSource({
      id: 'img1',
      albumId: 'a1',
      data: legacyBlob,
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      position: { x: 0, y: 0 },
      createdAt: new Date(),
    });

    expect(createUrlSpy).toHaveBeenCalledWith(legacyBlob);
    expect(url).toBe('blob:legacy');
    createUrlSpy.mockRestore();
  });

  it('should throw when the image has no source at all', async () => {
    await expect(
      service.resolveSource({
        id: 'img1',
        albumId: 'a1',
        filename: 'foto.jpg',
        mimeType: 'image/jpeg',
        order: 0,
        position: { x: 0, y: 0 },
        createdAt: new Date(),
      }),
    ).rejects.toThrow('no tiene un origen');
  });

  it('should propagate mediaNotFound from a dead URI', async () => {
    // El GalleryService real mapea el código nativo a GalleryError; el mock
    // respeta ese contrato y el ImageService lo propaga sin tragarse nada
    vi.mocked(gallery.getMediaFull).mockRejectedValue(
      new GalleryError('mediaNotFound', 'La foto original ya no está en tu galería.'),
    );

    const image = {
      id: 'img1',
      albumId: 'a1',
      sourceUri: 'content://media/external/images/media/999',
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      position: { x: 0, y: 0 },
      createdAt: new Date(),
    };

    try {
      await service.resolveSource(image);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GalleryError);
      expect((err as GalleryError).code).toBe('mediaNotFound');
    }
  });
});
