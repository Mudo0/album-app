// scripts/dev-version.js
// Genera la versión del build dev (Fase C3 del spec auto-update.md):
//
//   git push origin dev → build-dev.yml → este script numera la versión dev
//   N+1 sobre el ÚLTIMO release dev-v* publicado (estado real del repo, no
//   contador del CI), aplica npm version + genera version.ts y expone el tag
//   `dev-vX.Y.Z[-etapa.N]` como output `version` para el workflow.
//
// Regla de numeración (spec C3):
//   - Último dev con MISMA etapa y MISMA base → N = último.N + 1
//     (ej: dev-v0.0.0-beta.1 → dev-v0.0.0-beta.2)
//   - Sin dev previo, o con ETAPA o BASE distinta → N = 1
//     (ej: al pasar de alpha a beta, la serie dev arranca en beta.1)
//   - Si la versión local es estable → se fuerza etapa alpha (C3.1)
//   - Si la consulta del último dev FALLA → el script ABORTA (exit != 0) y
//     el workflow NO publica nada. Sin fallback (spec sección 6).

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');

// ── Helpers (misma convención que scripts/release.js) ──────────────────────

function parseFullVersion(version) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/);
  if (!m) throw new Error(`Versión inválida en package.json: ${version}`);
  const [, major, minor, patch, stage, num] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    stage: stage || null,
    num: num ? Number(num) : 0,
  };
}

function formatBase(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

/** `dev-v0.0.0-beta.2` → { major, minor, patch, stage, num }. null si no parsea. */
function parseDevTag(tag) {
  const m = tag.match(
    /^dev-v(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/,
  );
  if (!m) return null;
  const [, major, minor, patch, stage, num] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    stage: stage || null,
    num: num ? Number(num) : 0,
  };
}

function exitError(msg) {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n🔢  ---  GENERAR VERSIÓN DEV  ---\n');

  // 0. Entorno (solo corre en CI dentro de build-dev.yml)
  const token = process.env.GH_TOKEN;
  if (!token) {
    exitError('GH_TOKEN no definido. Configurar env GH_TOKEN=${{ github.token }} en el workflow.');
  }
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) exitError('GITHUB_REPOSITORY no definido.');

  // 1. Base local: X.Y.Z + etapa actual del package.json
  //    (si la versión local es estable, el canal dev SIEMPRE usa alpha)
  const local = parseFullVersion(readPackageJson().version);
  const stage = local.stage ?? 'alpha';
  const base = formatBase(local);
  console.log(`   Local:    ${local.major}.${local.minor}.${local.patch}${local.stage ? '-' + local.stage + '.' + local.num : ''} (etapa forzada: ${stage})`);

  // 2. Último release dev-v* publicado (fuente de verdad, NO contador del CI).
  //    execSync lanza si gh falla (red/auth) → aborta sin publicar (sin fallback).
  let prevTag = '';
  try {
    prevTag = execSync(
      `gh api "/repos/${repo}/releases" --jq '[.[] | select(.tag_name | startswith("dev-v")) | .tag_name][0] // empty'`,
      { encoding: 'utf8', env: { ...process.env, GH_TOKEN: token } },
    ).trim();
  } catch (err) {
    exitError(
      `Falló la consulta del último release dev-v* (gh api releases): ${err.message}\n` +
        '   Abortando SIN publicar (regla sin fallback del spec).',
    );
  }

  // 3. Regla de numeración
  const prev = prevTag ? parseDevTag(prevTag) : null;
  let num = 1;
  if (prev) {
    const sameStage = prev.stage === stage;
    const sameBase = formatBase(prev) === base;
    if (sameStage && sameBase) {
      num = prev.num + 1;
      console.log(`   Último dev: ${prevTag} → N+1 = ${stage}.${num}`);
    } else if (!sameStage) {
      console.log(`   Último dev: ${prevTag} → cambia etapa a ${stage}: N = 1`);
    } else {
      console.log(`   Último dev: ${prevTag} → cambia base a ${base}: N = 1`);
    }
  } else {
    console.log('   Sin dev previo → N = 1');
  }

  // 4. Aplicar versión (semver puro en package.json — el prefijo dev-v va SOLO en el tag)
  const version = `${base}-${stage}.${num}`;
  const tag = `dev-v${version}`;
  console.log(`\n📦  Versión dev: ${tag}`);
  execSync(`npm version ${version} --no-git-tag-version`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
  execSync('node scripts/generate-version.js', { stdio: 'inherit', cwd: ROOT });

  // 5. Output para el workflow: gh release create "${{ steps.version.outputs.version }}"
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${tag}\n`);
  } else {
    console.log(`   (GITHUB_OUTPUT no definido — tag: ${tag})`);
  }

  console.log(`\n✅  Build dev ${tag} listo para publicar.\n`);
}

main();