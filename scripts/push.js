const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DISCORD_SCRIPT = path.join(__dirname, 'discord.js');

// ── Helpers ────────────────────────────────────────────────────────────────

function gitCapture(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} falló`);
  return result.stdout.trim();
}

function gitQuiet(args) {
  // Ejecuta git capturando la salida en vez de heredar la consola,
  // así el script controla qué se muestra y qué no
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function checkGitState() {
  // Verificar si hay cambios sin commitear (untracked, modified, staged)
  const status = execSync('git status --porcelain', { cwd: ROOT })
    .toString()
    .trim();

  if (status) return 'HAS_CHANGES';

  // Si no hay cambios locales, ver qué relación hay con el remoto
  const branchStatus = execSync('git status -sb', { cwd: ROOT }).toString();

  if (!branchStatus.includes('...')) return 'NO_UPSTREAM';

  const m = branchStatus.match(/\[([^\]]*)\]/);
  const info = m ? m[1] : '';
  const ahead = info.includes('ahead');
  const behind = info.includes('behind');

  if (ahead && behind) return 'DIVERGED';
  if (ahead) return 'AHEAD_ONLY';
  if (behind) return 'BEHIND';
  return 'CLEAN';
}

function getBranch() {
  return gitCapture(['rev-parse', '--abbrev-ref', 'HEAD']);
}

function getUpstream() {
  return gitCapture(['rev-parse', '--abbrev-ref', '@{u}']);
}

function getPendingCommits() {
  // Subjects de los commits que se van a subir en este push: upstream..HEAD
  try {
    const upstream = getUpstream();
    const out = gitCapture(['log', `${upstream}..HEAD`, '--format=%s']);
    return out ? out.split('\n') : [];
  } catch {
    // Sin upstream configurado: queda lo último de la rama local
    try {
      const out = gitCapture(['log', '-1', '--format=%s']);
      return out ? [out] : [];
    } catch {
      return [];
    }
  }
}

function getHeadTags() {
  // Tags del commit actual (ej: vX.Y.Z-etapa.N creados por release.js)
  try {
    const out = gitCapture(['tag', '--points-at', 'HEAD']);
    return out ? out.split('\n') : [];
  } catch {
    return [];
  }
}

function pushCommitsAndTags() {
  // --quiet suprime el ruido del transporte (Enumerating/Counting/Writing...);
  // los errores igual salen en stderr y se propagan como excepción
  const push = gitQuiet(['push', '--quiet']);
  if (push.status !== 0) throw new Error(push.stderr.trim() || 'git push falló');

  // Los tags (vX.Y.Z-etapa.N) disparan el workflow en GitHub
  const tags = gitQuiet(['push', '--tags', '--quiet']);
  if (tags.status !== 0) throw new Error(tags.stderr.trim() || 'git push --tags falló');
}

function buildDiscordMessage(commits) {
  // Registro legible para otras personas: rama + release + lista de cambios
  const lines = [`rama: ${getBranch()}`];

  const tags = getHeadTags();
  if (tags.length > 0) lines.push(`release: ${tags.join(', ')}`);

  const subjects = commits.filter(Boolean);
  if (subjects.length > 0) {
    lines.push('', 'cambios:');
    subjects.slice(0, 10).forEach((c) => lines.push(`  • ${c}`));
    if (subjects.length > 10) {
      lines.push(`  … y ${subjects.length - 10} commits más`);
    }
  }

  return lines.join('\n');
}

function notifyDiscord(message) {
  console.log('⏳  Enviando notificación a Discord...');
  const discord = spawnSync('node', [DISCORD_SCRIPT], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, DISCORD_MESSAGE: message },
  });

  if (discord.status !== 0) {
    console.warn('⚠️  El push se completó, pero la notificación a Discord falló.');
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const state = checkGitState();

  if (state === 'CLEAN') {
    console.log('ℹ️  No hay nada para commitear ni pushear. Repositorio al día.');
    process.exit(0);
  }

  if (state === 'BEHIND') {
    console.error('⛔  El remoto tiene commits que no tenés (estás detrás).');
    console.error('    Hacé `git pull` y volvé a intentar.');
    process.exit(1);
  }

  if (state === 'DIVERGED') {
    console.error('⛔  Tu rama y el remoto divergieron.');
    console.error('    Hacé `git pull --rebase`, resolvé los conflictos y volvé a intentar.');
    process.exit(1);
  }

  if (state === 'NO_UPSTREAM') {
    console.error('⛔  No hay rama remota configurada para esta rama.');
    console.error(`    Subila una vez con: git push -u origin ${getBranch()}`);
    process.exit(1);
  }

  // Solo hay commits pendientes de subir
  if (state === 'AHEAD_ONLY') {
    console.log('ℹ️  No hay cambios nuevos, pero tenés commits pendientes de subir.');
    const commits = getPendingCommits();

    try {
      pushCommitsAndTags();
      console.log(`✅  Push completado (${getBranch()} → ${getUpstream()}).`);
      notifyDiscord(buildDiscordMessage(commits));
      process.exit(0);
    } catch (err) {
      console.error('❌  Error al hacer git push:', err.message);
      process.exit(1);
    }
  }

  // Hay cambios locales: pedir el mensaje del commit
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const commitMessage = await new Promise((resolve) =>
    rl.question('✏️  Mensaje del commit: ', resolve),
  );

  if (!commitMessage.trim()) {
    console.error('❌  Cancelado: El mensaje no puede estar vacío.');
    rl.close();
    process.exit(1);
  }

  try {
    console.log('⏳  Agregando cambios...');
    execSync('git add .', { stdio: 'inherit', cwd: ROOT });

    console.log(`⏳  Creando commit: "${commitMessage}"...`);
    // spawnSync con args en array: el mensaje puede tener comillas o caracteres raros.
    // --quiet suprime el resumen de git; el script muestra el suyo más legible
    const commit = gitQuiet(['commit', '--quiet', '-m', commitMessage]);
    if (commit.status !== 0) {
      throw new Error(commit.stderr.trim() || 'git commit falló');
    }

    try {
      const shortHash = gitCapture(['rev-parse', '--short', 'HEAD']);
      console.log(`✅  Commit creado: ${shortHash}`);
    } catch {
      console.log('✅  Commit creado.');
    }

    // El commit nuevo ya está incluido en el rango upstream..HEAD
    const commits = getPendingCommits();

    console.log('⏳  Subiendo al repositorio...');
    pushCommitsAndTags();

    console.log(`✅  Push completado (${getBranch()} → ${getUpstream()}).`);
    notifyDiscord(buildDiscordMessage(commits));
    process.exit(0);
  } catch (err) {
    console.error('❌  Proceso abortado:', err.message);
    process.exit(1);
  }
}

main();
