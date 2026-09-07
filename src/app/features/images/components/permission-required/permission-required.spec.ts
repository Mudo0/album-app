// features/images/components/permission-required/permission-required.spec.ts
// Fix 1: la pantalla de permisos dedicada. Verifica permisos al llegar, muestra
// el botón correcto según estado (Dar permisos / Abrir configuración) y navega
// SOLA al album-detail cuando el permiso se concede (diálogo o vuelta de
// Settings).
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { PermissionRequired } from './permission-required';
import { NavigationService } from '../../../../core/services/navigation.service';
import { GalleryService } from '../../../../core/services/gallery.service';

// ── Mock de @capacitor/app ─────────────────────────────────────────────────
// La pantalla registra el listener de appStateChange (re-check al volver de
// Settings) en ngOnInit. El mock captura el callback para dispararlo a mano.
const { appStateListeners } = vi.hoisted(() => ({
  appStateListeners: [] as Array<(data: { isActive: boolean }) => void>,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event: string, cb: (data: { isActive: boolean }) => void) => {
      if (event === 'appStateChange') {
        appStateListeners.push(cb);
      }
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

describe('PermissionRequired', () => {
  let checkPermissionsSpy: ReturnType<typeof vi.fn>;
  let requestPermissionsSpy: ReturnType<typeof vi.fn>;
  let openGallerySettingsSpy: ReturnType<typeof vi.fn>;
  let navigationToAlbumListSpy: ReturnType<typeof vi.fn>;
  let navigationToAlbumDetailSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    checkPermissionsSpy = vi
      .fn()
      .mockResolvedValue({ mediaLibrary: 'granted', storageLegacy: 'granted' });
    requestPermissionsSpy = vi
      .fn()
      .mockResolvedValue({ mediaLibrary: 'granted', storageLegacy: 'granted' });
    openGallerySettingsSpy = vi.fn().mockResolvedValue(undefined);
    navigationToAlbumListSpy = vi.fn();
    navigationToAlbumDetailSpy = vi.fn();

    appStateListeners.length = 0;
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PermissionRequired],
      providers: [
        {
          provide: NavigationService,
          useValue: {
            toAlbumList: navigationToAlbumListSpy,
            toAlbumDetail: navigationToAlbumDetailSpy,
          },
        },
        {
          provide: GalleryService,
          useValue: {
            checkPermissions: checkPermissionsSpy,
            requestPermissions: requestPermissionsSpy,
            openGallerySettings: openGallerySettingsSpy,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(PermissionRequired);
    fixture.componentRef.setInput('albumId', 'album-1');
    return fixture;
  }

  async function flush(cycles = 2): Promise<void> {
    for (let i = 0; i < cycles; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  it('permiso ya concedido (deep link directo) → navega sola al album-detail', async () => {
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(checkPermissionsSpy).toHaveBeenCalled();
    expect(navigationToAlbumDetailSpy).toHaveBeenCalledWith('album-1');
    expect(fixture.nativeElement.textContent).not.toContain('Dar permisos');
  });

  it('prompt-with-rationale (1 deny) → candado con "Dar permisos", sin navegar', async () => {
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'prompt-with-rationale',
      storageLegacy: 'prompt-with-rationale',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Dar permisos');
    expect(navigationToAlbumDetailSpy).not.toHaveBeenCalled();
  });

  it('denied (permanente) → candado con "Abrir configuración"', async () => {
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'denied',
      storageLegacy: 'denied',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Abrir configuración');
    expect(fixture.nativeElement.textContent).not.toContain('Dar permisos');
    expect(navigationToAlbumDetailSpy).not.toHaveBeenCalled();
  });

  it('al conceder con "Dar permisos" → navega al album-detail del álbum pedido', async () => {
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'prompt-with-rationale',
      storageLegacy: 'prompt-with-rationale',
    });
    requestPermissionsSpy.mockResolvedValueOnce({
      mediaLibrary: 'granted',
      storageLegacy: 'granted',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as PermissionRequired;
    await component.requestAccess();
    fixture.detectChanges();

    expect(requestPermissionsSpy).toHaveBeenCalledTimes(1);
    expect(navigationToAlbumDetailSpy).toHaveBeenCalledWith('album-1');
  });

  it('"Abrir configuración" llama al panel de settings nativo (no pide el diálogo)', async () => {
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'denied',
      storageLegacy: 'denied',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const component = fixture.componentInstance as PermissionRequired;
    await component.openSettings();

    expect(openGallerySettingsSpy).toHaveBeenCalledTimes(1);
    expect(requestPermissionsSpy).not.toHaveBeenCalled();
  });

  it('vuelta de Settings con permiso otorgado → navega sola al album-detail', async () => {
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'denied',
      storageLegacy: 'denied',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(navigationToAlbumDetailSpy).not.toHaveBeenCalled();

    // El usuario activó el permiso en Settings → el re-check al volver navega solo
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'granted',
      storageLegacy: 'granted',
    });
    appStateListeners[appStateListeners.length - 1]({ isActive: true });
    await flush();
    fixture.detectChanges();

    expect(navigationToAlbumDetailSpy).toHaveBeenCalledWith('album-1');
  });

  it('back → lista de álbumes (historial limpio: canceló el flujo)', async () => {
    // Sin permiso al llegar: el init NO navega al detail (si tuviera permiso,
    // la pantalla ya habría navegado sola y el back no aplica).
    checkPermissionsSpy.mockResolvedValue({
      mediaLibrary: 'prompt-with-rationale',
      storageLegacy: 'prompt-with-rationale',
    });
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(navigationToAlbumDetailSpy).not.toHaveBeenCalled();

    const component = fixture.componentInstance as PermissionRequired;
    component.onBack();

    expect(navigationToAlbumListSpy).toHaveBeenCalledTimes(1);
    expect(navigationToAlbumDetailSpy).not.toHaveBeenCalled();
  });

  it('en web (ng serve) no consulta permisos ni navega', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const fixture = createFixture();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('solo en la app Android');
    expect(checkPermissionsSpy).not.toHaveBeenCalled();
    expect(navigationToAlbumDetailSpy).not.toHaveBeenCalled();
  });
});