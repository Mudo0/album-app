// core/services/updates/update-checker.service.ts
// Orquestador del auto-update (D6/D8/D9 + B3 del spec).
//
// - Gate de plataforma: en web/desktop/tests ES NO-OP SILENCIOSO (check() → null).
//   Se usa Capacitor.isNativePlatform() (método oficial) — la app solo apunta a
//   Android; isNativePlatform cubre "cualquier entorno nativo real".
// - Auto-check fire-and-forget en bootstrap (acceptPending) + re-check al volver a
//   primer plano con doble gatillo: document.visibilitychange + App.addListener('appStateChange').
// - Caché en localStorage (`update:check`): 24h. NO es gate de la API (D6/D9) —
//   check() SIEMPRE consulta GitHub. Sirve para (a) UI inmediata en cold start
//   (sin parpadeo de "verificando...") y (b) fallback cuando la API falla
//   (offline / 403 / 5xx → se sirve el último check, tabla de errores del spec).
// - "Más tarde" (dismissUpdate) silencia el DIÁLOGO 24h (no el check en sí).
// - Errores de red/API → estado 'error' silencioso, sin dialog, sin crash.
// - Suscripciones al plugin: download-progress / download-complete / download-error
//   se reflejan en signals; resumePending cubre "la app estaba muerta al descargar".

