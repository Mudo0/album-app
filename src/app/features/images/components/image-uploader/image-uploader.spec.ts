import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import { ImageUploader } from './image-uploader';
import { NavigationService } from '../../../../core/services/navigation.service';
import { ImageService } from '../../services/image.service';
import { GalleryService } from '../../../../core/services/gallery.service';
import type { GalleryMedia } from '../../../../core/interfaces/gallery-plugin.interface';

describe('ImageUploader', () => {
  function createMedia(id: string): GalleryMedia {
    return {
      id,
      uri: `content://media/external/images/media/${id}`,
      name: `foto-${id}.jpg`,
      mimeType: 'image/jpeg',
      width: 4000,
      height: 3000,
      dateAdded: 1700000000,
    };
  }

  function thumbResult() {
    return { data: 'aGVsbG8=', mimeType: 'image/jpeg' }; // base64 de "hello"
  }

  let getGallerySpy: ReturnType<typeof vi.fn>;
  let checkPermissionsSpy: ReturnType<typeof vi.fn>;
  let requestPermissionsSpy: ReturnType<typeof vi.fn>;
  let getMediaThumbnailsSpy: ReturnType<typeof vi.fn>;
  let addManyFromGallerySpy: ReturnType<typeof vi.fn>;
  let navigationBackSpy: ReturnType<typeof vi.fn>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let blobCounter: number;

  beforeEach(async () => {
    getGallerySpy = vi.fn().mockResolvedValue({ medias: [], hasMore: false });
    checkPermissionsSpy = vi
      .fn()
      .mockResolvedValue({ mediaLibrary: 'granted', storageLegacy: 'granted' });
    requestPermissionsSpy = vi
      .fn()
      .mockResolvedValue({ mediaLibrary: 'granted', storageLegacy: 'granted' });
    getMediaThumbnailsSpy = vi.fn().mockResolvedValue([]);
    addManyFromGallerySpy = vi.fn().mockResolvedValue(undefined);
    navigationBackSpy = vi.fn();

    blobCounter = 0;
    createObjectURLSpy = vi.fn(() => `blob:fake-${blobCounter++}`);
    revokeObjectURLSpy = vi.fn();
    // jsdom no implementa createObjectURL/revokeObjectURL de verdad
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURLSpy,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURLSpy,
      configurable: true,
    });

    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ImageUploader],
      providers: [
        provideRouter([]),
        { provide: NavigationService, useValue: { back: navigationBackSpy } },
        { provide: ImageService, useValue: { addManyFromGallery: addManyFromGallerySpy } },
        {
          provide: GalleryService,
          useValue: {
            getGallery: getGallerySpy,
            getMediaThumbnails: getMediaThumbnailsSpy,
            checkPermissions: checkPermissionsSpy,
            requestPermissions: requestPermissionsSpy,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ImageUploader);
    fixture.componentRef.setInput('id', 'album-1');
    return fixture;
  }

  async function flush(cycles = 2): Promise<void> {
    for (let i = 0; i < cycles; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  it('should render the title', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Agregar imágenes');
  });

  it('should request gallery access and load the first page on init', async () => {
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2')],
      hasMore: false,
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(checkPermissionsSpy).toHaveBeenCalled();
    expect(getGallerySpy).toHaveBeenCalledWith(100, 0);

    const component = fixture.componentInstance as ImageUploader;
    expect(component.medias().length).toBe(2);
    expect(component.rows().length).toBe(1); // 2 fotos = 1 fila de 3
    expect(component.permission()).toBe('granted');
  });

  it('should show the native-only notice on web', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('solo en la app Android');
    expect(checkPermissionsSpy).not.toHaveBeenCalled();
  });

  it('should show the denied state and allow requesting access again', async () => {
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'denied',
      storageLegacy: 'denied',
    });
    requestPermissionsSpy.mockResolvedValueOnce({
      mediaLibrary: 'denied',
      storageLegacy: 'denied',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    expect(component.permission()).toBe('denied');
    expect(fixture.nativeElement.textContent).toContain('Dar permisos');

    await component.requestAccess();
    fixture.detectChanges();

    expect(requestPermissionsSpy).toHaveBeenCalledTimes(2);
    expect(component.permission()).toBe('granted');
    expect(getGallerySpy).toHaveBeenCalled();
  });

  it('should select and deselect media items', async () => {
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2')],
      hasMore: false,
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    const [m1, m2] = component.medias();

    component.toggle(m1);
    component.toggle(m2);
    expect(component.selected().size).toBe(2);

    component.toggle(m1);
    expect(component.selected().size).toBe(1);
    expect(component.isSelected(m2.id)).toBe(true);
    expect(component.isSelected(m1.id)).toBe(false);
  });

  it('should load the next page when scrolled near the bottom', async () => {
    getGallerySpy
      .mockResolvedValueOnce({ medias: [createMedia('1')], hasMore: true })
      .mockResolvedValueOnce({ medias: [createMedia('2')], hasMore: false });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.onScrolledIndex(0); // sin layout (jsdom) la ventana cubre todo
    await flush();
    fixture.detectChanges();

    expect(getGallerySpy).toHaveBeenLastCalledWith(100, 1);
    expect(component.medias().length).toBe(2);
  });

  it('should save selected medias in a single batch and go back', async () => {
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2')],
      hasMore: false,
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    const [m1, m2] = component.medias();
    component.toggle(m1);
    component.toggle(m2);

    await component.save();
    fixture.detectChanges();

    expect(addManyFromGallerySpy).toHaveBeenCalledTimes(1);
    expect(addManyFromGallerySpy).toHaveBeenCalledWith('album-1', [m1, m2]);
    expect(navigationBackSpy).toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });

  it('should not save when nothing is selected', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();

    const component = fixture.componentInstance as ImageUploader;
    await component.save();

    expect(addManyFromGallerySpy).not.toHaveBeenCalled();
    expect(navigationBackSpy).not.toHaveBeenCalled();
  });

  it('should keep saving the next batch when one batch fails', async () => {
    // 26 fotos = 2 lotes (BATCH_SIZE = 25): el primero falla, el segundo pasa
    const medias = Array.from({ length: 26 }, (_, i) => createMedia(String(i)));
    getGallerySpy.mockResolvedValue({ medias, hasMore: false });
    addManyFromGallerySpy
      .mockRejectedValueOnce(new Error('No se pudieron guardar 1 foto(s): foto-25.jpg'))
      .mockResolvedValueOnce(undefined);
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.medias().forEach((m) => component.toggle(m));

    await component.save();

    expect(addManyFromGallerySpy).toHaveBeenCalledTimes(2);
    expect(addManyFromGallerySpy).toHaveBeenNthCalledWith(
      1,
      'album-1',
      component.medias().slice(0, 25),
    );
    expect(addManyFromGallerySpy).toHaveBeenNthCalledWith(2, 'album-1', medias.slice(25));
    expect(component.error()).toContain('foto-25.jpg');
    expect(navigationBackSpy).toHaveBeenCalled();
  });

  it('should show an error when the gallery call fails', async () => {
    getGallerySpy.mockRejectedValue(new Error('no hay galería'));
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('no hay galería');
  });

  // ── Lazy thumbs: debounce + batch por ventana + cache LRU ────────────────

  it('should lazily fetch the rendered window in one debounced batch', async () => {
    vi.useFakeTimers();
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2'), createMedia('3'), createMedia('4')],
      hasMore: false,
    });
    getMediaThumbnailsSpy.mockResolvedValue([
      thumbResult(),
      thumbResult(),
      thumbResult(),
      thumbResult(),
    ]);
    const fixture = createFixture();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0); // ngOnInit: permisos + primera página
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    // En jsdom no hay layout: el CDK considera "visible" todo el contenido y
    // ya encoló las 4 fotos en su rango inicial (en el dispositivo real solo
    // encola la ventana visible). El onRenderedRange manual no re-encola nada.
    component.onRenderedRange({ start: 0, end: 1 });
    expect(getMediaThumbnailsSpy).not.toHaveBeenCalled(); // debounce activo

    await vi.advanceTimersByTimeAsync(120); // se dispara el flush

    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(1);
    expect(getMediaThumbnailsSpy).toHaveBeenCalledWith(
      [
        'content://media/external/images/media/1',
        'content://media/external/images/media/2',
        'content://media/external/images/media/3',
        'content://media/external/images/media/4',
      ],
      { size: 256, format: 'jpeg' },
    );
    expect(component.thumbSrc(component.medias()[0])).toBe('blob:fake-0');
    expect(component.thumbSrc(component.medias()[3])).toBe('blob:fake-3');
  });

  it('should not re-fetch thumbs already in cache when the range repeats', async () => {
    vi.useFakeTimers();
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2'), createMedia('3')],
      hasMore: false,
    });
    getMediaThumbnailsSpy.mockResolvedValue([thumbResult(), thumbResult(), thumbResult()]);
    const fixture = createFixture();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.onRenderedRange({ start: 0, end: 1 });
    await vi.advanceTimersByTimeAsync(120);
    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(1);

    component.onRenderedRange({ start: 0, end: 1 }); // mismo rango, ya cacheados
    await vi.advanceTimersByTimeAsync(120);
    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(1); // sin llamada extra
  });

  it('should queue thumbs while a batch is in flight and flush them after', async () => {
    vi.useFakeTimers();
    const uris = [
      'content://media/external/images/media/1',
      'content://media/external/images/media/2',
      'content://media/external/images/media/3',
      'content://media/external/images/media/4',
      'content://media/external/images/media/5',
      'content://media/external/images/media/6',
    ];
    getGallerySpy.mockResolvedValue({
      medias: uris.map((_, i) => createMedia(String(i + 1))),
      hasMore: false,
    });
    let resolveFirst!: (value: unknown) => void;
    getMediaThumbnailsSpy
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(uris.map(() => thumbResult()));
    const fixture = createFixture();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.onRenderedRange({ start: 0, end: 2 });
    await vi.advanceTimersByTimeAsync(120); // flush #1 queda EN VUELO
    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(1);
    expect(getMediaThumbnailsSpy).toHaveBeenCalledWith(uris, { size: 256, format: 'jpeg' });

    // Durante el vuelo llegan pendientes nuevos (mismo rango re-emitido)
    component.onRenderedRange({ start: 0, end: 2 });
    await vi.advanceTimersByTimeAsync(120); // el flush se frena: 1 en vuelo
    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(1); // sigue 1

    resolveFirst(uris.map(() => thumbResult())); // termina el #1
    await vi.advanceTimersByTimeAsync(0); // el finally re-agenda los pendientes
    await vi.advanceTimersByTimeAsync(120); // flush #2 con lo que quedó

    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(2);
    expect(getMediaThumbnailsSpy).toHaveBeenLastCalledWith(uris, { size: 256, format: 'jpeg' });
    expect(component.thumbs().size).toBe(6);
  });

  it('should split a large rendered range into chunks of 25 and evict the LRU', async () => {
    vi.useFakeTimers();
    // 240 fotos = 80 filas: el flush manda 240 pendientes en trozos de 25
    // (10 llamadas, el plugin valida máx. 50) y el LRU (max 200) evicta 40.
    const medias = Array.from({ length: 240 }, (_, i) => createMedia(String(i)));
    getGallerySpy.mockResolvedValue({ medias, hasMore: false });
    getMediaThumbnailsSpy.mockImplementation((uris: string[]) =>
      Promise.resolve(uris.map(() => thumbResult())),
    );
    const fixture = createFixture();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.onRenderedRange({ start: 0, end: 80 });
    await vi.advanceTimersByTimeAsync(120);

    expect(getMediaThumbnailsSpy).toHaveBeenCalledTimes(10); // 9x25 + 1x15
    expect(component.thumbs().size).toBe(200); // tope del LRU
    // Evictados los 40 más viejos (ids 0..39), revocados al evictar
    expect(component.thumbSrc(medias[0])).toBe('');
    expect(component.thumbSrc(medias[39])).toBe('');
    expect(component.thumbSrc(medias[40])).not.toBe('');
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(40);
  });

  it('should revoke all object URLs when the component is destroyed', async () => {
    vi.useFakeTimers();
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2'), createMedia('3'),
        createMedia('4'), createMedia('5'), createMedia('6')],
      hasMore: false,
    });
    getMediaThumbnailsSpy.mockResolvedValue([
      thumbResult(),
      thumbResult(),
      thumbResult(),
      thumbResult(),
      thumbResult(),
      thumbResult(),
    ]);
    const fixture = createFixture();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.onRenderedRange({ start: 0, end: 2 });
    await vi.advanceTimersByTimeAsync(120);
    expect(component.thumbs().size).toBe(6);
    expect(revokeObjectURLSpy).not.toHaveBeenCalled(); // nada evictado aún

    fixture.destroy();

    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(6); // revoke total en destroy
  });
});
