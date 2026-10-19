const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { dialog, ipcMain, shell } = require('electron');
const { t } = require('./i18n.cjs');

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
    return { error: t('fs.folderNotFound') };
  }

  let dirents;
  try {
    dirents = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return { error: t('fs.accessDenied') };
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

// --- Gestion des dossiers et fichiers depuis l'explorateur (PLAN.md §3.14) ---

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_COUNT = 5000; // au-delà, le résumé avant suppression dit « plus de 5 000 »

let getUsedFolders = () => []; // [{ path, name }] : dossiers des cases de la map
let getRoot = () => os.homedir();

const key = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const isInside = (child, parent) => {
  const rel = path.relative(key(parent), key(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// Nom de fichier ou de dossier valide sous Windows.
function checkName(name) {
  if (typeof name !== 'string') return { error: t('fs.nameInvalid') };
  const clean = name.trim();
  if (!clean || clean === '.' || clean === '..') return { error: t('fs.nameEmpty') };
  if (clean.length > 255) return { error: t('fs.nameTooLong') };
  if (/[<>:"/\\|?*\x00-\x1f]/.test(clean)) return { error: t('fs.nameChars') };
  if (/[. ]$/.test(clean)) return { error: t('fs.nameEnd') };
  if (RESERVED.test(clean)) return { error: t('fs.nameReserved', { name: clean }) };
  return { name: clean };
}

async function exists(fullPath) {
  try {
    await fs.lstat(fullPath);
    return true;
  } catch {
    return false;
  }
}

// Dossier <repo>-worktrees, ou dossier qui mène à un worktree (pas ce qu'il y a dedans : un dossier
// au-dessus de la cible avec un fichier .git = on est à l'intérieur d'un worktree, donc libre).
async function isWorktreeFolder(target) {
  const parts = path.resolve(target).split(path.sep);
  const index = parts.findLastIndex((p) => p.endsWith('-worktrees'));
  if (index === -1) return false;
  for (let i = index + 1; i < parts.length - 1; i++) {
    if (await exists(path.join(parts.slice(0, i + 1).join(path.sep), '.git'))) return false;
  }
  return true;
}

// Renommer ou supprimer est refusé là où ça casserait l'app ou un agent.
async function protectedReason(target) {
  if (key(target) === key(path.parse(target).root)) return t('fs.protectedDrive');
  if (key(target) === key(os.homedir())) return t('fs.protectedHome');
  if (isInside(getRoot(), target)) return t('fs.protectedRoot');
  if (await isWorktreeFolder(target)) return t('fs.protectedWorktree');
  const used = getUsedFolders().find((f) => f.path && isInside(f.path, target));
  if (used) return t('fs.protectedUsed', { name: used.name });
  return null;
}

async function existingPath(target) {
  return typeof target === 'string' && path.isAbsolute(target) && (await exists(target));
}

async function createFolder(parent, name) {
  if (!(await existingPath(parent)) || !(await isDirectory(parent))) return { error: t('fs.folderNotFound') };
  const checked = checkName(name);
  if (checked.error) return checked;
  const target = path.join(parent, checked.name);
  if (await exists(target)) return { error: t('fs.exists', { name: checked.name }) };
  try {
    await fs.mkdir(target);
    return { path: target };
  } catch {
    return { error: t('fs.createFailed') };
  }
}

async function rename(target, name) {
  if (!(await existingPath(target))) return { error: t('fs.itemNotFound') };
  const reason = await protectedReason(target);
  if (reason) return { error: reason };
  const checked = checkName(name);
  if (checked.error) return checked;
  const next = path.join(path.dirname(target), checked.name);
  if (next === target) return { path: target };
  // Sous Windows, changer seulement la casse (« Projet » -> « projet ») vise le même élément.
  if (key(next) !== key(target) && (await exists(next))) return { error: t('fs.exists', { name: checked.name }) };
  try {
    await fs.rename(target, next);
    return { path: next };
  } catch {
    return { error: t('fs.renameFailed') };
  }
}

// Ce que contient un dossier, pour la confirmation de suppression.
async function summary(target) {
  if (!(await existingPath(target))) return { error: t('fs.itemNotFound') };
  const reason = await protectedReason(target);
  if (reason) return { error: reason };
  if (!(await isDirectory(target))) {
    const { size } = await fs.stat(target);
    return { isDir: false, size };
  }
  let files = 0;
  let folders = 0;
  const queue = [target];
  while (queue.length && files + folders < MAX_COUNT) {
    const dir = queue.shift();
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      if (d.isDirectory()) {
        folders++;
        queue.push(path.join(dir, d.name));
      } else files++;
    }
  }
  return { isDir: true, files, folders, truncated: files + folders >= MAX_COUNT };
}

async function trash(target) {
  if (!(await existingPath(target))) return { error: t('fs.itemNotFound') };
  const reason = await protectedReason(target);
  if (reason) return { error: reason };
  try {
    await shell.trashItem(target);
    return { ok: true };
  } catch {
    return { error: t('fs.trashFailed') };
  }
}

async function reveal(target) {
  if (!(await existingPath(target))) return { error: t('fs.itemNotFound') };
  if (await isDirectory(target)) {
    const error = await shell.openPath(target);
    return error ? { error } : { ok: true };
  }
  shell.showItemInFolder(target);
  return { ok: true };
}

// deps.usedFolders() : dossiers des cases de la map, deps.root() : racine de l'explorateur.
function register(getWindow, deps = {}) {
  if (deps.usedFolders) getUsedFolders = deps.usedFolders;
  if (deps.root) getRoot = deps.root;
  ipcMain.handle('fs:createFolder', (_e, parent, name) => createFolder(parent, name));
  ipcMain.handle('fs:rename', (_e, target, name) => rename(target, name));
  ipcMain.handle('fs:summary', (_e, target) => summary(target));
  ipcMain.handle('fs:trash', (_e, target) => trash(target));
  ipcMain.handle('fs:reveal', (_e, target) => reveal(target));
  ipcMain.handle('fs:listDir', (_e, dirPath) => listDir(dirPath));
  ipcMain.handle('fs:homeDir', () => os.homedir());
  ipcMain.handle('dialog:pickFolder', async (_e, defaultPath) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: t('dialog.pickRoot'),
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

module.exports = { register };
