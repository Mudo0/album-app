import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlbumDetail } from './album-detail';
import { AlbumService } from '../../../core/services/album.service';
import { ImageService } from '../../../core/services/image.service';
import type { Album } from '../../../core/models/album.model';
import type { Image } from '../../../core/models/image.model';

describe('AlbumDetail', () => {
  const mockAlbum: Album = {
    id: 'a1',
    name: 'Vacaciones 2026',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  function createMockImage(overrides: Partial<Image> = {}): Image {
    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    return {
      id: 'img1',
      albumId: 'a1',
      data: blob,
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      createdAt: new Date(),
      ...overrides,
    };
  }

  /** Espera N ciclos de micro/macro tasks para que se completen las operaciones async */
  async function flushAsync(cycles = 2): Promise<void> {
    for (let i = 0; i < cycles; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  let getByIdSpy: ReturnType<typeof vi.fn>;
  let getByAlbumSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getByIdSpy = vi.fn().mockResolvedValue(mockAlbum);
    getByAlbumSpy = vi.fn().mockResolvedValue([]);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AlbumDetail],
      providers: [
        provideRouter([]),
        { provide: AlbumService, useValue: { getById: getByIdSpy } },
        { provide: ImageService, useValue: { getByAlbum: getByAlbumSpy } },
      ],
    }).compileComponents();
  });

  function createFixture(): ReturnType<typeof TestBed.createComponent> {
    const fixture = TestBed.createComponent(AlbumDetail);
    fixture.componentRef.setInput('id', 'a1');
    return fixture;
  }

  it('should show loading state initially', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cargando');
  });

  it('should show album name when loaded', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Vacaciones 2026');
  });

  it('should show not-found state when album is undefined', async () => {
    getByIdSpy.mockResolvedValue(undefined);
    const fixture = createFixture();
    fixture.componentRef.setInput('id', 'bad-id');
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Álbum no encontrado');
  });

  it('should show empty state when album has no images', async () => {
    getByIdSpy.mockResolvedValue(mockAlbum);
    getByAlbumSpy.mockResolvedValue([]);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Sin imágenes');
  });

  it('should render image thumbnails in grid', async () => {
    const images = [
      createMockImage(),
      createMockImage({ id: 'img2', order: 1 }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const photos = el.querySelectorAll('.photo-img');
    expect(photos.length).toBe(2);
  });

  it('should have FAB linking to upload', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const fab = el.querySelector('.add-btn');
    expect(fab).toBeTruthy();
    expect(fab?.getAttribute('href')).toBe('/albums/a1/upload');
  });
});
