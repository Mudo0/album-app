import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { Location } from '@angular/common';
import { AlbumForm } from './album-form';
import { AlbumService } from '../../../core/services/album.service';

const testRoutes: Routes = [
  { path: 'albums', component: AlbumForm },
  { path: 'albums/:id', component: AlbumForm },
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
          useValue: { create: createSpy, update: updateSpy, getById: getByIdSpy },
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

  it('should update and go back (not navigate forward) when saving an edit', async () => {
    await setup();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    const backSpy = vi.spyOn(TestBed.inject(Location), 'back');
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.componentRef.setInput('id', 'abc');
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.name.set('Renombrado');
    fixture.detectChanges();

    await component.save();
    await fixture.whenStable();

    expect(updateSpy).toHaveBeenCalledWith('abc', { name: 'Renombrado' });
    expect(backSpy).toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('should navigate to the new album detail replacing the form in history', async () => {
    await setup();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    const backSpy = vi.spyOn(TestBed.inject(Location), 'back');
    const fixture = TestBed.createComponent(AlbumForm);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.name.set('Mi álbum');
    fixture.detectChanges();

    await component.save();
    await fixture.whenStable();

    expect(createSpy).toHaveBeenCalledWith({ name: 'Mi álbum' });
    expect(navigateSpy).toHaveBeenCalledWith(['/albums', 'new1'], {
      replaceUrl: true,
    });
    expect(backSpy).not.toHaveBeenCalled();
  });
});
