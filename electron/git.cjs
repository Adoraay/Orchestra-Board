const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ipcMain, shell } = require('electron');
const { t } = require('./i18n.cjs');

// Branches Git d'une case (PLAN.md §3.10). Seules écritures : fetch et worktree add.
// Changements d'une case (§3.20) : lecture seule (status, diff).
const MAX_BRANCH = 255;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // base d'un dépôt sans commit
const MAX_UNTRACKED = 200 * 1024; // octets montrés d'un fichier non suivi

const isDir = (p) => {
  try {
    return typeof p === 'string' && path.isAbsolute(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// Toujours execFile avec un tableau d'arguments. GIT_TERMINAL_PROMPT=0 : un fetch qui demande
// un mot de passe échoue au lieu d'attendre une saisie qui ne viendra jamais.
function git(cwd, args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        error.stderr = String(stderr).trim();
        reject(error);
      },
    );
  });
}

// Sortie de « git worktree list --porcelain » : le premier est le dépôt principal.
function parseWorktrees(output) {
  return output
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const entry = {};
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) entry.path = path.normalize(line.slice(9));
        else if (line.startsWith('branch ')) entry.branch = line.slice(7);
      }
      return entry;
    })
    .filter((w) => w.path);
}

const listWorktrees = async (cwd) => parseWorktrees(await git(cwd, ['worktree', 'list', '--porcelain']));

// Racine du dépôt principal, même depuis un worktree : c'est à côté d'elle que vont les worktrees.
async function repoRoot(cwd) {
  if (!isDir(cwd)) return { error: t('git.notRepo') };
  try {
    const [main] = await listWorktrees(cwd);
    return main ? { root: main.path } : { error: t('git.notRepo') };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? t('git.noGit') : t('git.notRepo') };
  }
}

async function refs(cwd) {
  const output = await git(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']);
  const local = [];
  const remote = [];
  for (const ref of output.split(/\r?\n/).filter(Boolean)) {
    if (ref.startsWith('refs/heads/')) local.push(ref.slice(11));
    else if (!ref.endsWith('/HEAD')) remote.push(ref.slice(13));
  }
  return { local, remote };
}

const localNameOf = (remoteBranch) => remoteBranch.slice(remoteBranch.indexOf('/') + 1);

// Locales, puis distantes sans équivalent local, et la branche actuelle du dossier.
async function listBranches(cwd, fetch) {
  if (!isDir(cwd)) return { error: t('git.notRepo') };
  try {
    if (fetch) await git(cwd, ['fetch', '--all', '--prune', '--quiet'], 20000).catch(() => {});
    const { local, remote } = await refs(cwd);
    const current = (await git(cwd, ['branch', '--show-current'])).trim();
    const localSet = new Set(local);
    return { current, local, remote: remote.filter((b) => !localSet.has(localNameOf(b))) };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? t('git.noGit') : t('git.notRepo') };
  }
}

// Dossier du worktree de la branche, créé si besoin dans <repo>-worktrees/<branche>.
// Une branche distante sans branche locale devient une branche locale qui la suit.
async function ensureWorktree(cwd, branch) {
  if (typeof branch !== 'string' || !branch || branch.length > MAX_BRANCH) return { error: t('git.branchNotFound') };
  const { root, error } = await repoRoot(cwd);
  if (error) return { error };

  try {
    const { local, remote } = await refs(root);
    let name = branch;
    let upstream = null;
    if (!local.includes(branch)) {
      if (!remote.includes(branch)) return { error: t('git.branchNotFound') };
      name = localNameOf(branch);
      if (!local.includes(name)) upstream = branch;
    }

    // Une branche déjà ouverte dans un worktree (y compris le dépôt principal) : on le réutilise.
    await git(root, ['worktree', 'prune']).catch(() => {});
    const existing = (await listWorktrees(root)).find((w) => w.branch === `refs/heads/${name}`);
    if (existing) return { path: existing.path, branch: name };

    const target = path.join(path.dirname(root), `${path.basename(root)}-worktrees`, ...name.split('/'));
    if (fs.existsSync(target) && fs.readdirSync(target).length) return { error: t('git.folderExists', { path: target }) };
    const args = upstream ? ['worktree', 'add', '--track', '-b', name, target, upstream] : ['worktree', 'add', target, name];
    await git(root, args, 120000);
    return { path: target, branch: name };
  } catch (error) {
    if (error.code === 'ENOENT') return { error: t('git.noGit') };
    return { error: error.stderr?.split(/\r?\n/).filter(Boolean).pop() || t('git.worktreeFailed') };
  }
}

// Sortie de « git status --porcelain=v1 -z » : « XY chemin », suivi de l'ancien chemin pour un renommage.
function parseStatus(output) {
  const parts = output.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const [x, y] = entry;
    const file = { path: entry.slice(3), status: x === '?' ? '?' : x !== ' ' ? x : y };
    if (x === 'R' || x === 'C') file.from = parts[++i];
    files.push(file);
  }
  return files;
}

