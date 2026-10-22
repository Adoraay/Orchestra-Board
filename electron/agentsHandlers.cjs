const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { dialog, ipcMain } = require('electron');
const { t } = require('./i18n.cjs');
const settingsStore = require('./settingsStore.cjs');
const { logosDir, CUSTOM_ID, LOGO_FILE, MODEL } = settingsStore;

const MAX_LOGO_SIZE = 1024 * 1024; // 1 Mo
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif' };

// En dev la page vient de http://localhost et ne peut pas charger file:// : on envoie les logos en data URL.
function toDataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return `data:${MIME[ext]};base64,${fs.readFileSync(path.join(logosDir(), file)).toString('base64')}`;
}

function readLogos() {
  const logos = {};
  let files = [];
  try {
    files = fs.readdirSync(logosDir());
  } catch {
    return logos; // pas encore de dossier
  }
  for (const file of files) {
    if (!LOGO_FILE.test(file)) continue;
    try {
      logos[file] = toDataUrl(file);
    } catch {}
  }
  return logos;
}

// Copie l'image choisie dans userData/logos/<id de l'agent>.<ext>.
async function pickLogo(win, agentId) {
  if (!CUSTOM_ID.test(agentId)) return { error: t('agents.invalid') };
  const result = await dialog.showOpenDialog(win, {
    title: t('dialog.pickLogo'),
    properties: ['openFile'],
    filters: [{ name: t('dialog.images'), extensions: Object.keys(MIME) }],
  });
  if (result.canceled) return null;

  const source = result.filePaths[0];
  const ext = path.extname(source).slice(1).toLowerCase();
  if (!MIME[ext]) return { error: t('agents.logoFormat') };
  if (fs.statSync(source).size > MAX_LOGO_SIZE) return { error: t('agents.logoTooBig') };

  fs.mkdirSync(logosDir(), { recursive: true });
  for (const old of fs.readdirSync(logosDir())) {
    if (old.startsWith(agentId + '.')) fs.rmSync(path.join(logosDir(), old)); // ancien logo de cet agent
  }
  const file = `${agentId}.${ext}`;
  fs.copyFileSync(source, path.join(logosDir(), file));
  return { file, dataUrl: toDataUrl(file) };
}

function deleteLogo(file) {
  if (typeof file === 'string' && LOGO_FILE.test(file)) fs.rmSync(path.join(logosDir(), file), { force: true });
}

// Vérifie que le programme de la commande existe : `where` sous Windows, `which` ailleurs.
function testCommand(command) {
  const match = typeof command === 'string' && command.trim().match(/^"([^"]+)"|^(\S+)/);
  if (!match) return Promise.resolve({ ok: false, message: t('agents.emptyCommand') });
  const program = match[1] || match[2];

  if (path.isAbsolute(program)) {
    const ok = fs.existsSync(program);
    return Promise.resolve({ ok, message: ok ? program : t('agents.fileNotFound') });
  }

  const finder = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    execFile(finder, [program], { timeout: 5000, windowsHide: true }, (error, stdout) => {
      const found = stdout?.split(/\r?\n/).find(Boolean);
      resolve(error || !found ? { ok: false, message: t('agents.notInPath', { program }) } : { ok: true, message: found });
    });
  });
}

// Modèles proposés dans le dock. Claude Code : ses alias (toujours le dernier modèle de chaque famille).
// Codex : la liste qu'il garde en cache (~/.codex/models_cache.json), dans son ordre, sans les modèles cachés.
const CLAUDE_MODELS = ['fable', 'opus', 'sonnet', 'haiku'];

function codexModels() {
  const file = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'models_cache.json');
  try {
    const { models } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return models
      .filter((m) => m?.visibility === 'list' && typeof m.slug === 'string' && MODEL.test(m.slug))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((m) => ({ id: m.slug, name: typeof m.display_name === 'string' ? m.display_name : m.slug }));
  } catch {
    return []; // Codex pas encore lancé, ou format inconnu
  }
}

function listModels(agentId) {
  const agent = settingsStore.load().agents.find((a) => a.id === agentId);
  if (agent?.hooks === 'claude') return CLAUDE_MODELS.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
  if (agent?.hooks === 'codex') return codexModels();
  return [];
}

function register(getWindow) {
  ipcMain.handle('agents:logos', () => readLogos());
  ipcMain.handle('agents:pickLogo', (_e, agentId) => pickLogo(getWindow(), agentId));
  ipcMain.handle('agents:deleteLogo', (_e, file) => deleteLogo(file));
  ipcMain.handle('agents:testCommand', (_e, command) => testCommand(command));
  ipcMain.handle('agents:models', (_e, agentId) => listModels(agentId));
}

module.exports = { register };
