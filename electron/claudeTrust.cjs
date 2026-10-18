const fs = require('fs');
const os = require('os');
const path = require('path');

// Claude Code demande « Do you trust the files in this folder? » une fois par dossier et retient la réponse
// dans ~/.claude.json (projects["C:/…"].hasTrustDialogAccepted). On la donne à sa place avant le lancement.
const configFile = () => path.join(process.env.CLAUDE_CONFIG_DIR || os.homedir(), '.claude.json');

// Claude range ses dossiers avec des « / » ; la casse peut différer de la vraie, on écrit les deux.
function projectKeys(cwd) {
  const keys = new Set([path.resolve(cwd)]);
  try {
    keys.add(fs.realpathSync.native(cwd));
  } catch {}
  return [...keys].map((key) => key.replace(/\\/g, '/'));
}

function trustFolder(cwd) {
  try {
    if (typeof cwd !== 'string' || !fs.statSync(cwd).isDirectory()) return;
    const file = configFile();
    // Relu juste avant d'écrire : Claude Code réécrit ce fichier souvent.
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const projects = config.projects && typeof config.projects === 'object' ? config.projects : {};
    const missing = projectKeys(cwd).filter((key) => projects[key]?.hasTrustDialogAccepted !== true);
    if (!missing.length) return;

    for (const key of missing) projects[key] = { ...(projects[key] ?? {}), hasTrustDialogAccepted: true };
    config.projects = projects;
    const tmp = `${file}.orchestra.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    // Pas de fichier (Claude jamais lancé) ou illisible : Claude posera simplement la question.
    console.error('[orchestra] confiance du dossier non enregistrée :', err.message);
  }
}

module.exports = { trustFolder };
