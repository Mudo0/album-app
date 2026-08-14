import { TestBed } from '@angular/core/testing';
import { GalleryService, GalleryError } from './gallery.service';
import { GALLERY_PLUGIN } from '../tokens/gallery-plugin.token';
import type { GalleryPluginInterface } from '../interfaces/gallery-plugin.interface';

describe('GalleryService', () => {
  const plugin = {
    getGallery: vi.fn(),
    getMediaThumbnail: vi.fn(),
    getMediaFull: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
  } as unknown as GalleryPluginInterface;

  let service: GalleryService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: GALLERY_PLUGIN, useValue: plugin }],
    });
    service = TestBed.inject(GalleryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate getGallery with page options', async () => {
    const response = { medias: [], hasMore: false };
    vi.mocked(plugin.getGallery).mockResolvedValue(response);

    await expect(service.getGallery(100, 200)).resolves.toBe(response);
    expect(plugin.getGallery).toHaveBeenCalledWith({ limit: 100, offset: 200 });
  });

  it('should delegate getMediaThumbnail with options', async () => {
    const result = { data: 'abc', mimeType: 'image/webp', width: 512, height: 384 };
    vi.mocked(plugin.getMediaThumbnail).mockResolvedValue(result);

    await expect(
      service.getMediaThumbnail('content://x', { size: 512, format: 'webp' }),
    ).resolves.toBe(result);
    expect(plugin.getMediaThumbnail).toHaveBeenCalledWith({
      uri: 'content://x',
      size: 512,
      format: 'webp',
    });
  });

  it('should map mediaNotFound to a typed GalleryError', async () => {
    vi.mocked(plugin.getMediaFull).mockRejectedValue({ code: 'mediaNotFound' });

    await expect(service.getMediaFull('content://x')).rejects.toMatchObject({
      name: 'GalleryError',
      code: 'mediaNotFound',
    });
  });

  it('should map accessDenied to a typed GalleryError', async () => {
    vi.mocked(plugin.getGallery).mockRejectedValue({ code: 'accessDenied' });

    try {
      await service.getGallery(100, 0);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GalleryError);
      expect((err as GalleryError).code).toBe('accessDenied');
    }
  });

  it('should map unknown failures to GalleryError unknown', async () => {
    vi.mocked(plugin.getGallery).mockRejectedValue(new Error('boom'));

    try {
      await service.getGallery(100, 0);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GalleryError);
      expect((err as GalleryError).code).toBe('unknown');
    }
  });

  it('should delegate requestPermissions', async () => {
    const perms = { mediaLibrary: 'granted', storageLegacy: 'granted' };
    vi.mocked(plugin.requestPermissions).mockResolvedValue(perms as never);

    await expect(service.requestPermissions()).resolves.toEqual(perms);
  });
});
