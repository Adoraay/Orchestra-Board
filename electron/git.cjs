const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');

// Branches Git d'une case (PLAN.md §3.10). Seules écritures : fetch et worktree add.
const NOT_REPO = "Ce dossier n'est pas un dépôt Git";
const NO_GIT = 'Git est introuvable sur cet ordinateur';
const MAX_BRANCH = 255;

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
  if (!isDir(cwd)) return { error: NOT_REPO };
  try {
    const [main] = await listWorktrees(cwd);
    return main ? { root: main.path } : { error: NOT_REPO };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? NO_GIT : NOT_REPO };
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
  if (!isDir(cwd)) return { error: NOT_REPO };
  try {
    if (fetch) await git(cwd, ['fetch', '--all', '--prune', '--quiet'], 20000).catch(() => {});
    const { local, remote } = await refs(cwd);
    const current = (await git(cwd, ['branch', '--show-current'])).trim();
    const localSet = new Set(local);
    return { current, local, remote: remote.filter((b) => !localSet.has(localNameOf(b))) };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? NO_GIT : NOT_REPO };
  }
}

// Dossier du worktree de la branche, créé si besoin dans <repo>-worktrees/<branche>.
// Une branche distante sans branche locale devient une branche locale qui la suit.
async function ensureWorktree(cwd, branch) {
  if (typeof branch !== 'string' || !branch || branch.length > MAX_BRANCH) return { error: 'Branche introuvable' };
  const { root, error } = await repoRoot(cwd);
  if (error) return { error };

  try {
    const { local, remote } = await refs(root);
    let name = branch;
    let upstream = null;
    if (!local.includes(branch)) {
      if (!remote.includes(branch)) return { error: 'Branche introuvable' };
      name = localNameOf(branch);
      if (!local.includes(name)) upstream = branch;
    }

    // Une branche déjà ouverte dans un worktree (y compris le dépôt principal) : on le réutilise.
    await git(root, ['worktree', 'prune']).catch(() => {});
    const existing = (await listWorktrees(root)).find((w) => w.branch === `refs/heads/${name}`);
    if (existing) return { path: existing.path, branch: name };

    const target = path.join(path.dirname(root), `${path.basename(root)}-worktrees`, ...name.split('/'));
    if (fs.existsSync(target) && fs.readdirSync(target).length) return { error: `Le dossier ${target} existe déjà` };
    const args = upstream ? ['worktree', 'add', '--track', '-b', name, target, upstream] : ['worktree', 'add', target, name];
    await git(root, args, 120000);
    return { path: target, branch: name };
  } catch (error) {
    if (error.code === 'ENOENT') return { error: NO_GIT };
    return { error: error.stderr?.split(/\r?\n/).filter(Boolean).pop() || 'Impossible de créer le worktree' };
  }
}

function register() {
  ipcMain.handle('git:isRepo', (_e, cwd) => repoRoot(cwd));
  ipcMain.handle('git:listBranches', (_e, cwd, fetch) => listBranches(cwd, Boolean(fetch)));
  ipcMain.handle('git:ensureWorktree', (_e, cwd, branch) => ensureWorktree(cwd, branch));
}

module.exports = { register };
