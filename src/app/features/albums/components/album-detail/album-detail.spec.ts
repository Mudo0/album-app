import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CdkDragEnd, CdkDragStart } from '@angular/cdk/drag-drop';
import { AlbumDetail } from './album-detail';
import { Album } from '../../../../core/models/album.model';
import { Image } from '../../../../core/models/image.model';
import { AlbumService } from '../../services/album.service';
import { ImageService } from '../../../images/services/image.service';
import { NavigationService } from '../../../../core/services/navigation.service';

describe('AlbumDetail', () => {
  const mockAlbum: Album = {
    id: 'a1',
    name: 'Vacaciones 2026',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  function createMockImage(overrides: Partial<Image> = {}): Image {
    const blob = new Blob(['fake'], { type: 'image/webp' });
    return {
      id: 'img1',
      albumId: 'a1',
      sourceUri: 'content://media/external/images/media/1',
      thumbnail: blob,
      thumbnailMime: 'image/webp',
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      position: { x: 0, y: 0 },
      createdAt: new Date(),
      ...overrides,
    };
  }

  async function flushAsync(cycles = 2): Promise<void> {
    for (let i = 0; i < cycles; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  /** Mock de CdkDragStart: onDragStarted lee event.source.element.nativeElement. */
  function dragStartMock(): CdkDragStart {
    return {
      source: { element: { nativeElement: document.createElement('div') } },
    } as unknown as CdkDragStart;
  }

  /**
   * Mockea el rect del canvas: sin esto jsdom devuelve 0×0 y el clamp del
   * onDragEnded fuerza x=0,y=0. Con 400×600 el sticker de 120px no clamp.
   */
  function mockCanvasRect(fixture: ReturnType<typeof TestBed.createComponent>): void {
    const canvas = fixture.nativeElement.querySelector('.canvas');
    if (!canvas) throw new Error('.canvas no está en el template del fixture');
    vi.spyOn(canvas as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 600,
      width: 400,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect);
  }

  let getByIdSpy: ReturnType<typeof vi.fn>;
  let getByAlbumSpy: ReturnType<typeof vi.fn>;
  let updatePositionSpy: ReturnType<typeof vi.fn>;
  let updateOrderSpy: ReturnType<typeof vi.fn>;

  // Template mínimo sin CDK para evitar timeouts en jsdom. El `.canvas` existe
  // porque onDragEnded lo busca para clamp (querySelector). Incluye el rect
  // mockeado vía mockCanvasRect() en los tests de drag.
  const minimalTemplate = `
    <header class="header"><h1 class="title">{{ album()?.name ?? 'Cargando...' }}</h1></header>
    <main class="main">
      @if (loading()) { <p class="status">Cargando...</p> }
      @else if (!album()) { <p class="not-found">Álbum no encontrado</p> }
      @else if (stickers().length === 0) { <p class="empty-msg">Sin imágenes</p> }
      @else {
        <div class="canvas">
          @for (s of stickers(); track s.id) {
            <span class="sticker-id">{{ s.id }}</span>
          }
        </div>
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

  it('should preserve explicit position from stored images', async () => {
    const images = [createMockImage({ position: { x: 150, y: 300 } })];
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

  // ── Drag ──────────────────────────────────────────────────────────────────
  // onDragStarted solo setea z-index vía Renderer2 (sin signals = sin CD);
  // onDragEnded usa event.distance (delta) + clamp contra el canvas y
  // REORDENA el array moviendo el arrastrado al final (traer al frente) — el
  // order persistido refleja el orden visual real y sobrevive al recargar.

  it('onDragStarted setea z-index sin reordenar ni mutar el array', async () => {
    const images = [
      createMockImage({ id: 'img1', position: { x: 10, y: 10 } }),
      createMockImage({ id: 'img2', position: { x: 20, y: 20 } }),
      createMockImage({ id: 'img3', position: { x: 30, y: 30 } }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const component = fixture.componentInstance as AlbumDetail;
    const before = component.stickers();
    const dragged = before[0];
    const event = dragStartMock();

    component.onDragStarted(dragged, event);

    const after = component.stickers();
    expect(after).toEqual(before); // ni reordena ni muta
    expect(after[0]).toBe(dragged); // misma referencia
    // z-index real aplicado al elemento fuente del evento (vía Renderer2)
    expect(event.source.element.nativeElement.style.zIndex).toBe('1');
  });

  it('onDragEnded actualiza la posición immutably con event.distance', async () => {
    const images = [
      createMockImage({ id: 'img1', position: { x: 10, y: 10 } }),
      createMockImage({ id: 'img2', position: { x: 20, y: 20 } }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    mockCanvasRect(fixture);

    const component = fixture.componentInstance as AlbumDetail;
    const original = component.stickers().find((s) => s.id === 'img1')!;

    // event.distance = delta REAL del mouse; el rect 400×600 no clamp → 10+32
    const dragEnd = { distance: { x: 32, y: 67 } } as unknown as CdkDragEnd;
    component.onDragEnded(original, dragEnd);

    const updated = component.stickers().find((s) => s.id === 'img1')!;
    expect(updated).not.toBe(original); // nueva referencia => signal notifica CD
    expect(updated.x).toBe(42);
    expect(updated.y).toBe(77);
    expect(original.x).toBe(10); // el objeto original NO se mutó
    expect(updatePositionSpy).toHaveBeenCalledWith('img1', { x: 42, y: 77 });
  });

  it('onDragEnded reordena el array moviendo el arrastrado al final (traer al frente)', async () => {
    const images = [
      createMockImage({ id: 'img1', position: { x: 10, y: 10 } }),
      createMockImage({ id: 'img2', position: { x: 20, y: 20 } }),
      createMockImage({ id: 'img3', position: { x: 30, y: 30 } }),
    ];
    getByAlbumSpy.mockResolvedValue(images);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();
    mockCanvasRect(fixture);

    const component = fixture.componentInstance as AlbumDetail;
    const dragged = component.stickers()[0]; // img1

    // Sin delta: la posición no cambia, pero el arrastrado IGUAL se mueve al
    // final del array → el order persistido refleja el apilamiento visual
    const dragEnd = { distance: { x: 0, y: 0 } } as unknown as CdkDragEnd;
    component.onDragEnded(dragged, dragEnd);

    const after = component.stickers();
    expect(after.map((s) => s.id)).toEqual(['img2', 'img3', 'img1']);
    expect(after[2]).not.toBe(dragged); // nueva referencia => signal notifica CD
    expect(after[2].x).toBe(10);
    expect(after[2].y).toBe(10);
    expect(dragged.x).toBe(10); // el objeto original NO se mutó
    expect(updatePositionSpy).toHaveBeenCalledWith('img1', { x: 10, y: 10 });
    // El order NUEVO refleja el array ya reordenado (arrastrado al final = arriba)
    expect(updateOrderSpy).toHaveBeenCalledWith([
      { id: 'img2', order: 0 },
      { id: 'img3', order: 1 },
      { id: 'img1', order: 2 },
    ]);
  });

  it('onBack delega al NavigationService centralizado', async () => {
    getByIdSpy.mockResolvedValue(mockAlbum);
    const fixture = createFixture();
    fixture.detectChanges();
    await flushAsync();

    const component = fixture.componentInstance as AlbumDetail;
    const backSpy = vi
      .spyOn(TestBed.inject(NavigationService), 'back')
      .mockImplementation(() => undefined);

    component.onBack();

    expect(backSpy).toHaveBeenCalled();
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
