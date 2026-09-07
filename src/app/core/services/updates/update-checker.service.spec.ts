// core/services/updates/update-checker.service.spec.ts
// Specs del orquestador: gates de plataforma, caché, doble gatillo de re-check,
// suscripciones de descarga y flujo completo del diálogo.
import { of, throwError } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { UpdateCheckerService } from './update-checker.service';
import { UpdateCheckError, type GitHubReleasesService, type UpdateInfo } from './github-releases.service';
import type { UpdatePluginInterface } from './native-update.interface';

// ── Mocks de módulos externos ──────────────────────────────────────────────
// - Capacitor (gate de plataforma): se mockea el MÉTODO real con vi.spyOn
//   (patrón del repo, ver image-uploader.spec) — NO vi.mock del módulo, porque
//   el bundler comparte @capacitor/core con specs que lo usan real y el mock a
//   veces se degrada (flake: 18 tests caídos en bloque).
// - App (appStateChange): vi.mock estable — es el ÚNICO consumer de
//   @capacitor/app; el listener se captura para dispararlo manualmente
//   (equivalente a volver de background).

const { appStateListeners } = vi.hoisted(() => ({
  appStateListeners: [] as Array<(data: { isActive: boolean }) => void>,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((_event: string, cb: (data: { isActive: boolean }) => void) => {
      appStateListeners.push(cb);
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const INFO: UpdateInfo = {
  version: '1.0.1',
  url: 'https://github.com/Mudo0/album-app/releases/download/v1.0.1/album-app.apk',
  fileName: 'album-app.apk',
  notes: 'Notas',
};

function pluginMock(): UpdatePluginInterface {
  return {
    download: vi.fn().mockResolvedValue({ downloadId: 1 }),
    install: vi.fn().mockResolvedValue({ started: true }),
    resumePending: vi.fn().mockResolvedValue({ state: 'none' }),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  } as unknown as UpdatePluginInterface;
}

function githubMock(checkResult?: unknown): GitHubReleasesService {
  return {
    check: vi.fn().mockReturnValue(checkResult === undefined ? of(null) : checkResult),
  } as unknown as GitHubReleasesService;
}

function createService(plugin = pluginMock(), github = githubMock()) {
  return new UpdateCheckerService(plugin, github);
}

beforeEach(() => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  appStateListeners.length = 0;
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Gate de plataforma (D8): no-op en web/desktop/tests ─────────────────────

describe('UpdateCheckerService — plataforma', () => {
  it('check() es no-op silencioso en web (isNativePlatform false)', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const github = githubMock(of(INFO));
    const service = createService(undefined, github);

    expect(await service.check()).toBeNull();
    expect(github.check).not.toHaveBeenCalled();
    expect(service.state()).toBe('idle');
  });

  it('init() no-op en web: no suscribe eventos ni dispara check', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const plugin = pluginMock();
    const service = createService(plugin);

    service.init();

    expect(plugin.addListener).not.toHaveBeenCalled();
    // El App listener tampoco (document.addEventListener sí, pero con platform false no llegamos)
  });
});

// ── check(): flujo principal ────────────────────────────────────────────────

describe('UpdateCheckerService — check', () => {
  it('update disponible → state update-available + info', async () => {
    const service = createService(undefined, githubMock(of(INFO)));
    const result = await service.check();

    expect(result?.version).toBe('1.0.1');
    expect(service.state()).toBe('update-available');
    expect(service.available()).toBe(true);
    expect(service.info()).toEqual(INFO);
  });

  it('sin update → state no-update', async () => {
    const service = createService();
    await service.check();

    expect(service.state()).toBe('no-update');
    expect(service.available()).toBe(false);
  });

  it('error de red/API (UpdateCheckError del github service) → estado error sin crash', async () => {
    const github = githubMock(
      throwError(() => new UpdateCheckError('No se pudieron consultar actualizaciones.')),
    );
    const service = createService(undefined, github);

    const result = await service.check();

    expect(result).toBeNull();
    expect(service.state()).toBe('error');
    expect(service.download().type).toBe('error');
  });

  it('error 403 inesperado → estado error, igual sin crash', async () => {
    const github = githubMock(throwError(() => new Error('HTTP 403')));
    const service = createService(undefined, github);

    expect(await service.check()).toBeNull();
    expect(service.state()).toBe('error');
  });

  it('caché fresca + API ok → pinta UI inmediata pero IGUAL consulta la API (no es gate)', async () => {
    const github = githubMock(of(INFO));
    const service = createService(undefined, github);

    await service.check(); // pobló la caché con update-available

    // appState deliver: aunque la caché diga update-available, la API se consulta
    const github2 = githubMock(of(INFO));
    const service2 = createService(undefined, github2);
    await service2.check();

    expect(github2.check).toHaveBeenCalledTimes(1);
    expect(service2.state()).toBe('update-available');
  });

  it('fallback: caché fresca + error de API (403/5xx) → sirve el último check, sin crash', async () => {
    const github = githubMock(of(INFO));
    const service = createService(undefined, github);
    await service.check(); // pobló la caché con update-available

    const github2 = githubMock(throwError(() => new Error('HTTP 403')));
    const service2 = createService(undefined, github2);

    const result = await service2.check();

    expect(result?.version).toBe(INFO.version);
    expect(service2.state()).toBe('update-available'); // servido de la caché
  });

  it('check(force=true): no usa caché para UI ni como fallback', async () => {
    const github = githubMock(of(INFO));
    const service = createService(undefined, github);
    await service.check(); // pobló caché

    const github2 = githubMock(throwError(() => new Error('HTTP 403')));
    const service2 = createService(undefined, github2);

    await service2.check(true);

    expect(service2.state()).toBe('error'); // fuerza → no hay fallback de caché
  });
});

// ── dismissUpdate: "Más tarde" silencia 24h ─────────────────────────────────

describe('UpdateCheckerService — dismiss', () => {
  it('dismissUpdate → available false aunque haya update', async () => {
    const service = createService(undefined, githubMock(of(INFO)));
    await service.check();

    expect(service.available()).toBe(true);

    service.dismissUpdate();

    expect(service.available()).toBe(false);
    expect(service.state()).toBe('no-update');
  });
});

// ── Descarga e instalación ──────────────────────────────────────────────────

describe('UpdateCheckerService — download/install', () => {
  it('startDownload llama al plugin con url y fileName', async () => {
    const plugin = pluginMock();
    const service = createService(plugin, githubMock(of(INFO)));
    await service.check();

    await service.startDownload();

    expect(plugin.download).toHaveBeenCalledWith({
      url: INFO.url,
      fileName: INFO.fileName,
    });
    expect(service.download().type).toBe('downloading');
  });

  it('startDownload sin update previo → no llama al plugin', async () => {
    const plugin = pluginMock();
    const service = createService(plugin); // sin update
    await service.startDownload();

    expect(plugin.download).not.toHaveBeenCalled();
  });

  it('download-progress del plugin → progress en signal', async () => {
    const plugin = pluginMock();
    // capturar el listener de download-progress
    const listeners: Record<string, (d: Record<string, unknown>) => void> = {};
    plugin.addListener = vi.fn((event: string, cb: (d: Record<string, unknown>) => void) => {
      listeners[event] = cb;
      return Promise.resolve({ remove: vi.fn() });
    }) as UpdatePluginInterface['addListener'];
    const service = createService(plugin);

    service.init();
    listeners['download-progress']?.({ bytes: 50, total: 100 });

    expect(service.download()).toEqual({ type: 'downloading', progress: 0.5 });
  });

  it('download-complete → estado ready', async () => {
    const plugin = pluginMock();
    const listeners: Record<string, (d: Record<string, unknown>) => void> = {};
    plugin.addListener = vi.fn((event: string, cb: (d: Record<string, unknown>) => void) => {
      listeners[event] = cb;
      return Promise.resolve({ remove: vi.fn() });
    }) as UpdatePluginInterface['addListener'];
    const service = createService(plugin);

    service.init();
    listeners['download-complete']?.({ fileName: INFO.fileName });

    expect(service.download().type).toBe('ready');
  });

  it('download-error → estado error con mensaje', async () => {
    const plugin = pluginMock();
    const listeners: Record<string, (d: Record<string, unknown>) => void> = {};
    plugin.addListener = vi.fn((event: string, cb: (d: Record<string, unknown>) => void) => {
      listeners[event] = cb;
      return Promise.resolve({ remove: vi.fn() });
    }) as UpdatePluginInterface['addListener'];
    const service = createService(plugin);

    service.init();
    listeners['download-error']?.({ message: 'La descarga falló.' });

    expect(service.download()).toEqual({ type: 'error', message: 'La descarga falló.' });
  });

  it('installReady → instala y pasa a no-update', async () => {
    const plugin = pluginMock();
    const service = createService(plugin, githubMock(of(INFO)));
    await service.check();
    service.download.set({ type: 'ready' });

    await service.installReady();

    expect(plugin.install).toHaveBeenCalledWith({ fileName: INFO.fileName });
    expect(service.state()).toBe('no-update');
    expect(service.download().type).toBe('idle');
  });

  it('installReady con unknownSourcesRequired → mensaje claro, sin crash', async () => {
    const plugin = pluginMock();
    plugin.install = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { code: 'unknownSourcesRequired' }));
    const service = createService(plugin, githubMock(of(INFO)));
    await service.check();
    service.download.set({ type: 'ready' });

    await service.installReady();

    expect(service.download().type).toBe('error');
    expect(service.download()).toMatchObject({
      message: expect.stringContaining('orígenes desconocidos') as string,
    });
  });
});

// ── init + re-check (D9 / D6) ───────────────────────────────────────────────

describe('UpdateCheckerService — init y re-check', () => {
  it('init en android: check + resumePending + suscribe a eventos', async () => {
    const plugin = pluginMock();
    const service = createService(plugin, githubMock(of(INFO)));

    service.init();

    // los addListener se invocan para los 3 eventos del plugin (y App mock aparte)
    expect((plugin.addListener as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    expect(plugin.resumePending).toHaveBeenCalled();
  });

  it('init es idempotente (no duplica suscripciones)', () => {
    const plugin = pluginMock();
    const service = createService(plugin);

    service.init();
    service.init();

    expect(plugin.addListener).toHaveBeenCalledTimes(3); // 3 eventos, una sola vez
  });

  it('visibilitychange visible → re-check (llama la API de nuevo, sin throttle)', async () => {
    const github = githubMock(of(INFO));
    const service = createService(pluginMock(), github);

    service.init(); // 1ª consulta (bootstrap) — registro de listeners incluido
    await vi.waitFor(() => expect(github.check).toHaveBeenCalledTimes(1));

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(github.check).toHaveBeenCalledTimes(2));
  });

  it('appStateChange isActive (post cold-start) → re-check (doble gatillo)', async () => {
    vi.useFakeTimers();
    try {
      const github = githubMock(of(INFO));
      const service = createService(pluginMock(), github);
      service.init(); // check del bootstrap (1ª llamada)

      // pasar la ventana inicial (el init ya hizo el check)
      await vi.advanceTimersByTimeAsync(2100);

      appStateListeners.forEach((cb) => cb({ isActive: true }));

      // el re-check llama a la API de nuevo aunque haya caché fresca (D6: no gate)
      await vi.advanceTimersByTimeAsync(0);
      expect(github.check).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});