const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const MAX_BACKUPS = 10;
const BACKUP_INTERVAL = 60000;
const BACKUP_ID = /^\d+-[\da-f-]+\.json$/;

// Le stockage refuse un JSON sans structure de tableau au lieu de le prendre pour une map vide.
function parse(text) {
  const value = JSON.parse(text);
  if (!value || !(Array.isArray(value.boards) && value.boards.some((board) => board && typeof board.id === 'string' && Array.isArray(board.nodes)) || Array.isArray(value.nodes))) {
    throw new Error('Invalid workspace');
  }
  return value;
}

function createWorkspaceFiles(directory) {
  const file = path.join(directory, 'workspace.json');
  const backupDir = path.join(directory, 'workspace-backups');
  let blocked = false;
  let lastBackup = 0;

  function list() {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir).filter((id) => BACKUP_ID.test(id)).flatMap((id) => {
      try {
        const text = fs.readFileSync(path.join(backupDir, id), 'utf8');
        const workspace = parse(text);
        return [{ id, at: Number(id.split('-')[0]), boards: workspace.boards?.length ?? 1 }];
      } catch { return []; }
    }).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  }

  function read() {
    try {
      const workspace = parse(fs.readFileSync(file, 'utf8'));
      blocked = false;
      return { workspace, recovery: null };
    } catch (error) {
      blocked = error.code !== 'ENOENT';
      return { workspace: null, recovery: blocked ? { backups: list() } : null };
    }
  }

  function backup(force = false) {
    if (!fs.existsSync(file) || (!force && Date.now() - lastBackup < BACKUP_INTERVAL)) return;
    const previous = fs.readFileSync(file, 'utf8');
    parse(previous);
    fs.mkdirSync(backupDir, { recursive: true });
    const at = Date.now();
    fs.writeFileSync(path.join(backupDir, `${at}-${randomUUID()}.json`), previous, { flag: 'wx' });
    lastBackup = at;
    const files = fs.readdirSync(backupDir).filter((id) => BACKUP_ID.test(id)).sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]) || b.localeCompare(a));
    for (const id of files.slice(MAX_BACKUPS)) fs.unlinkSync(path.join(backupDir, id));
  }

  function write(workspace) {
    if (blocked) throw new Error('workspace.recoveryRequired');
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(file)) {
      try { parse(fs.readFileSync(file, 'utf8')); backup(); } catch (error) {
        // Une corruption apparue après le démarrage ne doit pas être écrasée non plus.
        blocked = true;
        throw error;
      }
    }
    atomicWrite(workspace);
  }

  function atomicWrite(workspace) {
    const tmp = file + '.tmp';
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(workspace));
    fs.renameSync(tmp, file);
  }

  function restore(id, empty) {
    let workspace = empty;
    if (id !== null) {
      if (!BACKUP_ID.test(id) || !list().some((entry) => entry.id === id)) throw new Error('workspace.invalidBackup');
      workspace = parse(fs.readFileSync(path.join(backupDir, id), 'utf8'));
    }
    if (fs.existsSync(file)) {
      try { parse(fs.readFileSync(file, 'utf8')); backup(true); }
      catch (error) {
        // Seul un fichier invalide est archivé ; une erreur d'écriture reste bloquante.
        try { parse(fs.readFileSync(file, 'utf8')); } catch {
          fs.copyFileSync(file, path.join(directory, `workspace-corrupt-${Date.now()}-${randomUUID()}.json`));
          atomicWrite(workspace);
          blocked = false;
          return workspace;
        }
        throw error;
      }
    }
    atomicWrite(workspace);
    blocked = false;
    return workspace;
  }

  return { read, write, list, restore };
}

module.exports = { createWorkspaceFiles };
