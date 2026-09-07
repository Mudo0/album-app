// core/guards/gallery-permission.guard.spec.ts
// Fix 1: el guard del album-detail redirige a la pantalla de permisos dedicada
// cuando el permiso de galería no está concedido (solo Android).
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ensureGalleryPermission } from './gallery-permission.guard';
import { GalleryService } from '../services/gallery.service';

describe('ensureGalleryPermission', () => {
  let checkSpy: ReturnType<typeof vi.fn>;
  let router: Router;

  beforeEach(() => {
    checkSpy = vi.fn().mockResolvedValue({
      mediaLibrary: 'granted',
      storageLegacy: 'granted',
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: GalleryService, useValue: { checkPermissions: checkSpy } },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function run(albumId = 'album-1'): ReturnType<typeof ensureGalleryPermission> {
    const route = {
      paramMap: { get: (key: string) => (key === 'id' ? albumId : null) },
    } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() =>
      ensureGalleryPermission(route, {} as Parameters<typeof ensureGalleryPermission>[1]),
    );
  }

  it('no-op en web (ng serve / tests): pasa sin consultar permisos', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await expect(run()).resolves.toBe(true);
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it('permiso concedido → deja entrar al detail', async () => {
    await expect(run('album-1')).resolves.toBe(true);
    expect(checkSpy).toHaveBeenCalled();
  });

  it('permiso faltante → redirige a la pantalla de permisos del álbum', async () => {
    checkSpy.mockResolvedValue({ mediaLibrary: 'denied', storageLegacy: 'denied' });

    const result = await run('album-7');

    expect(router.isActive('/albums/permissions/album-7', false)).toBe(false); // tree, sin navegar
    expect(result).not.toBe(true); // es un UrlTree
    expect(router.serializeUrl(result as Parameters<typeof router.serializeUrl>[0])).toBe(
      '/albums/permissions/album-7',
    );
  });

  it('check caído → redirige igual (la pantalla de permisos decide por su cuenta)', async () => {
    checkSpy.mockRejectedValue(new Error('boom'));

    const result = await run('album-1');

    expect(router.serializeUrl(result as Parameters<typeof router.serializeUrl>[0])).toBe(
      '/albums/permissions/album-1',
    );
  });
});