// Sortie de « git diff --numstat -z » : lignes ajoutées et retirées par fichier (« - » = binaire).
function parseNumstat(output) {
  const stats = new Map();
  const parts = output.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const match = parts[i].match(/^(\d+|-)\t(\d+|-)\t(.*)$/s);
    if (!match) continue;
    let file = match[3];
    if (!file) {
      i += 2; // renommage : ancien puis nouveau chemin
      file = parts[i];
    }
    stats.set(file, match[1] === '-' ? { binary: true } : { added: Number(match[1]), removed: Number(match[2]) });
  }
  return stats;
}

const readHead = (file) => {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(fs.fstatSync(fd).size, MAX_UNTRACKED));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    return { buffer, truncated: fs.fstatSync(fd).size > MAX_UNTRACKED };
  } finally {
    fs.closeSync(fd);
  }
};

// Racine du worktree de la case et base de comparaison (HEAD, ou l'arbre vide sans commit).
async function workTree(cwd) {
  const top = path.normalize((await git(cwd, ['rev-parse', '--show-toplevel'])).trim());
  const base = await git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(() => 'HEAD', () => EMPTY_TREE);
  return { top, base };
}

// Fichiers modifiés dans le worktree de la case, par rapport au dernier commit (indexés ou non, et non suivis).
async function changes(cwd) {
  if (!isDir(cwd)) return { error: t('git.notRepo') };
  try {
    const { top, base } = await workTree(cwd);
    const branch = (await git(top, ['branch', '--show-current'])).trim();
    const files = parseStatus(await git(top, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all']));
    const stats = parseNumstat(await git(top, ['-c', 'core.quotepath=false', 'diff', '--numstat', '-z', base]));
    for (const file of files) {
      if (file.status === '?') {
        try {
          const { buffer } = readHead(path.join(top, file.path));
          if (buffer.includes(0)) file.binary = true;
          else file.added = buffer.toString('utf8').split('\n').filter((l, i, all) => l || i < all.length - 1).length;
        } catch {}
      } else {
        Object.assign(file, stats.get(file.path));
      }
    }
    return { root: top, branch, files };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? t('git.noGit') : t('git.notRepo') };
  }
}

// Diff d'un fichier de la liste (jamais un chemin choisi par l'interface sans être dans « status »).
async function diff(cwd, filePath) {
  const list = await changes(cwd);
  if (list.error) return list;
  const file = list.files.find((f) => f.path === filePath);
  if (!file) return { error: t('git.fileUnchanged') };
  try {
    if (file.status === '?') {
      const { buffer, truncated } = readHead(path.join(list.root, file.path));
      if (buffer.includes(0)) return { binary: true };
      const lines = buffer.toString('utf8').split(/\r?\n/);
      if (lines.at(-1) === '') lines.pop();
      return { diff: [`@@ ${t('git.newFile')} @@`, ...lines.map((l) => `+${l}`)].join('\n'), truncated };
    }
    const { base } = await workTree(cwd);
    const paths = file.from ? [file.from, file.path] : [file.path];
    const output = await git(list.root, ['-c', 'core.quotepath=false', 'diff', '-M', base, '--', ...paths]);
    if (/^Binary files /m.test(output)) return { binary: true };
    // En-tête (diff --git, index, ---, +++) retiré : la fenêtre montre déjà le fichier.
    return { diff: output.replace(/^[\s\S]*?(?=^@@)/m, '').trimEnd() };
  } catch (error) {
    return { error: error.stderr?.split(/\r?\n/).filter(Boolean).pop() || t('git.diffFailed') };
  }
}

// « Ouvrir dans VS Code » : le fichier choisi (s'il existe encore) ou le dossier, par le lien vscode://.
async function openInEditor(cwd, filePath) {
  const list = await changes(cwd);
  if (list.error) return list;
  const file = filePath && list.files.find((f) => f.path === filePath);
  const target = file && fs.existsSync(path.join(list.root, file.path)) ? path.join(list.root, file.path) : list.root;
  await shell.openExternal(`vscode://file/${target.replace(/\\/g, '/')}`);
  return {};
}

function register() {
  ipcMain.handle('git:isRepo', (_e, cwd) => repoRoot(cwd));
  ipcMain.handle('git:listBranches', (_e, cwd, fetch) => listBranches(cwd, Boolean(fetch)));
  ipcMain.handle('git:ensureWorktree', (_e, cwd, branch) => ensureWorktree(cwd, branch));
  ipcMain.handle('git:changes', (_e, cwd) => changes(cwd));
  ipcMain.handle('git:diff', (_e, cwd, file) => diff(cwd, file));
  ipcMain.handle('git:openInEditor', (_e, cwd, file) => openInEditor(cwd, file));
}

module.exports = { register };
