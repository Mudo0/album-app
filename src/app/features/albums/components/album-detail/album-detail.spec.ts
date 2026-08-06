import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CdkDragEnd } from '@angular/cdk/drag-drop';
import { AlbumDetail } from './album-detail';
import { Album } from '../../../../core/models/album.model';
import { Image } from '../../../../core/models/image.model';
import { AlbumService } from '../../services/album.service';
import { ImageService } from '../../../images/services/image.service';

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

  async function flushAsync(cycles = 2): Promise<void> {
    for (let i = 0; i < cycles; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  let getByIdSpy: ReturnType<typeof vi.fn>;
  let getByAlbumSpy: ReturnType<typeof vi.fn>;
  let updatePositionSpy: ReturnType<typeof vi.fn>;
  let updateOrderSpy: ReturnType<typeof vi.fn>;

  // Template mínimo sin CDK para evitar timeouts en jsdom
  const minimalTemplate = `
    <header class="header"><h1 class="title">{{ album()?.name ?? 'Cargando...' }}</h1></header>
    <main class="main">
      @if (loading()) { <p class="status">Cargando...</p> }
      @else if (!album()) { <p class="not-found">Álbum no encontrado</p> }
      @else if (stickers().length === 0) { <p class="empty-msg">Sin imágenes</p> }
      @else {
        @for (s of stickers(); track s.id) {
          <span class="sticker-id">{{ s.id }}</span>
        }
      }
    </main>
    <footer class="footer">
      <a class="add-btn" [routerLink]="['/albums', id(), 'upload']">+</a>
    </footer>
  `;

  beforeEach(async () => {
    getByIdSpy = vi.fn().mockResolvedValue(mockAlbum);
    getByAlbumSpy = vi.fn().mockResolvedValue([]);
    updatePositionSpy = vi.fn().mockResolvedValue(undefined);
    updateOrderSpy = vi.fn().mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AlbumDetail],
      providers: [
        provideRouter([]),
        { provide: AlbumService, useValue: { getById: getByIdSpy } },
        {
          provide: ImageService,
          useValue: {
            getByAlbum: getByAlbumSpy,
            updatePosition: updatePositionSpy,
            updateOrder: updateOrderSpy,
          },
        },
      ],
    })
      .overrideComponent(AlbumDetail, { set: { template: minimalTemplate } })
      .compileComponents();
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

  it('should show not-found when album is undefined', async () => {
    getByIdSpy.mockResolvedValue(undefined);
    const fixture = createFixture();
    fixture.componentRef.setInput('id', 'bad-id');
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Álbum no encontrado');
  });

  it('should show empty state when no images', async () => {
    getByIdSpy.mockResolvedValue(mockAlbum);
    getByAlbumSpy.mockResolvedValue([]);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Sin imágenes');
  });

  it('should map images to stickers with default positions', async () => {
    const images = [createMockImage(), createMockImage({ id: 'img2' })];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const stickers = (fixture.componentInstance as AlbumDetail).stickers();
    expect(stickers.length).toBe(2);
    expect(stickers[0].x).toBeDefined();
    expect(stickers[0].y).toBeDefined();
  });

  it('should preserve explicit x/y from stored images', async () => {
    const images = [createMockImage({ x: 150, y: 300 })];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const stickers = (fixture.componentInstance as AlbumDetail).stickers();
    expect(stickers[0].x).toBe(150);
    expect(stickers[0].y).toBe(300);
  });

  it('should precompute an object URL for each sticker', async () => {
    const images = [createMockImage(), createMockImage({ id: 'img2' })];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const stickers = (fixture.componentInstance as AlbumDetail).stickers();
    for (const sticker of stickers) {
      expect(sticker.objectUrl).toMatch(/^blob:/);
    }
    // URLs distintas por sticker, no una por render
    expect(stickers[0].objectUrl).not.toBe(stickers[1].objectUrl);
  });

  it('should move dragged sticker to the end without mutating it', async () => {
    const images = [
      createMockImage({ id: 'img1', x: 10, y: 10 }),
      createMockImage({ id: 'img2', x: 20, y: 20 }),
      createMockImage({ id: 'img3', x: 30, y: 30 }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const component = fixture.componentInstance as AlbumDetail;
    const dragged = component.stickers()[0];
    const originalRef = dragged;

    component.onDragStarted(dragged);

    const after = component.stickers();
    expect(after[2]).toBe(originalRef); // img1 al final = último del DOM = arriba
    expect(after[0].id).toBe('img2'); // el resto mantiene su orden
    expect(dragged.x).toBe(10); // sin mutación: misma referencia, mismos valores
  });

  it('should update position immutably on drag ended', async () => {
    const images = [
      createMockImage({ id: 'img1', x: 10, y: 10 }),
      createMockImage({ id: 'img2', x: 20, y: 20 }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const component = fixture.componentInstance as AlbumDetail;
    const original = component.stickers()[0];

    // El usuario arrastró img1 al frente: queda al final del array
    component.onDragStarted(original);

    const dragEnd = {
      source: { getFreeDragPosition: () => ({ x: 42, y: 77 }) },
    } as unknown as CdkDragEnd;

    component.onDragEnded(original, dragEnd);

    const updated = component.stickers().find((s) => s.id === 'img1')!;
    expect(updated).not.toBe(original); // nueva referencia => signal notifica el CD
    expect(updated.x).toBe(42);
    expect(updated.y).toBe(77);
    expect(original.x).toBe(10); // el objeto original NO se mutó
    expect(updatePositionSpy).toHaveBeenCalledWith('img1', 42, 77);
  });

  it('should persist z-order (array order) on drag ended', async () => {
    const images = [
      createMockImage({ id: 'img1', x: 10, y: 10 }),
      createMockImage({ id: 'img2', x: 20, y: 20 }),
      createMockImage({ id: 'img3', x: 30, y: 30 }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const component = fixture.componentInstance as AlbumDetail;
    const dragged = component.stickers()[0];

    component.onDragStarted(dragged); // img1 va al final: [img2, img3, img1]
    const dragEnd = {
      source: { getFreeDragPosition: () => ({ x: 0, y: 0 }) },
    } as unknown as CdkDragEnd;
    component.onDragEnded(dragged, dragEnd);

    // Secuencia completa reasignada: índice del array → order persistido
    expect(updateOrderSpy).toHaveBeenCalledWith([
      { id: 'img2', order: 0 },
      { id: 'img3', order: 1 },
      { id: 'img1', order: 2 },
    ]);
  });

  it('should revoke object URLs on destroy', async () => {
    const images = [createMockImage(), createMockImage({ id: 'img2' })];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const component = fixture.componentInstance as AlbumDetail;
    const stickers = component.stickers();

    component.ngOnDestroy();

    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledWith(stickers[0].objectUrl);
    expect(revokeSpy).toHaveBeenCalledWith(stickers[1].objectUrl);
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
