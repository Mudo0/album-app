// core/services/updates/github-releases.service.ts
// Fetch + parseo + selección de releases de GitHub (sección 2.2/2.3 del spec):
//
// - Un solo endpoint GET /releases?per_page=100 (sin auth, sin /releases/latest).
// - Filtro de canal en la app (NO depende del estado mutable de GitHub):
//   canal dev (local prerelease)  → primer tag que empieza con `dev-`
//   canal release (local estable) → primer tag NO `dev-` con prerelease=false
// - El asset se elige según la etapa del RELEASE REMOTO (2.3): estable →
//   `album-app.apk`, prerelease → `album-app-dev.apk`, fallback primer .apk.
// - Errores de red/API se propagan como UpdateCheckError (el checker los
//   convierte en estado 'error' silencioso — nunca crash).

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import {
  compareVersions,
  parseVersion,
  type Stage,
} from './version.compare';

export const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/Mudo0/album-app/releases?per_page=100';

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

/** Shape mínima de un release de la API de GitHub. */
export interface GitHubRelease {
  tag_name: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
  body: string | null;
}

/** Resultado de un check: qué bajar/instalar. null = no hay update. */
export interface UpdateInfo {
  /** Versión remota normalizada (sin prefijos v/dev-), solo display. */
  version: string;
  url: string;
  fileName: string;
  notes: string | null;
}

/** Error de red/API — el checker lo traga como estado 'error' silencioso. */
export class UpdateCheckError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpdateCheckError';
  }
}

type Channel = 'dev' | 'release';

/** Quita los prefijos del repo: `dev-v0.0.0-alpha.5` → `0.0.0-alpha.5`. */
function normalizeTag(tag: string): string {
  let t = tag.trim();
  if (t.startsWith('dev-')) t = t.slice('dev-'.length);
  if (t.startsWith('v')) t = t.slice(1);
  return t;
}

@Injectable({ providedIn: 'root' })
export class GitHubReleasesService {
  constructor(private readonly http: HttpClient) {}

  /** Orquesta fetch + selección. Devuelve UpdateInfo | null. */
  check(localVersion: string): Observable<UpdateInfo | null> {
    return this.http.get<GitHubRelease[]>(GITHUB_RELEASES_URL).pipe(
      // Filtros de parseo: drafts y releases sin ningún asset .apk se descartan.
      map((releases) =>
        releases.filter(
          (r) => !r.draft && r.assets.some((a) => a.name.endsWith('.apk')),
        ),
      ),
      map((releases) => this.selectUpdate(releases, localVersion)),
      catchError((cause) =>
        throwError(
          () =>
            new UpdateCheckError(
              'No se pudieron consultar actualizaciones.',
              { cause },
            ),
        ),
      ),
    );
  }

  /** Filtros de la API: descarta drafts y releases sin ningún asset .apk. */
  fetchReleases(): Observable<GitHubRelease[]> {
    return this.http.get<GitHubRelease[]>(GITHUB_RELEASES_URL);
  }

  /**
   * Selecciona el release candidato según el canal de la versión LOCAL (2.2).
   * La API lista en orden de publicación desc → el primer match ES el más
   * reciente del canal; no hay que ordenar.
   */
  selectTarget(
    releases: GitHubRelease[],
    localVersion: string,
  ): GitHubRelease | null {
    const channel = this.channelOf(localVersion);
    return (
      releases.find((r) => {
        const tag = r.tag_name ?? '';
        if (channel === 'dev') return tag.startsWith('dev-');
        return !tag.startsWith('dev-') && !r.prerelease;
      }) ?? null
    );
  }

  /**
   * Elige el asset del release según la etapa del RELEASE REMOTO (2.3):
   * estable → `album-app.apk`; prerelease → `album-app-dev.apk`.
   * Fallback: primer .apk si el canónico no está.
   */
  selectAsset(
    release: GitHubRelease,
    targetStage: Stage | null,
  ): GitHubAsset | null {
    const canonical =
      targetStage === null ? 'album-app.apk' : 'album-app-dev.apk';
    return (
      release.assets.find((a) => a.name === canonical) ??
      release.assets.find((a) => a.name.endsWith('.apk')) ??
      null
    );
  }

  /** Piensa: releases → UpdateInfo | null (toda la lógica testeable pura). */
  selectUpdate(
    releases: GitHubRelease[],
    localVersion: string,
  ): UpdateInfo | null {
    const target = this.selectTarget(releases, localVersion);
    if (!target) return null;

    // Tag remoto fuera de convención → no ofrecer (NUNCA crash por un tag ajeno
    // a la convención del repo).
    const remote = normalizeTag(target.tag_name);
    const remoteParsed = parseVersion(remote);
    if (!remoteParsed) return null;

    let cmp: number;
    try {
      cmp = compareVersions(localVersion, remote);
    } catch {
      return null;
    }
    if (cmp >= 0) return null;

    const asset = this.selectAsset(target, remoteParsed.stage);
    if (!asset) return null;

    return {
      version: remote,
      url: asset.browser_download_url,
      fileName: asset.name,
      notes: target.body ?? null,
    };
  }

  private channelOf(localVersion: string): Channel {
    return parseVersion(localVersion)?.stage ? 'dev' : 'release';
  }
}