import {
  Inject,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { firstValueFrom } from 'rxjs';
import { version as LOCAL_VERSION } from '../../../../environments/version';
import { UPDATE_PLUGIN } from './update-plugin.token';
import type { UpdatePluginInterface } from './native-update.interface';
import {
  GitHubReleasesService,
  UpdateCheckError,
  type UpdateInfo,
} from './github-releases.service';

export type CheckState =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'no-update'
  | 'error';

export type DownloadState =
  | { type: 'idle' }
  | { type: 'downloading'; progress: number | null }
  | { type: 'ready' }
  /** `install: true` → el error viene de installReady (p.ej. orígenes desconocidos). */
  | { type: 'error'; message: string; install?: boolean };

interface CheckCache {
  ts: number;
  dismissed: boolean;
  result: {
    state: Exclude<CheckState, 'checking' | 'idle'>;
    info: UpdateInfo | null;
  } | null;
}

const CACHE_KEY = 'update:check';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Ignorar el evento appStateChange del propio cold start (el init ya hace el check). */
const INITIALIZING_WINDOW_MS = 2000;

@Injectable({ providedIn: 'root' })
export class UpdateCheckerService {
  private readonly plugin: UpdatePluginInterface;
  private readonly github: GitHubReleasesService;

  /**
   * Inyección por constructor con @Inject explícito: sin @Inject, el compilador
   * de Angular intenta resolver el token por el TIPO del parámetro (una
   * interface, sin valor → NG2003). En tests se instancia directo con mocks
   * (patrón del repo); en runtime Angular inyecta por token.
   */
  constructor(
    @Inject(UPDATE_PLUGIN) plugin: UpdatePluginInterface,
    @Inject(GitHubReleasesService) github: GitHubReleasesService,
  ) {
    this.plugin = plugin;
    this.github = github;
  }

  /** Versión local — fuente de verdad del canal (D1). */
  readonly localVersion = LOCAL_VERSION;

  readonly state = signal<CheckState>('idle');
  readonly info = signal<UpdateInfo | null>(null);
  readonly download = signal<DownloadState>({ type: 'idle' });

  /** Para la UI: hay update y no fue descartado en las últimas 24h. */
  readonly available = computed(
    () => this.state() === 'update-available' && !this.isDismissed(),
  );

  private started = false;

  /**
   * Arranque único. Lo llama bootstrap fire-and-forget vía provideAppInitializer.
   * NO-op en web/desktop/tests.
   */
  init(): void {
    if (this.started) return;
    this.started = true;

    if (!Capacitor.isNativePlatform()) return;

    this.subscribeToPluginEvents();
    void this.check();
    void this.resumePending();

    // Re-check al volver a primer plano (D6): doble gatillo.
    // visibilitychange es frágil en WebView al retomar; appStateChange es el
    // canal nativo confiable de Capacitor ("app volvió a primer plano"). Ambos
    // llaman al MISMO check() (idempotente vía caché) — no hay doble request.
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void App.addListener('appStateChange', this.onAppStateChange);
  }

  /**
   * Conduce el check completo. `force` saltea la caché (futuro botón manual en
   * Settings). NO-op silencioso fuera de Android (D8).
   *
   * La caché NO gatea la API: siempre consulta GitHub (un request por resume es
   * inofensivo, D6). Con caché fresca la usa solo para (a) pintar la UI inmediata
   * (cold start sin parpadeo) y (b) servirla como fallback si la API falla.
   */
  async check(force = false): Promise<UpdateInfo | null> {
    if (!Capacitor.isNativePlatform()) return null;

    const cached = this.readCache();
    const cacheFresh = !!cached?.result && Date.now() - cached.ts < CACHE_TTL_MS;

    // UI inmediata: pintar el último resultado cacheado mientras responde la API.
    // clearOnForce: con force=true no se usa caché (ni para UI ni como fallback).
    if (cacheFresh && !force) {
      this.state.set(cached.result!.state);
      this.info.set(cached.result!.info);
    } else {
      this.state.set('checking');
    }

    try {
      const info = await firstValueFrom(this.github.check(this.localVersion));
      this.info.set(info);
      this.state.set(info ? 'update-available' : 'no-update');
      this.writeCache(info ? 'update-available' : 'no-update', info);
      return info;
    } catch (error) {
      // Offline / 403 / 5xx → servir el último check fresco; si no hay, error
      // silencioso (sin diálogo, sin crash).
      if (cacheFresh && !force) {
        this.state.set(cached.result!.state);
        this.info.set(cached.result!.info);
        return cached.result!.info;
      }
      const message =
        error instanceof UpdateCheckError
          ? error.message
          : 'No se pudo verificar actualizaciones.';
      this.state.set('error');
      this.download.set({ type: 'error', message });
      return null;
    }
  }

  /** "Más tarde": silencia el diálogo de update 24h (no el check en sí). */
  dismissUpdate(): void {
    this.writeCache('no-update', null, true);
    this.state.set('no-update');
  }

  /** Inicia la descarga del APK (botón "Actualizar ahora"). */
  async startDownload(): Promise<void> {
    const info = this.info();
    if (!info) return;
    this.download.set({ type: 'downloading', progress: null });
    try {
      await this.plugin.download({ url: info.url, fileName: info.fileName });
    } catch {
      this.download.set({ type: 'error', message: 'No se pudo iniciar la descarga.' });
    }
  }

  /** Instala el APK listo (botón "Instalar ahora"). */
  async installReady(): Promise<void> {
    const info = this.info();
    if (!info) return;
    try {
      await this.plugin.install({ fileName: info.fileName });
      this.download.set({ type: 'idle' });
      this.state.set('no-update');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      this.download.set({
        type: 'error',
        install: true,
        message:
          code === 'unknownSourcesRequired'
            ? 'Habilitá la instalación de orígenes desconocidos y reintentá.'
            : 'No se pudo instalar la actualización.',
      });
    }
  }

  /**
   * Retoma descargas que quedaron a mitad/terminadas mientras la app estaba
   * muerta (D4/A2). El plugin emite el evento correspondiente vía resumePending.
   */
  async resumePending(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await this.plugin.resumePending();
    } catch {
      /* no-op */
    }
  }

  // ── Privado ───────────────────────────────────────────────────────────────

  private subscribeToPluginEvents(): void {
    this.plugin.addListener('download-progress', (d) => {
      const { bytes, total } = d as { bytes: number; total: number };
      this.download.set({
        type: 'downloading',
        progress: total > 0 ? bytes / total : null,
      });
    });
    this.plugin.addListener('download-complete', () => {
      this.download.set({ type: 'ready' });
    });
    this.plugin.addListener('download-error', (d) => {
      this.download.set({
        type: 'error',
        message: (d as { message?: string })?.message ?? 'Error en la descarga.',
      });
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') void this.check();
  };

  private readonly onAppStateChange = ({ isActive }: { isActive: boolean }): void => {
    // El appStateChange del cold start llega con isActive=true apenas arranca;
    // el init() ya hizo el check → ignorarlo en esa ventana inicial.
    if (isActive && Date.now() > INITIALIZING_WINDOW_MS) {
      void this.check();
    }
  };

  private isDismissed(): boolean {
    const cached = this.readCache();
    return !!cached?.dismissed && Date.now() - cached.ts < CACHE_TTL_MS;
  }

  private readCache(): CheckCache | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as CheckCache) : null;
    } catch {
      return null;
    }
  }

  private writeCache(
    state: Exclude<CheckState, 'checking' | 'idle'>,
    info: UpdateInfo | null,
    dismissed = false,
  ): void {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), dismissed, result: { state, info } } satisfies CheckCache),
      );
    } catch {
      /* localStorage no disponible → sin caché, no bloquea */
    }
  }
}