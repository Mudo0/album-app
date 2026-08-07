import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { AlbumForm } from './album-form';
import { AlbumService } from '../../services/album.service';


const testRoutes: Routes = [
  { path: 'albums', component: AlbumForm },
  { path: 'albums/:id', component: AlbumForm },
  { path: 'albums/:id/edit', component: AlbumForm, data: { backTo: '/albums' } },
];

describe('AlbumForm', () => {
  let createSpy: ReturnType<typeof vi.fn>;
  let updateSpy: ReturnType<typeof vi.fn>;
  let getByIdSpy: ReturnType<typeof vi.fn>;

  function setup() {
    createSpy = vi.fn().mockResolvedValue({
      id: 'new1',
      name: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    updateSpy = vi.fn().mockResolvedValue(undefined);
    getByIdSpy = vi.fn().mockResolvedValue({
      id: 'abc',
      name: 'Original',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return TestBed.configureTestingModule({
      imports: [AlbumForm],
      providers: [
        provideRouter(testRoutes),
        {
          provide: AlbumService,
          useValue: {
            createNewAlbum: createSpy,
            updateAlbumName: updateSpy,
            getAlbumById: getByIdSpy,
          },
        },
      ],
    }).compileComponents();
  }

  it('should render the form with title', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Nuevo álbum');
  });

  it('should have save button disabled when name is empty', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const btn = el.querySelector('.save-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('should enable save button when name has text', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.name.set('Vacaciones');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const btn = el.querySelector('.save-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('should call AlbumService.create on save', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.name.set('Mi álbum');
    fixture.detectChanges();

    component.save();
    await fixture.whenStable();

    expect(createSpy).toHaveBeenCalledWith({ name: 'Mi álbum' });
  });

  it('should load the album name when editing', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.componentRef.setInput('id', 'abc');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getByIdSpy).toHaveBeenCalledWith('abc');
    expect(fixture.componentInstance.name()).toBe('Original');
  });

  it('should update and go back to the list when saving an edit', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');
    await router.navigateByUrl('/albums/abc/edit');

    const fixture = TestBed.createComponent(AlbumForm);
    fixture.componentRef.setInput('id', 'abc');
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.name.set('Renombrado');
    fixture.detectChanges();

    await component.save();
    await fixture.whenStable();

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc' }), 'Renombrado');
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/albums', {
      replaceUrl: true,
    });
  });

  it('should navigate to the new album detail replacing the form in history', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.name.set('Mi álbum');
    fixture.detectChanges();

    await component.save();
    await fixture.whenStable();

    expect(createSpy).toHaveBeenCalledWith({ name: 'Mi álbum' });
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/albums/new1', {
      replaceUrl: true,
    });
  });
});
