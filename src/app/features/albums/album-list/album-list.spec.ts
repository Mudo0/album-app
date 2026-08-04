import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlbumList } from './album-list';
import { AlbumService } from '../../../core/services/album.service';
import type { Album } from '../../../core/models/album.model';

describe('AlbumList', () => {
  const mockAlbums: Album[] = [
    {
      id: 'a1',
      name: 'Vacaciones',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
    {
      id: 'a2',
      name: 'Familia',
      coverImageId: 'img1',
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-01'),
    },
  ];

  let getAllSpy: ReturnType<typeof vi.fn>;

  function setup(albums: Album[] = mockAlbums) {
    getAllSpy = vi.fn().mockResolvedValue(albums);

    return TestBed.configureTestingModule({
      imports: [AlbumList],
      providers: [
        provideRouter([]),
        { provide: AlbumService, useValue: { getAll: getAllSpy } },
      ],
    }).compileComponents();
  }

  it('should show loading state initially', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumList);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cargando álbumes');
  });

  it('should show empty state when no albums', async () => {
    await setup([]);
    const fixture = TestBed.createComponent(AlbumList);
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No tenés álbumes todavía');
    expect(el.querySelector('.empty-cta')).toBeTruthy();
  });

  it('should render album cards when data loads', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumList);
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const cards = el.querySelectorAll('.card');
    expect(cards.length).toBe(2);
    expect(el.textContent).toContain('Vacaciones');
    expect(el.textContent).toContain('Familia');
  });

  it('should show badge for albums with cover', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumList);
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const badges = el.querySelectorAll('.card-badge');
    expect(badges.length).toBe(1); // solo Familia tiene coverImageId
  });

  it('should have a FAB linking to /albums/new', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumList);
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const fab = el.querySelector('.fab');
    expect(fab).toBeTruthy();
    expect(fab?.getAttribute('href')).toBe('/albums/new');
  });

  it('should generate consistent colors for same ID', async () => {
    await setup();
    const fixture = TestBed.createComponent(AlbumList);
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const color1 = component.coverColor('abc');
    const color2 = component.coverColor('abc');
    expect(color1).toBe(color2);
  });
});
