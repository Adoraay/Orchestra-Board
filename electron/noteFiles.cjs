const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const MAX_FILE_BYTES = 1024 * 1024;
const NOTE_ID = /^[\w-]{1,128}$/;
const MARKDOWN = /\.(?:md|markdown)$/i;
const TASK = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX~])\](?:[ \t]+|$)(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
const NEXT_MARKER = { ' ': '~', '~': 'x', x: ' ', X: ' ' };
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const validId = (id) => typeof id === 'string' && NOTE_ID.test(id);
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

function isMarkdownPath(file) {
  return typeof file === 'string' && path.isAbsolute(file) && MARKDOWN.test(file) && !file.includes('\0') &&
    (process.platform !== 'win32' || /^[a-z]:[\\/][^:]*$/i.test(file));
}

function fileError(key) {
  return Object.assign(new Error(key), { noteKey: key });
}

function parseMarkdown(bytes) {
  let source;
  try { source = utf8.decode(bytes); } catch { throw fileError('note.fileEncoding'); }
  if (source.includes('\0')) throw fileError('note.fileEncoding');
  let offset = source.startsWith('\uFEFF') ? 3 : 0;
  if (offset) source = source.slice(1);
  let fence = '';
  const tasks = [];
  const lines = source.split(/(\r\n|\n|\r)/u);
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const delimiter = FENCE.exec(line);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = '';
    } else if (delimiter) {
      fence = delimiter[1];
    } else {
      const match = TASK.exec(line);
      if (match) tasks.push({ line: i / 2, marker: match[2], label: match[3], offset: offset + Buffer.byteLength(match[1]) });
    }
    offset += Buffer.byteLength(line + (lines[i + 1] ?? ''));
  }
  const revision = createHash('sha256').update(bytes).digest('hex');
  return { text: source.replace(/\r\n?/g, '\n'), tasks, revision };
}

function sameFile(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
    before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

function withMarkdown(file, writable, useFile) {
  if (!samePath(file, fs.realpathSync.native(file))) throw fileError('note.fileUnavailable');
  const expected = fs.lstatSync(file, { bigint: true });
  if (!expected.isFile() || expected.nlink !== 1n) throw fileError('note.fileUnavailable');
  if (expected.size > MAX_FILE_BYTES) throw fileError('note.fileTooLarge');
  const mode = writable ? fs.constants.O_RDWR : fs.constants.O_RDONLY;
  const fd = fs.openSync(file, mode | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !sameFile(expected, opened)) throw fileError('note.fileConflict');
    const bytes = Buffer.allocUnsafe(Number(opened.size));
    for (let offset = 0; offset < bytes.length;) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw fileError('note.fileConflict');
      offset += count;
    }
    const snapshot = parseMarkdown(bytes);
    if (!sameFile(opened, fs.fstatSync(fd, { bigint: true }))) throw fileError('note.fileConflict');
    return useFile(snapshot, fd, opened);
  } finally {
    fs.closeSync(fd);
  }
}

