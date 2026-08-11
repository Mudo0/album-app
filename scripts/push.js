const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function git(args, options = {}) {
  return spawnSync('git', args, { stdio: 'inherit', cwd: ROOT, ...options });
}

function checkGitState() {
  // Verificar si hay cambios sin commitear (untracked, modified, staged)
  const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();

  if (status) {
    return 'HAS_CHANGES';
  }

  // Si no hay cambios locales, verificar si hay commits pendientes de pushear
  const branchStatus = execSync('git status -sb', { cwd: ROOT }).toString();
  if (branchStatus.includes('[ahead')) {
    return 'AHEAD_ONLY';
  }

  return 'CLEAN';
}

const state = checkGitState();

if (state === 'CLEAN') {
  console.log('ℹ️  No hay nada para commitear ni pushear. Repositorio al día.');
  process.exit(0);
}

if (state === 'AHEAD_ONLY') {
  console.log('ℹ️  No hay cambios nuevos, pero tenés commits pendientes de subir.');
  console.log('⏳  Subiendo commits al repositorio...');

  try {
    const push = git(['push']);
    if (push.status !== 0) throw new Error('git push falló');
    // Los tags (vX.Y.Z-etapa.N) disparan el workflow en GitHub
    git(['push', '--tags']);
    console.log('✅  Push completado.');
  } catch (error) {
    console.error('❌  Error al hacer git push:', error.message);
  }

  process.exit(0);
}

// Si hay cambios locales, pedir el mensaje de commit
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('✏️  Ingresa el mensaje del commit: ', (commitMessage) => {
  if (!commitMessage.trim()) {
    console.error('❌  Cancelado: El mensaje no puede estar vacío.');
    rl.close();
    process.exit(1);
  }

  try {
    console.log('⏳  Agregando cambios...');
    execSync('git add .', { stdio: 'inherit', cwd: ROOT });

    console.log(`⏳  Creando commit: "${commitMessage}"...`);
    // spawnSync con args en array: el mensaje puede tener comillas o caracteres raros
    const commit = git(['commit', '-m', commitMessage]);
    if (commit.status !== 0) throw new Error('git commit falló');

    console.log('⏳  Subiendo al repositorio...');
    const push = git(['push']);
    if (push.status !== 0) throw new Error('git push falló');
    // Los tags (vX.Y.Z-etapa.N) disparan el workflow en GitHub
    git(['push', '--tags']);

    console.log('⏳  Enviando notificación a Discord...');
    const discord = spawnSync('node', [path.join(__dirname, 'discord.js')], {
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env, DISCORD_MESSAGE: commitMessage },
    });

    if (discord.status !== 0) {
      console.warn('⚠️  El push se completó, pero la notificación a Discord falló.');
    }
  } catch (error) {
    console.error('❌  Proceso abortado:', error.message);
  } finally {
    rl.close();
  }
});
