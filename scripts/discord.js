// Webhook del canal #changelog (aviso de "código subido").
// El del CI es distinto (canal #release) y vive en GitHub Secrets.
const DISCORD_WEBHOOK_CHANGELOG = process.env.DISCORD_WEBHOOK_CHANGELOG;
const ROLE_ID = '1536520436404453437'; // ID del rol a mencionar (no es un secreto)

function exitError(msg) {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

async function main() {
  // Mensaje: primer argumento, o DISCORD_MESSAGE si viene de push.js
  const message = process.argv.slice(2).join(' ') || process.env.DISCORD_MESSAGE;

  if (!message) {
    exitError(
      'Debés proporcionar un mensaje: node scripts/discord.js "mensaje"',
    );
  }

  if (!DISCORD_WEBHOOK_CHANGELOG) {
    exitError(
      'No se encontró DISCORD_WEBHOOK_CHANGELOG. Definila en el archivo .env (ver .env.example) o como variable de entorno.',
    );
  }

  const payload = {
    content: `<@&${ROLE_ID}> 🚀 **Nuevo código subido:**\n\`\`\`\n${message}\n\`\`\``,
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_CHANGELOG, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('✅  Notificación enviada a Discord.');
    } else {
      exitError(`Error enviando a Discord: ${response.statusText}`);
    }
  } catch (error) {
    exitError(`Error en el script de Discord: ${error.message}`);
  }
}

main();
