const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load, i18n } = require('./helpers.cjs');
const { diffPreview, MAX_LINES } = require('../electron/diffPreview.cjs');

function setup(t, patch = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-diff-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'node_modules'));
  fs.writeFileSync(path.join(directory, 'orchestra-test.txt'), 'Test Orchestra\n');
  fs.writeFileSync(path.join(directory, 'dense.txt'), '\n'.repeat(200 * 1024));
  const handlers = new Map();
  const calls = [];
  let reads = 0;
  const fakeFs = { ...fs, openSync: () => { reads++; throw new Error('Unexpected synchronous content read'); }, promises: { ...fs.promises, open: (...args) => { reads++; return fs.promises.open(...args); } } };
  const execFile = (_command, args, _options, callback) => {
    calls.push(args);
    let output;
    if (args.includes('--show-toplevel')) output = directory + '\n';
    else if (args.includes('--verify')) output = 'commit\n';
    else if (args.includes('--show-current')) output = 'test\n';
    else if (args.includes('status')) {
      const specific = args.includes('--') ? args[args.indexOf('--') + 1] : null;
      if (args.includes('--untracked-files=all')) output = Array.from({ length: 18546 }, (_, i) => `?? node_modules/file-${i}.js\0`).join('');
      else if (specific === 'node_modules/') output = '?? node_modules/\0';
      else if (['orchestra-test.txt', 'dense.txt'].includes(specific)) output = `?? ${specific}\0`;
      else if (specific === 'tracked.txt') output = ' M tracked.txt\0';
      else if (specific) output = '';
      else output = '?? node_modules/\0?? orchestra-test.txt\0?? dense.txt\0 M tracked.txt\0';
    } else if (args.includes('--numstat')) output = '1\t0\ttracked.txt\0';
    else if (args.includes('diff')) output = patch;
    else throw new Error(`Unexpected git command: ${args.join(' ')}`);
    queueMicrotask(() => callback(null, output, ''));
  };
  load('git.cjs', { fs: fakeFs, child_process: { execFile }, electron: { ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, shell: { openExternal: async () => {} } }, './i18n.cjs': i18n }).register();
  return { directory, calls, handlers, reads: () => reads };
}

test('opening Changes with 18,546 untracked dependencies reads no file contents', async (t) => {
  const s = setup(t);
  const result = await s.handlers.get('git:changes')(null, s.directory);
  assert.equal(result.files.length, 4);
  assert.equal(result.files.find((file) => file.path === 'node_modules/').directory, true);
  assert.ok(result.files.some((file) => file.path === 'orchestra-test.txt'));
  assert.equal(s.reads(), 0);
  assert.ok(!s.calls.some((args) => args.includes('--untracked-files=all')));
});

test('untracked directories expand on demand with at most 500 paths and zero content reads', async (t) => {
  const s = setup(t);
  const folder = await s.handlers.get('git:diff')(null, s.directory, 'node_modules/');
  assert.equal(folder.directory, true); assert.equal(s.reads(), 0);
  const result = await s.handlers.get('git:untracked')(null, s.directory, 'node_modules/', 497);
  assert.equal(result.files.length, 497); assert.equal(result.limited, true);
  assert.equal(s.reads(), 0);
  assert.ok(s.calls.filter((args) => args.includes('--untracked-files=all')).every((args) => args.at(-1) === 'node_modules/'));
});

test('selecting a small untracked file reads only it, without a full repository rescan', async (t) => {
  const s = setup(t);
  const result = await s.handlers.get('git:diff')(null, s.directory, 'orchestra-test.txt');
  assert.match(result.diff, /\+Test Orchestra/); assert.equal(result.truncated, false);
  assert.equal(s.reads(), 1);
  assert.ok(s.calls.filter((args) => args.includes('status')).every((args) => args.at(-1) === 'orchestra-test.txt'));
  assert.ok(!s.calls.some((args) => args.includes('--numstat')));
});

test('newline-dense untracked files and tracked diffs have bounded previews', async (t) => {
  const s = setup(t, 'diff --git a/tracked.txt b/tracked.txt\n@@ -0,0 +1 @@\n' + '+x\n'.repeat(20000));
  const untracked = await s.handlers.get('git:diff')(null, s.directory, 'dense.txt');
  assert.equal(untracked.truncated, true);
  assert.ok(untracked.diff.split('\n').length <= MAX_LINES + 1);
  const tracked = await s.handlers.get('git:diff')(null, s.directory, 'tracked.txt');
  assert.equal(tracked.truncated, true);
  assert.ok(tracked.diff.split('\n').length <= MAX_LINES);
  assert.equal(s.reads(), 1);
});

test('previews limit minified lines and preserve short ordinary patches', () => {
  const huge = diffPreview('+' + 'x'.repeat(1000000));
  assert.ok(huge.diff.length <= 4000); assert.equal(huge.truncated, true);
  assert.deepEqual(diffPreview('@@ -1 +1 @@\n-old\n+new\n'), { diff: '@@ -1 +1 @@\n-old\n+new', truncated: false });
});

test('file preview refuses outside or unchanged paths without reading their contents', async (t) => {
  const s = setup(t);
  assert.ok((await s.handlers.get('git:diff')(null, s.directory, '../outside.txt')).error);
  assert.ok((await s.handlers.get('git:diff')(null, s.directory, 'unchanged.txt')).error);
  assert.equal(s.reads(), 0);
});
