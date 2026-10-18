const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { dialog, ipcMain } = require('electron');
const { logosDir, CUSTOM_ID, LOGO_FILE } = require('./settingsStore.cjs');

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
  if (!CUSTOM_ID.test(agentId)) return { error: 'Agent invalide' };
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir un logo',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: Object.keys(MIME) }],
  });
  if (result.canceled) return null;

  const source = result.filePaths[0];
  const ext = path.extname(source).slice(1).toLowerCase();
  if (!MIME[ext]) return { error: 'Format non pris en charge' };
  if (fs.statSync(source).size > MAX_LOGO_SIZE) return { error: 'Image trop lourde (1 Mo max)' };

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
  if (!match) return Promise.resolve({ ok: false, message: 'Commande vide' });
  const program = match[1] || match[2];

  if (path.isAbsolute(program)) {
    const ok = fs.existsSync(program);
    return Promise.resolve({ ok, message: ok ? program : 'Fichier introuvable' });
  }

  const finder = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    execFile(finder, [program], { timeout: 5000, windowsHide: true }, (error, stdout) => {
      const found = stdout?.split(/\r?\n/).find(Boolean);
      resolve(error || !found ? { ok: false, message: `« ${program} » introuvable dans le PATH` } : { ok: true, message: found });
    });
  });
}

function register(getWindow) {
  ipcMain.handle('agents:logos', () => readLogos());
  ipcMain.handle('agents:pickLogo', (_e, agentId) => pickLogo(getWindow(), agentId));
  ipcMain.handle('agents:deleteLogo', (_e, file) => deleteLogo(file));
  ipcMain.handle('agents:testCommand', (_e, command) => testCommand(command));
}

module.exports = { register };
