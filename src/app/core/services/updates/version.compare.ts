// core/services/updates/version.compare.ts
// Comparador de versiones del proyecto (NO semver puro — convención propia):
//
//   X.Y.Z[-etapa.N]          ej: 1.0.0, 1.0.0-alpha.2, 1.0.0-rc.1
//
// Orden de etapas para la MISMA base X.Y.Z: stable (sin sufijo) > rc > beta > alpha.
// Los tags de GitHub vienen prefijados con `v` (v1.0.0-alpha.2) y los builds dev
// con `dev-` (dev-v0.0.0-alpha.5) → siempre se normalizan antes de comparar.

export type Stage = 'alpha' | 'beta' | 'rc';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  stage: Stage | null; // null = stable
  num: number; // número de etapa (0 si estable)
}

/** Etapas de menor a mayor madurez; `null` (stable) gana a todas. */
export const STAGE_ORDER: readonly Stage[] = ['rc', 'beta', 'alpha'];

export type CompareResult = -1 | 0 | 1;

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/;

/**
 * Parsea una versión normalizando los prefijos del repo:
 * - `dev-v0.0.0-alpha.5` → se quita `dev-` primero, después la `v`.
 * - `v1.0.0` → `1.0.0`.
 * Devuelve null si el formato no matchea la convención.
 */
export function parseVersion(raw: string): ParsedVersion | null {
  let v = raw.trim();
  if (v.startsWith('dev-')) v = v.slice('dev-'.length);
  if (v.startsWith('v')) v = v.slice(1);

  const m = v.match(VERSION_RE);
  if (!m) return null;

  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    stage: (m[4] as Stage | undefined) ?? null,
    num: m[5] !== undefined ? Number(m[5]) : 0,
  };
}

function compareBase(a: ParsedVersion, b: ParsedVersion): CompareResult {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return 0;
}

/** Mayor madurez = mayor rango. null (stable) = 4 > rc = 3 > beta = 2 > alpha = 1. */
function stageRank(stage: Stage | null): number {
  if (stage === null) return STAGE_ORDER.length + 1;
  return STAGE_ORDER.length - STAGE_ORDER.indexOf(stage);
}

/**
 * Compara dos versiones de la convención del proyecto:
 * 1. Gana la base X.Y.Z mayor (aunque la otra esté en etapa más madura).
 * 2. Base igual → gana la etapa: stable > rc > beta > alpha.
 * 3. Misma etapa → gana el número de etapa N.
 *
 * Lanza si alguna versión no parsea (error de programación del caller —
 * los parsers de tags ajenos deben filtrar con parseVersion antes).
 */
export function compareVersions(aRaw: string, bRaw: string): CompareResult {
  const a = parseVersion(aRaw);
  const b = parseVersion(bRaw);
  if (!a || !b) {
    throw new Error(`Versión inválida al comparar: "${aRaw}" vs "${bRaw}"`);
  }

  const base = compareBase(a, b);
  if (base !== 0) return base;

  const stageA = stageRank(a.stage);
  const stageB = stageRank(b.stage);
  if (stageA !== stageB) return stageA > stageB ? 1 : -1;

  if (a.num !== b.num) return a.num > b.num ? 1 : -1;
  return 0;
}