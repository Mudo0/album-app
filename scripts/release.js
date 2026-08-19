const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ── Constantes ──────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');

// Convención de versiones: vMAJOR.MINOR.PATCH[-etapa.N]
//   alpha (pruebas internas) -> beta (testers) -> rc (casi lista) -> (sin sufijo, estable)
const STAGE_ORDER = ['alpha', 'beta', 'rc', 'stable'];
const STAGE_LABELS = { alpha: 'Alpha', beta: 'Beta', rc: 'RC', stable: 'Estable' };

// ── Readline ────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

// ── Helpers ─────────────────────────────────────────────────────────────────

function exec(command, options = {}) {
  return execSync(command, { stdio: 'inherit', cwd: ROOT, ...options });
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} falló con código ${result.status}`);
  }
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function restoreVersionSnapshot(originalPkg, originalLock) {
  fs.writeFileSync(PKG_PATH, JSON.stringify(originalPkg, null, 2) + '\n');

  // npm version también actualiza package-lock.json: hay que restaurar ambos
  // o quedan desincronizados y npm ci falla
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (originalLock !== null && fs.existsSync(lockPath)) {
    fs.writeFileSync(lockPath, originalLock);
  }
}

// ── Versionado por etapas ───────────────────────────────────────────────────
// Máquina de estados según la convención vMAJOR.MINOR.PATCH[-etapa.N]:
//
//   v1.0.0 (estable)  + alpha/beta/rc -> v1.0.0-alpha.1   (arranca etapa: base intacta, N=1)
//   v1.0.0-alpha.1    + alpha         -> v1.0.0-alpha.2   (misma etapa: N+1)
//   v1.0.0-alpha.2    + beta          -> v1.0.0-beta.1    (cambia etapa: resetea a 1)
//   v1.0.0-beta.2     + rc            -> v1.0.0-rc.1
//   v1.0.0-rc.1       + estable       -> v1.0.0           (publicar: quita sufijo)
//   v1.0.0 (estable)  + estable+patch -> v1.0.1           (corrección directa)
//   v1.0.0-beta.1     + alpha+patch   -> v1.0.1-alpha.1   (volver atrás: bump base + reset etapa)
//   v1.0.0-rc.2       + alpha+minor   -> v1.1.0-alpha.1   (volver atrás: bump base + reset etapa)

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

function formatFullVersion(v) {
  return v.stage
    ? `${v.major}.${v.minor}.${v.patch}-${v.stage}.${v.num}`
    : `${v.major}.${v.minor}.${v.patch}`;
}

function bumpBase(v, type) {
  switch (type) {
    case 'patch':
      return { major: v.major, minor: v.minor, patch: v.patch + 1 };
    case 'minor':
      return { major: v.major, minor: v.minor + 1, patch: 0 };
    case 'major':
      return { major: v.major + 1, minor: 0, patch: 0 };
    default:
      throw new Error(`Tipo de cambio inválido: ${type}`);
  }
}

function nextVersion(current, stage, releaseType) {
  const v = parseFullVersion(current);

  // La versión actual es estable
  if (!v.stage) {
    if (stage === 'stable') {
      // Release estable: cambia la base X.Y.Z según patch/minor/major
      return bumpBase(v, releaseType);
    }
    // Arranca una etapa nueva sobre la MISMA base: v1.0.0 -> v1.0.0-alpha.1
    // Las etapas alpha/beta/rc nunca tocan X.Y.Z, solo el número de etapa
    return { ...v, stage, num: 1 };
  }

  // La versión actual ya es prerelease (v.X.Y.Z-etapa.N)
  if (stage === 'stable') {
    // Publicar: quitar el sufijo de etapa
    return { major: v.major, minor: v.minor, patch: v.patch, stage: null, num: 0 };
  }

  if (stage === v.stage) {
    // Continuar la misma etapa: N + 1
    return { ...v, num: v.num + 1 };
  }

  // Cambiar de etapa (alpha -> beta, beta -> rc): resetea el número a 1
  // Si se provee releaseType (ej: volver de beta a alpha con patch), bump la base
  if (releaseType) {
    const bumped = bumpBase(v, releaseType);
    return { ...bumped, stage, num: 1 };
  }
  return { major: v.major, minor: v.minor, patch: v.patch, stage, num: 1 };
}

function exitError(msg) {
  console.error(`\n❌  ${msg}\n`);
  rl.close();
  process.exit(1);
}

// ── Input ───────────────────────────────────────────────────────────────────

async function askStage() {
  console.log('\n¿Qué etapa es esta versión?');
  console.log('  1) Alpha — pruebas internas');
  console.log('  2) Beta — pruebas con testers');
  console.log('  3) RC — release candidate (casi lista)');
  console.log('  4) Estable — publicar a producción\n');

  const answer = (await ask('Opción [1]: ')).trim() || '1';
  return STAGE_ORDER[Number(answer) - 1] ?? 'alpha';
}

async function askReleaseType(currentVersion) {
  const v = parseFullVersion(currentVersion);
  const patchV = formatFullVersion(bumpBase(v, 'patch'));
  const minorV = formatFullVersion(bumpBase(v, 'minor'));
  const majorV = formatFullVersion(bumpBase(v, 'major'));

  console.log('\n¿Qué tipo de cambio es (define la base X.Y.Z)?');
  console.log(`  1) Patch  (${currentVersion} → ${patchV})  — Corrección de errores`);
  console.log(`  2) Minor  (${currentVersion} → ${minorV})  — Nueva funcionalidad`);
  console.log(`  3) Major  (${currentVersion} → ${majorV})  — Cambio grande / rediseño\n`);

  const answer = (await ask('Opción [1]: ')).trim() || '1';
  const types = { 1: 'patch', 2: 'minor', 3: 'major' };
  return types[answer] ?? 'patch';
}

async function askCommitMessage() {
  return (await ask('\nMensaje descriptivo del cambio: ')).trim();
}

// ── Pipeline ────────────────────────────────────────────────────────────────

function runTests() {
  console.log('\n🧪  Ejecutando tests...');
  exec('ng test --no-watch');
}

function runBuild() {
  console.log('\n🔨  Compilando Angular...');
  exec('ng build');
}

function bumpVersion(newVersion) {
  console.log(`\n📦  Actualizando versión a ${newVersion}...`);
  // Con versión exacta npm version actualiza package.json Y package-lock.json
  exec(`npm version ${newVersion} --no-git-tag-version`);

  const commitMessage = `v${newVersion}`;
  return commitMessage;
}

function generateVersionFile() {
  exec('node scripts/generate-version.js');
}

function stageAndCommit(commitMessage) {
  console.log('\n📝  Guardando cambios en Git...');
  exec('git add .');

  try {
    execSync('git diff --cached --quiet', { stdio: 'pipe', cwd: ROOT });
    console.log('   No hay cambios nuevos que commitear, se omite el commit.');
  } catch {
    // spawnSync con args en array: el mensaje puede tener comillas o caracteres raros
    run('git', ['commit', '-m', commitMessage]);
  }
}

function createVersionTag(version) {
  const tag = `v${version}`;

  try {
    // Si el tag ya existe (re-publicación), no lo recrea
    execSync(`git rev-parse -q --verify refs/tags/${tag}`, {
      stdio: 'pipe',
      cwd: ROOT,
    });
    console.log(`   El tag ${tag} ya existe, se omite.`);
  } catch {
    run('git', ['tag', tag]);
    console.log(`   Tag ${tag} creado.`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  ---  PREPARAR RELEASE LOCAL  ---\n');

  const originalPkg = readPackageJson();
  const originalLock = fs.existsSync(path.join(ROOT, 'package-lock.json'))
    ? fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')
    : null;
  const originalVersion = originalPkg.version;
  const currentIsPrerelease = parseFullVersion(originalVersion).stage !== null;

  const stage = await askStage();

  // El tipo de cambio (patch/minor/major) se pregunta en dos casos:
  //  1) Publicar ESTABLE desde versión estable: cambia la base X.Y.Z.
  //  2) Volver a una etapa anterior (ej: beta → alpha): permite bump de la base.
  let releaseType = null;
  if (stage === 'stable') {
    if (currentIsPrerelease) {
      console.log(
        `\nℹ️  Publicando ${originalVersion} → ${parseFullVersion(originalVersion).major}.${parseFullVersion(originalVersion).minor}.${parseFullVersion(originalVersion).patch} (sin etapa)`,
      );
    } else {
      releaseType = await askReleaseType(originalVersion);
    }
  } else if (currentIsPrerelease) {
    const currentStageIndex = STAGE_ORDER.indexOf(parseFullVersion(originalVersion).stage);
    const targetStageIndex = STAGE_ORDER.indexOf(stage);
    if (targetStageIndex < currentStageIndex) {
      console.log(
        `\n⚠️  Volviendo de ${STAGE_LABELS[parseFullVersion(originalVersion).stage]} a ${STAGE_LABELS[stage]}`,
      );
      releaseType = await askReleaseType(originalVersion);
    }
  }

  const userMessage = await askCommitMessage();

  let versionBumped = false;
  let commitDone = false;

  try {
    runTests();
    runBuild();

    const newVersion = formatFullVersion(
      nextVersion(originalVersion, stage, releaseType),
    );
    const commitMessage = bumpVersion(newVersion);
    versionBumped = true;

    generateVersionFile();
    stageAndCommit(
      userMessage ? `${commitMessage}: ${userMessage}` : commitMessage,
    );
    commitDone = true;

    createVersionTag(newVersion);

    console.log(`\n✅  Release v${newVersion} (${STAGE_LABELS[stage]}) commiteada y etiquetada.`);
    console.log('➡️   Subí código + tag con: npm run push\n');
  } catch (err) {
    if (versionBumped && !commitDone) {
      restoreVersionSnapshot(originalPkg, originalLock);
      console.log(
        `\n↩️   Versión restaurada a ${originalVersion} (package.json y package-lock.json)`,
      );
    }

    exitError(err.message);
  }

  rl.close();
}

main();