function projectBacklog(cwd, text) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || typeof text !== 'string') throw fileError('note.fileInvalid');
  const root = fs.realpathSync.native(cwd);
  const backlog = path.join(root, 'BACKLOG.md');
  if (!isMarkdownPath(backlog) || !fs.lstatSync(root).isDirectory()) throw fileError('note.fileInvalid');

  for (const file of [backlog, path.join(root, 'TODO.md')]) {
    try {
      fs.lstatSync(file); // A symlink or a directory also occupies the intended path.
      return file;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > MAX_FILE_BYTES) throw fileError('note.fileTooLarge');
  parseMarkdown(bytes);
  if (!samePath(root, fs.realpathSync.native(root))) throw fileError('note.fileUnavailable');
  try {
    fs.writeFileSync(backlog, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return backlog;
}

function createNoteFiles(directory, emit) {
  const registry = path.join(directory, 'note-files.json');
  const watching = new Map();
  let bindings;

  function loadBindings() {
    if (bindings) return bindings;
    try {
      const entries = JSON.parse(fs.readFileSync(registry, 'utf8'));
      bindings = new Map(Object.entries(entries).filter(([id, file]) => validId(id) && isMarkdownPath(file)));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not load Markdown note links:', error.message);
      bindings = new Map();
    }
    return bindings;
  }

  function saveBinding(id, file) {
    const next = new Map(loadBindings());
    if (file) next.set(id, file);
    else next.delete(id);
    const temp = `${registry}.${randomUUID()}.tmp`;
    fs.mkdirSync(directory, { recursive: true });
    try {
      fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(next)), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, registry);
      bindings = next;
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }

  function read(file) {
    const info = { file, name: path.basename(file) };
    try {
      const snapshot = withMarkdown(file, false, (value) => value);
      return { ...info, ...snapshot, tasks: snapshot.tasks.map(({ line, marker, label }) => ({ line, marker, label })) };
    } catch (error) {
      return { ...info, error: error.noteKey ?? 'note.fileUnavailable' };
    }
  }

  function refresh(id, entry) {
    const state = read(entry.file);
    const previous = entry.state;
    entry.state = state;
    if (state.revision !== previous.revision || state.error !== previous.error) emit(id, state);
    return state;
  }

  function unwatch(id) {
    const entry = watching.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.close();
    watching.delete(id);
  }

  function watch(id, file) {
    const entry = { file, close: () => {} };
    const name = path.basename(file);
    watching.set(id, entry);
    const changed = () => {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => { if (watching.get(id) === entry) refresh(id, entry); }, 80);
    };
    const poll = () => {
      entry.close();
      fs.watchFile(file, { interval: 1000, persistent: false }, changed);
      entry.close = () => fs.unwatchFile(file, changed);
    };
    try {
      // A directory watch survives editors and Git replacing the file by rename.
      const watcher = fs.watch(path.dirname(file), { persistent: false }, (_, changedName) => {
        if (!changedName || samePath(changedName, name)) changed();
      });
      watcher.on('error', () => {
        if (watching.get(id) !== entry) return;
        poll();
        changed();
      });
      entry.close = () => watcher.close();
    } catch {
      poll();
    }
    entry.state = read(file);
    return entry.state;
  }

  function setWorkspace(workspace) {
    const ids = new Set(workspace.boards.flatMap((board) => board.nodes.filter((node) => node.type === 'note').map((node) => node.id)));
    for (const id of watching.keys()) if (!ids.has(id)) unwatch(id);
    for (const [id, file] of loadBindings()) if (ids.has(id) && !watching.has(id)) watch(id, file);
  }

  function get(id) {
    if (!validId(id)) return null;
    return watching.get(id)?.state ?? null;
  }

  function link(id, selected) {
    if (!validId(id) || !isMarkdownPath(selected)) throw fileError('note.fileInvalid');
    const file = fs.realpathSync.native(selected);
    if (!isMarkdownPath(file)) throw fileError('note.fileInvalid');
    const initial = read(file);
    if (initial.error) throw fileError(initial.error);
    saveBinding(id, file);
    unwatch(id);
    const state = watch(id, file);
    emit(id, state);
    return state;
  }

  function unlink(id) {
    if (!validId(id) || !loadBindings().has(id)) return null;
    saveBinding(id, null);
    unwatch(id);
    emit(id, null);
    return null;
  }

  function applyProjectBacklog(id, cwd, text, persist) {
    if (!validId(id) || loadBindings().has(id)) throw fileError('note.fileInvalid');
    let file;
    try {
      file = projectBacklog(cwd, text);
      const initial = read(file);
      if (initial.error) throw fileError(initial.error);
      saveBinding(id, file);
    } catch (error) {
      throw fileError(error.noteKey ?? 'note.fileUnavailable');
    }
    try {
      return persist();
    } catch (error) {
      unwatch(id);
      saveBinding(id, null);
      // Leave a newly created project file in place. An editor may already be using it.
      throw error;
    }
  }

  function toggle(id, line, revision) {
    const entry = watching.get(id);
    if (!entry || !Number.isSafeInteger(line) || typeof revision !== 'string') throw fileError('note.fileUnavailable');
    try {
      withMarkdown(entry.file, true, (snapshot, fd, opened) => {
        const task = snapshot.tasks.find((item) => item.line === line);
        if (snapshot.revision !== revision || !task || !sameFile(opened, fs.lstatSync(entry.file, { bigint: true }))) {
          throw fileError('note.fileConflict');
        }
        const marker = Buffer.from(NEXT_MARKER[task.marker]);
        if (fs.writeSync(fd, marker, 0, marker.length, task.offset) !== marker.length) throw fileError('note.fileUnavailable');
      });
    } finally {
      for (const [noteId, binding] of watching) if (samePath(entry.file, binding.file)) refresh(noteId, binding);
    }
    return entry.state;
  }

  function dispose() {
    for (const id of watching.keys()) unwatch(id);
  }

  return { setWorkspace, get, link, unlink, applyProjectBacklog, toggle, dispose };
}

function registerNoteFiles(ipcMain, dialog, window, service) {
  const fromWindow = (event) => event.sender === window()?.webContents && event.senderFrame?.parent === null;
  const handle = (channel, action) => ipcMain.handle(`note:file:${channel}`, async (event, id, ...args) => {
    if (!fromWindow(event) || !validId(id)) return { error: 'note.fileUnavailable' };
    try { return await action(id, ...args); }
    catch (error) { return { error: error.noteKey ?? 'note.fileUnavailable' }; }
  });
  const action = (fn) => (...args) => ({ state: fn(...args) });
  handle('get', action(service.get));
  handle('toggle', action(service.toggle));
  handle('unlink', action(service.unlink));
  handle('link', async (id) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    return canceled ? {} : { state: service.link(id, filePaths[0]) };
  });
}

module.exports = { createNoteFiles, registerNoteFiles };
