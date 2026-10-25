const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { createHash, randomUUID } = require('crypto');
const { isUtf8 } = require('buffer');
const { diffPreview } = require('./diffPreview.cjs');
const { t } = require('./i18n.cjs');

const ID = /^[\w-]{1,128}$/;
const MAX_FILES = 500;
const MAX_FILE = 200 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;
const KEEP = 20;
const inside = (root, target) => { const relative = path.relative(root, target); return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep); };
const safePath = (file) => typeof file === 'string' && file.length <= 4096 && !path.isAbsolute(file) && !file.includes('\0') && !file.replace(/\\/g, '/').split('/').some((part) => part === '..');

// Aucune écriture Git : seules les références de tâches sont stockées dans les données de l'app.
function runGit(cwd, args, acceptDiff = false) {
  return new Promise((resolve, reject) => execFile('git', args, { cwd, windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } }, (error, stdout) => {
    if (error && !(acceptDiff && error.code === 1)) reject(error);
    else resolve(stdout);
  }));
}

async function paths(root) {
  const tracked = await runGit(root, ['ls-files', '--cached', '-z']);
  const untracked = await runGit(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  const files = [...new Set([...tracked.split('\0'), ...untracked.split('\0')].filter(Boolean))];
  if (files.length > 50000 || files.some((file) => !safePath(file))) throw new Error(t('task.snapshotTooLarge'));
  return files;
}

async function read(root, file) {
  const absolute = path.resolve(root, file);
  if (!inside(root, absolute)) return { kind: 'excluded' };
  try {
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || !inside(root, await fs.realpath(absolute))) return { kind: 'excluded' };
    if (stat.size > MAX_FILE) return { kind: 'excluded' };
    const fd = await fs.open(absolute, 'r');
    let buffer;
    try {
      const bytes = Buffer.alloc(MAX_FILE + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await fd.read(bytes, offset, bytes.length - offset, offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      buffer = bytes.subarray(0, offset);
    } finally { await fd.close(); }
    if (buffer.length > MAX_FILE) return { kind: 'excluded' };
    return { kind: buffer.includes(0) || !isUtf8(buffer) ? 'binary' : 'text', hash: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length, text: buffer.includes(0) || !isUtf8(buffer) ? undefined : buffer.toString('utf8') };
  } catch (error) {
    return { kind: error.code === 'ENOENT' ? 'missing' : 'excluded' };
  }
}

function createTaskSnapshots(directory) {
  let captures = Promise.resolve();
  const filename = (id) => { if (!ID.test(id ?? '')) throw new Error(t('task.notFound')); return path.join(directory, id + '.json'); };

  async function manifest(id) {
    try {
      const file = filename(id);
      if ((await fs.stat(file)).size > MAX_TOTAL * 8) return null;
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      if (value.id !== id || !Array.isArray(value.paths) || !value.entries || !path.isAbsolute(value.root)) return null;
      return value;
    } catch { return null; }
  }

  function capture(id, cwd) {
    const operation = captures.then(async () => {
      try {
        filename(id);
        if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !(await fs.stat(cwd)).isDirectory()) return { state: 'notRepo' };
        let top;
        try { top = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim(); }
        catch { return { state: 'notRepo' }; }
        const root = await fs.realpath(top);
        const initial = await paths(root);
        const at = Date.now();
        const entries = Object.create(null);
        let bytes = 0;
        for (const file of initial.slice(0, MAX_FILES)) {
          const value = await read(root, file);
          if (bytes + (value.bytes ?? 0) > MAX_TOTAL) { entries[file] = { kind: 'excluded' }; continue; }
          bytes += value.bytes ?? 0;
          entries[file] = value;
        }
        const value = { version: 1, id, at, finishedAt: Date.now(), root, paths: initial, entries, limited: initial.length > MAX_FILES || Object.values(entries).some((entry) => entry.kind === 'excluded'), bytes };
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(filename(id) + '.tmp', JSON.stringify(value), { mode: 0o600 });
        await fs.rename(filename(id) + '.tmp', filename(id));
        const files = await fs.readdir(directory);
        const snapshots = await Promise.all(files.filter((name) => /^[\w-]{1,128}\.json$/.test(name)).map(async (name) => ({ name, at: (await fs.stat(path.join(directory, name))).mtimeMs })));
        snapshots.sort((a, b) => (b.name === id + '.json') - (a.name === id + '.json') || b.at - a.at || a.name.localeCompare(b.name));
        for (const old of snapshots.slice(KEEP)) await fs.unlink(path.join(directory, old.name));
        return { state: 'available', at };
      } catch { return { state: 'unavailable' }; }
    });
    captures = operation.catch(() => {});
    return operation;
  }

  async function changes(id) {
    const base = await manifest(id);
    if (!base) return { error: t('task.noBaseline') };
    try {
      const current = await paths(base.root);
      const existed = new Set(base.paths);
      const candidates = [...new Set([...Object.keys(base.entries), ...current.filter((file) => !existed.has(file))])];
      const files = [];
      let ignored = base.paths.length - Object.keys(base.entries).length;
      let bytes = 0;
      for (const file of candidates.slice(0, MAX_FILES)) {
        const before = base.entries[file] ?? { kind: 'missing' };
        const after = await read(base.root, file);
        bytes += after.bytes ?? 0;
        if (before.kind === 'excluded' || after.kind === 'excluded' || bytes > MAX_TOTAL) { ignored++; continue; }
        if (before.hash === after.hash) continue;
        files.push({ path: file, status: before.kind === 'missing' ? '?' : after.kind === 'missing' ? 'D' : 'M', binary: before.kind === 'binary' || after.kind === 'binary', added: 0, removed: 0 });
      }
      return { root: base.root, base: 'task', at: base.at, finishedAt: base.finishedAt, files, filesLimited: base.limited || candidates.length > MAX_FILES || ignored > 0, ignored, limits: { files: MAX_FILES, fileBytes: MAX_FILE, totalBytes: MAX_TOTAL, keep: KEEP } };
    } catch { return { error: t('task.snapshotUnavailable') }; }
  }

  async function diff(id, file) {
    const base = await manifest(id);
    if (!base) return { error: t('task.noBaseline') };
    if (!safePath(file)) return { error: t('task.invalidFile') };
    const list = await changes(id);
    if (!list.files?.some((entry) => entry.path === file)) return { error: t('task.invalidFile') };
    const before = base.entries[file] ?? { kind: 'missing' };
    const after = await read(base.root, file);
    if ([before.kind, after.kind].includes('binary')) return { binary: true };
    if ([before.kind, after.kind].includes('excluded')) return { error: t('task.snapshotUnavailable') };
    const token = randomUUID();
    const left = path.join(directory, token + '.before');
    const right = path.join(directory, token + '.after');
    try {
      await fs.writeFile(left, before.text ?? '', { mode: 0o600 });
      await fs.writeFile(right, after.text ?? '', { mode: 0o600 });
      const output = await runGit(directory, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', '--', left, right], true);
      const start = output.search(/^@@/m);
      return diffPreview((start >= 0 ? output.slice(start) : output).trimEnd());
    } catch { return { error: t('task.snapshotUnavailable') }; }
    finally { await Promise.all([left, right].map((name) => fs.unlink(name).catch(() => {}))); }
  }

  return { capture, changes, diff, remove: async (id) => { await fs.unlink(filename(id)).catch(() => {}); } };
}

module.exports = { createTaskSnapshots, MAX_FILES, MAX_FILE, MAX_TOTAL, KEEP };
