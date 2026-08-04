import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes } from '@angular/router';
import { AlbumForm } from './album-form';
import { AlbumService } from '../../../core/services/album.service';

const testRoutes: Routes = [{ path: 'albums', component: AlbumForm }];

describe('AlbumForm', () => {
  let createSpy: ReturnType<typeof vi.fn>;

  function setup() {
    createSpy = vi.fn().mockResolvedValue({
      id: 'new1',
      name: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return TestBed.configureTestingModule({
      imports: [AlbumForm],
      providers: [
        provideRouter(testRoutes),
        { provide: AlbumService, useValue: { create: createSpy } },
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
});
