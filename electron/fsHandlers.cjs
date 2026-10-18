const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { dialog, ipcMain } = require('electron');

// Noms masqués par défaut dans l'Explorateur Windows (en plus des fichiers commençant par « . »).
const HIDDEN_NAMES = new Set(['desktop.ini', 'thumbs.db', 'appdata', 'system volume information']);

function isHidden(name) {
  const lower = name.toLowerCase();
  return name.startsWith('.') || name.startsWith('$') || lower.startsWith('ntuser') || HIDDEN_NAMES.has(lower);
}

async function isDirectory(fullPath) {
  try {
    return (await fs.stat(fullPath)).isDirectory();
  } catch {
    return false;
  }
}

// Les anciennes jonctions Windows (« Application Data », « Mes documents »…) sont des liens
// vers des dossiers dont la lecture est refusée : on ne garde que les liens lisibles.
async function isReadableDir(fullPath) {
  try {
    const dir = await fs.opendir(fullPath);
    await dir.close();
    return true;
  } catch {
    return false;
  }
}

async function listDir(dirPath) {
  if (typeof dirPath !== 'string' || !path.isAbsolute(dirPath) || !(await isDirectory(dirPath))) {
    return { error: 'Dossier introuvable' };
  }

  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return { error: 'Accès refusé' };
  }

  const entries = [];
  for (const dirent of dirents) {
    if (isHidden(dirent.name)) continue;
    const fullPath = path.join(dirPath, dirent.name);

    let isDir = dirent.isDirectory();
    if (dirent.isSymbolicLink()) {
      isDir = await isDirectory(fullPath);
      if (isDir && !(await isReadableDir(fullPath))) continue;
    }
    entries.push({ name: dirent.name, path: fullPath, isDir });
  }

  entries.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  return { entries };
}

function register(getWindow) {
  ipcMain.handle('fs:listDir', (_e, dirPath) => listDir(dirPath));
  ipcMain.handle('fs:homeDir', () => os.homedir());
  ipcMain.handle('dialog:pickFolder', async (_e, defaultPath) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Choisir le dossier racine',
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

module.exports = { register };
