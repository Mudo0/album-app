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
      thumbnail: 'aGVsbG8=', // base64 de "hello"
    };
  }

  let getGallerySpy: ReturnType<typeof vi.fn>;
  let checkPermissionsSpy: ReturnType<typeof vi.fn>;
  let requestPermissionsSpy: ReturnType<typeof vi.fn>;
  let addFromGallerySpy: ReturnType<typeof vi.fn>;
  let navigationBackSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getGallerySpy = vi.fn().mockResolvedValue({ medias: [], hasMore: false });
    checkPermissionsSpy = vi
      .fn()
      .mockResolvedValue({ mediaLibrary: 'granted', storageLegacy: 'granted' });
    requestPermissionsSpy = vi
      .fn()
      .mockResolvedValue({ mediaLibrary: 'granted', storageLegacy: 'granted' });
    addFromGallerySpy = vi.fn().mockResolvedValue({ id: 'new-img' });
    navigationBackSpy = vi.fn();

    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ImageUploader],
      providers: [
        provideRouter([]),
        { provide: NavigationService, useValue: { back: navigationBackSpy } },
        { provide: ImageService, useValue: { addFromGallery: addFromGallerySpy } },
        {
          provide: GalleryService,
          useValue: {
            getGallery: getGallerySpy,
            checkPermissions: checkPermissionsSpy,
            requestPermissions: requestPermissionsSpy,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(component.permission()).toBe('granted');
    expect(fixture.nativeElement.querySelectorAll('.media-item').length).toBe(2);
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

  it('should load the next page when scrolling near the bottom', async () => {
    getGallerySpy
      .mockResolvedValueOnce({ medias: [createMedia('1')], hasMore: true })
      .mockResolvedValueOnce({ medias: [createMedia('2')], hasMore: false });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    component.onScroll({
      target: { scrollTop: 900, clientHeight: 400, scrollHeight: 1500 },
    } as unknown as Event);
    await flush();
    fixture.detectChanges();

    expect(getGallerySpy).toHaveBeenLastCalledWith(100, 1);
    expect(component.medias().length).toBe(2);
  });

  it('should save selected medias sequentially and go back', async () => {
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

    expect(addFromGallerySpy).toHaveBeenCalledTimes(2);
    expect(addFromGallerySpy).toHaveBeenNthCalledWith(1, 'album-1', m1);
    expect(addFromGallerySpy).toHaveBeenNthCalledWith(2, 'album-1', m2);
    expect(navigationBackSpy).toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });

  it('should not save when nothing is selected', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();

    const component = fixture.componentInstance as ImageUploader;
    await component.save();

    expect(addFromGallerySpy).not.toHaveBeenCalled();
    expect(navigationBackSpy).not.toHaveBeenCalled();
  });

  it('should keep saving the rest of the batch when one photo fails', async () => {
    getGallerySpy.mockResolvedValue({
      medias: [createMedia('1'), createMedia('2')],
      hasMore: false,
    });
    addFromGallerySpy
      .mockRejectedValueOnce(new Error('foto caída'))
      .mockResolvedValueOnce({ id: 'ok' });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as ImageUploader;
    const [m1, m2] = component.medias();
    component.toggle(m1);
    component.toggle(m2);

    await component.save();

    expect(addFromGallerySpy).toHaveBeenCalledTimes(2);
    expect(component.error()).toContain('foto-1.jpg');
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
});
