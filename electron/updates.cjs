const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, ipcMain, net, shell } = require('electron');
const settingsStore = require('./settingsStore.cjs');
const { t } = require('./i18n.cjs');

// Mises à jour (PLAN.md §3.22) : au démarrage, Orchestra lit la dernière release GitHub (seul accès réseau
// de l'app, désactivable). Le fichier d'installation n'est téléchargé que depuis les releases du dépôt, et
// installé seulement si sa somme SHA-256 correspond à celle donnée par GitHub.
const REPO = 'Adoraay/Orchestra-Board';
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const CHECK_TIMEOUT = 5000; // ms : le démarrage n'attend jamais plus
const ASSET_NAME = /^[\w.-]{1,128}$/;
const SHA256 = /^sha256:([0-9a-f]{64})$/;

let latest = null; // { version, url, notes, asset } de la dernière vérification
let downloaded = null; // chemin du fichier vérifié, prêt à lancer
let downloading = false;

// « v0.1.2 » -> [0, 1, 2] ; null si ce n'est pas une version.
function parseVersion(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(tag ?? ''));
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(tag, current) {
  const a = parseVersion(tag);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Fichier de la release pour ce système : l'installateur .exe, ou le .dmg de la bonne architecture.
function pickAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const found =
    process.platform === 'win32'
      ? list.find((a) => /\.exe$/i.test(a.name))
      : process.platform === 'darwin'
        ? list.find((a) => /\.dmg$/i.test(a.name) && a.name.includes(process.arch === 'arm64' ? 'arm64' : 'x64'))
        : null;
  if (!found || !ASSET_NAME.test(found.name)) return null;
  if (typeof found.browser_download_url !== 'string' || !found.browser_download_url.startsWith(DOWNLOAD_PREFIX)) return null;
  const sha = SHA256.exec(found.digest ?? '');
  if (!sha || !Number.isInteger(found.size)) return null; // sans somme de contrôle, pas d'installation directe
  return { name: found.name, url: found.browser_download_url, size: found.size, sha256: sha[1] };
}

// Notes de la release en texte simple : titres, gras, code et liens Markdown retirés.
function plainNotes(body) {
  if (typeof body !== 'string') return '';
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000);
}

// force : vérification demandée depuis les paramètres, même si elle est désactivée au démarrage.
async function check(force) {
  const current = app.getVersion();
  if (!force && !settingsStore.load().general.checkUpdates) return { available: false, current };
  try {
    const response = await net.fetch(LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Orchestra/${current}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT),
    });
    if (!response.ok) return { available: false, current, error: t('update.checkFailed') };
    const release = await response.json();
    if (!isNewer(release.tag_name, current)) return { available: false, current };
    const asset = pickAsset(release.assets);
    latest = {
      version: parseVersion(release.tag_name).join('.'),
      url: typeof release.html_url === 'string' && release.html_url.startsWith(`https://github.com/${REPO}/`) ? release.html_url : `https://github.com/${REPO}/releases/latest`,
      notes: plainNotes(release.body),
      asset,
    };
    return { available: true, current, version: latest.version, notes: latest.notes, canInstall: Boolean(asset), platform: process.platform };
  } catch {
    return { available: false, current, error: t('update.checkFailed') };
  }
}

// Télécharge le fichier de la release dans le dossier temporaire, en vérifiant taille et SHA-256.
async function download(onProgress) {
  const asset = latest?.asset;
  if (!asset) return { error: t('update.noAsset') };
  if (downloading) return { error: t('update.busy') };
  downloading = true;
  downloaded = null;
  const dir = path.join(app.getPath('temp'), 'Orchestra-update');
  const file = path.join(dir, asset.name);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const response = await net.fetch(asset.url, { headers: { 'User-Agent': `Orchestra/${app.getVersion()}` } });
    if (!response.ok || !response.body) throw new Error('http');

    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let received = 0;
    let lastSent = 0;
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > asset.size) throw new Error('size');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      if (Date.now() - lastSent > 100) {
        lastSent = Date.now();
        onProgress(received / asset.size);
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    if (received !== asset.size || hash.digest('hex') !== asset.sha256) {
      fs.rmSync(dir, { recursive: true, force: true });
      return { error: t('update.badChecksum') };
    }
    onProgress(1);
    downloaded = file;
    return { ok: true };
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    return { error: t('update.downloadFailed') };
  } finally {
    downloading = false;
  }
}

// Windows : lance l'installateur habituel ; macOS : ouvre le .dmg. Puis Orchestra se ferme (avec la
// confirmation habituelle si des agents travaillent), pour que la nouvelle version puisse la remplacer.
async function install(win) {
  if (!downloaded || !fs.existsSync(downloaded)) return { error: t('update.noAsset') };
  try {
    if (process.platform === 'win32') {
      spawn(downloaded, [], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const error = await shell.openPath(downloaded);
      if (error) return { error: t('update.openFailed') };
    }
  } catch {
    return { error: t('update.openFailed') };
  }
  if (win && !win.isDestroyed()) win.close();
  return { ok: true };
}

function register(getWindow) {
  // Vérification depuis les paramètres : une version trouvée ouvre la même fenêtre qu'au démarrage.
  ipcMain.handle('update:check', async (event, force) => {
    const result = await check(force === true);
    if (force === true && result.available && !event.sender.isDestroyed()) event.sender.send('update:available', result);
    return result;
  });
  ipcMain.handle('update:download', (event) => download((progress) => !event.sender.isDestroyed() && event.sender.send('update:progress', progress)));
  ipcMain.handle('update:install', () => install(getWindow()));
  ipcMain.on('update:openRelease', () => shell.openExternal(latest?.url ?? `https://github.com/${REPO}/releases/latest`));
}

module.exports = { register };
