// core/services/updates/github-releases.service.spec.ts
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  GitHubReleasesService,
  UpdateCheckError,
  type GitHubRelease,
} from './github-releases.service';

/** Factory de fixtures con la shape de la API de GitHub. */
function release(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tag_name: 'v1.0.0',
    published_at: '2026-09-01T00:00:00Z',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'album-app.apk',
        browser_download_url:
          'https://github.com/Mudo0/album-app/releases/download/v1.0.0/album-app.apk',
      },
    ],
    body: null,
    ...overrides,
  };
}

/** Convierte el mock de get en un Observable RxJS real (`.pipe` funciona). */
function serviceWith(getResult: unknown): GitHubReleasesService {
  const http = {
    get: vi.fn().mockReturnValue(getResult),
  } as unknown as HttpClient;
  return new GitHubReleasesService(http);
}

describe('GitHubReleasesService', () => {
  // ── selectUpdate: rejilla de canales del AC (sección 2.2) ─────────────────

  it('estable + estable mayor → ofrece', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const info = svc.selectUpdate(
      [release({ tag_name: 'v1.0.1', body: 'Notas' })],
      '1.0.0',
    );
    expect(info?.version).toBe('1.0.1');
    expect(info?.fileName).toBe('album-app.apk');
    expect(info?.notes).toBe('Notas');
  });

  it('estable + alpha más nuevo → NO ofrece (canal release ignora prereleases)', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    expect(
      svc.selectUpdate(
        [release({ tag_name: 'v1.0.1-alpha.1', prerelease: true })],
        '1.0.0',
      ),
    ).toBeNull();
  });

  it('dev + build dev nuevo → ofrece (6 > 5)', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const info = svc.selectUpdate(
      [
        release({
          tag_name: 'dev-v0.0.0-alpha.6',
          prerelease: true,
          assets: [
            {
              name: 'album-app-dev.apk',
              browser_download_url:
                'https://github.com/Mudo0/album-app/releases/download/dev-v0.0.0-alpha.6/album-app-dev.apk',
            },
          ],
        }),
      ],
      '0.0.0-alpha.5',
    );
    expect(info?.version).toBe('0.0.0-alpha.6');
    expect(info?.fileName).toBe('album-app-dev.apk');
  });

  it('dev + solo estable más nuevo → NO ofrece (canal dev ignora v*)', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    expect(
      svc.selectUpdate([release({ tag_name: 'v1.0.0' })], '0.0.0-alpha.5'),
    ).toBeNull();
  });

  it('dev + build dev con misma versión → NO ofrece (nunca igual/downgrade)', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    expect(
      svc.selectUpdate(
        [release({ tag_name: 'dev-v0.0.0-alpha.5', prerelease: true })],
        '0.0.0-alpha.5',
      ),
    ).toBeNull();
  });

  // ── selectTarget: orden de publicación desc ───────────────────────────────

  it('elige el PRIMER release que cumple el canal (no ordena)', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const releases = [
      release({ tag_name: 'v1.0.2', prerelease: true }), // más nuevo pero alpha
      release({ tag_name: 'v1.0.1' }), // primer estable → este
      release({ tag_name: 'v1.0.0' }),
    ];
    expect(svc.selectTarget(releases, '1.0.0')?.tag_name).toBe('v1.0.1');
  });

  it('canal dev elige el primer dev-* publicado', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const releases = [
      release({ tag_name: 'v2.0.0' }), // más nuevo pero del otro canal
      release({ tag_name: 'dev-v0.0.0-alpha.8', prerelease: true }),
      release({ tag_name: 'dev-v0.0.0-alpha.7', prerelease: true }),
    ];
    expect(svc.selectTarget(releases, '0.0.0-alpha.6')?.tag_name).toBe(
      'dev-v0.0.0-alpha.8',
    );
  });

  // ── selectAsset: 1 APK por canal (2.3) ────────────────────────────────────

  it('release estable → album-app.apk', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const r = release({
      assets: [
        release().assets[0],
        {
          name: 'album-app-v1.0.0.apk',
          browser_download_url: '.../album-app-v1.0.0.apk',
        },
      ],
    });
    expect(svc.selectAsset(r, null)?.name).toBe('album-app.apk');
  });

  it('release prerelease → album-app-dev.apk', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const r = release({
      tag_name: 'v1.0.0-beta.1',
      assets: [
        {
          name: 'album-app-beta.1.apk',
          browser_download_url: '.../album-app-beta.1.apk',
        },
        {
          name: 'album-app-dev.apk',
          browser_download_url: '.../album-app-dev.apk',
        },
      ],
    });
    expect(svc.selectAsset(r, 'beta')?.name).toBe('album-app-dev.apk');
  });

  it('fallback al primer .apk si el canónico no está', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const r = release({
      assets: [
        {
          name: 'album-app-weird.apk',
          browser_download_url: '.../album-app-weird.apk',
        },
      ],
    });
    expect(svc.selectAsset(r, null)?.name).toBe('album-app-weird.apk');
  });

  it('null si el release no tiene ningún .apk', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    const r = release({
      assets: [{ name: 'notas.txt', browser_download_url: 'x' }],
    });
    expect(svc.selectAsset(r, null)).toBeNull();
  });

  // ── selectUpdate: filtros y bordes ────────────────────────────────────────

  it('descarta drafts (filtro del check)', async () => {
    const svc = serviceWith(of([release({ tag_name: 'v1.0.1', draft: true })]));
    expect(await firstValueFrom(svc.check('1.0.0'))).toBeNull();
  });

  it('descarta releases sin assets .apk', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    expect(
      svc.selectUpdate([release({ tag_name: 'v1.0.1', assets: [] })], '1.0.0'),
    ).toBeNull();
  });

  it('tag remoto fuera de convención → null (no crash)', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    expect(
      svc.selectUpdate(
        [release({ tag_name: 'dev-weird-tag' })],
        '0.0.0-alpha.5',
      ),
    ).toBeNull();
  });

  it('versión local mayor que la remota (rollback) → no ofrece', () => {
    const svc = new GitHubReleasesService({} as HttpClient);
    expect(svc.selectUpdate([release({ tag_name: 'v1.0.0' })], '1.0.1')).toBeNull();
  });

  // ── check(): fetch + errores ──────────────────────────────────────────────

  it('check() orquesta fetch y devuelve UpdateInfo', async () => {
    const svc = serviceWith(of([release({ tag_name: 'v1.0.1', body: 'Notas' })]));
    const info = await firstValueFrom(svc.check('1.0.0'));
    expect(info?.version).toBe('1.0.1');
    expect(info?.url).toContain('album-app.apk');
    expect(info?.notes).toBe('Notas');
  });

  it('check() sin update → null', async () => {
    const svc = serviceWith(of([release({ tag_name: 'v1.0.0' })]));
    expect(await firstValueFrom(svc.check('1.0.0'))).toBeNull();
  });

  it('error de red/API → UpdateCheckError (el checker lo hace silencioso)', async () => {
    const svc = serviceWith(
      throwError(() => new Error('HTTP 403 — rate limit')),
    );
    await expect(firstValueFrom(svc.check('1.0.0'))).rejects.toBeInstanceOf(
      UpdateCheckError,
    );
  });

  it('403 real de Angular (HttpErrorResponse) también → UpdateCheckError', async () => {
    const httpError = {
      status: 403,
      statusText: 'Forbidden',
      message: 'Http failure response for ...: 403 Forbidden',
    };
    const svc = serviceWith(throwError(() => httpError));
    await expect(firstValueFrom(svc.check('1.0.0'))).rejects.toBeInstanceOf(
      UpdateCheckError,
    );
  });
});