import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { ImageUploader } from './image-uploader';
import { ImageService } from '../../../core/services/image.service';

describe('ImageUploader', () => {
  let addSpy: ReturnType<typeof vi.fn>;
  let mockFileInput: { click: ReturnType<typeof vi.fn> };
  let locationBackSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    addSpy = vi.fn().mockResolvedValue({ id: 'new-img' });
    mockFileInput = { click: vi.fn() };
    locationBackSpy = vi.fn();

    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:mock-${Math.random()}`,
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ImageUploader],
      providers: [
        provideRouter([]),
        { provide: Location, useValue: { back: locationBackSpy } },
        { provide: ImageService, useValue: { add: addSpy } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ImageUploader);
    fixture.componentRef.setInput('id', 'album-1');

    const component = fixture.componentInstance;
    (component as unknown as { fileInputRef: () => { nativeElement: typeof mockFileInput } }).fileInputRef =
      vi.fn(() => ({ nativeElement: mockFileInput })) as never;

    return fixture;
  }

  function createMockFileList(files: File[]): FileList {
    return {
      length: files.length,
      item: (i: number) => files[i] ?? null,
      [Symbol.iterator]: () => files[Symbol.iterator](),
    } as unknown as FileList;
  }

  it('should render the form', async () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Agregar imágenes');
    expect(el.textContent).toContain('Seleccionar imágenes');
  });

  it('should open file picker on button click', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.openPicker();

    expect(mockFileInput.click).toHaveBeenCalled();
  });

  it('should create previews when files are selected', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const file = new File(['a'], 'foto.jpg', { type: 'image/jpeg' });
    const fileList = createMockFileList([file]);

    const event = { target: { files: fileList, value: '' } } as unknown as Event;
    component.onFilesSelected(event);

    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(component.files().length).toBe(1);
    expect(component.files()[0].url).toContain('blob:mock-');
  });

  it('should append files to existing selection', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    component.onFilesSelected({
      target: { files: createMockFileList([f1]), value: '' },
    } as unknown as Event);

    component.onFilesSelected({
      target: { files: createMockFileList([f2]), value: '' },
    } as unknown as Event);

    expect(component.files().length).toBe(2);
  });

  it('should remove file and revoke URL', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });

    component.onFilesSelected({
      target: { files: createMockFileList([file]), value: '' },
    } as unknown as Event);

    const url = component.files()[0].url;
    component.removeFile(0);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    expect(component.files().length).toBe(0);
  });

  it('should save all files and go back', async () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    component.onFilesSelected({
      target: { files: createMockFileList([f1, f2]), value: '' },
    } as unknown as Event);

    await component.save();

    expect(addSpy).toHaveBeenCalledTimes(2);
    expect(addSpy).toHaveBeenCalledWith('album-1', f1);
    expect(addSpy).toHaveBeenCalledWith('album-1', f2);
    expect(locationBackSpy).toHaveBeenCalled();
  });

  it('should not save when already saving', async () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.saving.set(true);
    component.files.set([
      { file: new File(['a'], 'a.jpg', { type: 'image/jpeg' }), url: 'blob:x' },
    ]);

    await component.save();

    expect(addSpy).not.toHaveBeenCalled();
  });

  it('should revoke all URLs on destroy', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });

    component.onFilesSelected({
      target: { files: createMockFileList([file]), value: '' },
    } as unknown as Event);

    const url = component.files()[0].url;
    component.ngOnDestroy();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('should show preview grid when files are selected', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const file = new File(['a'], 'foto.jpg', { type: 'image/jpeg' });
    component.onFilesSelected({
      target: { files: createMockFileList([file]), value: '' },
    } as unknown as Event);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.preview-item')).toBeTruthy();
    expect(el.querySelector('.preview-img')).toBeTruthy();
    expect(el.textContent).toContain('Guardar 1 imagen');
  });
});
