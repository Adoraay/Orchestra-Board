const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspaceFiles } = require('../electron/workspaceFiles.cjs');
const { canResume, sanitizeSession } = require('../electron/sessionState.cjs');
const { load, i18n } = require('./helpers.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-phase1-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const board = (name = 'Board') => ({ version: 2, activeBoardId: 'board-1', boards: [{ id: 'board-1', name, nodes: [], edges: [], strokes: [] }] });

test('backup restores the whole workspace and keeps the previous valid one', (t) => {
  const dir = fixture(t); const store = createWorkspaceFiles(dir);
  assert.equal(store.read().recovery, null);
  const original = board('Original');
  original.boards.push({ ...board().boards[0], id: 'board-2', name: 'Second' });
  original.boards[0].nodes.push({ id: 'note', type: 'note', data: { text: 'keep me' } });
  store.write(original); store.write(board('Changed'));
  const backup = store.list()[0];
  assert.equal(backup.boards, 2);
  assert.deepEqual(store.restore(backup.id, board()), original);
  assert.deepEqual(store.read().workspace, original);
  assert.ok(store.list().some((b) => b.boards === 1));
  assert.throws(() => store.restore('../workspace.json', board()));
});

test('corrupt or structurally invalid workspace cannot be silently overwritten', (t) => {
  const dir = fixture(t); const file = path.join(dir, 'workspace.json');
  fs.writeFileSync(file, '{ broken');
  const store = createWorkspaceFiles(dir);
  assert.ok(store.read().recovery);
  assert.throws(() => store.write(board()));
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
  store.restore(null, board('New'));
  const preserved = fs.readdirSync(dir).find((name) => name.startsWith('workspace-corrupt-'));
  assert.equal(fs.readFileSync(path.join(dir, preserved), 'utf8'), '{ broken');
  assert.equal(store.read().workspace.boards[0].name, 'New');
  fs.writeFileSync(file, '{}');
  assert.ok(createWorkspaceFiles(dir).read().recovery);
});

test('backup retention is bounded and runtime corruption remains protected', (t) => {
  const dir = fixture(t); const store = createWorkspaceFiles(dir);
  store.write(board()); store.write(board('next'));
  const original = store.list()[0].id;
  for (let i = 0; i < 12; i++) store.restore(store.list()[0].id, board());
  assert.equal(store.list().length, 10);
  assert.ok(!store.list().some((b) => b.id === original));
  fs.writeFileSync(path.join(dir, 'workspace.json'), 'corrupted during run');
  assert.throws(() => store.write(board()));
  assert.equal(fs.readFileSync(path.join(dir, 'workspace.json'), 'utf8'), 'corrupted during run');
});

test('per-tile sessions survive stale renderer saves and process restart', (t) => {
  const dir = fixture(t); const handlers = new Map();
  const mocks = { electron: { app: { getPath: () => dir }, ipcMain: { handle: (key, fn) => handlers.set(key, fn), on() {} } }, './i18n.cjs': i18n, './settingsStore.cjs': { MODEL: /^[\w.-]+$/ } };
  let store = load('workspaceStore.cjs', mocks);
  store.register(() => {});
  const save = (workspace, token = handlers.get('workspace:startup')().generation) => handlers.get('workspace:set')(null, workspace, token);
  const workspace = board();
  workspace.boards[0].nodes = ['one', 'two'].map((id) => ({ id, type: 'terminal', position: { x: 0, y: 0 }, data: { agentId: 'claude-code', cwd: dir } }));
  save(workspace);
  const records = ['aaaaaaaa-1111', 'bbbbbbbb-2222'].map((id) => {
    const transcriptPath = path.join(dir, id + '.jsonl'); fs.writeFileSync(transcriptPath, '{}');
    return { id, agentId: 'claude-code', cwd: dir, transcriptPath };
  });
  store.setSession('one', records[0]); store.setSession('two', records[1]);
  save(workspace);
  store = load('workspaceStore.cjs', mocks); store.register(() => {});
  assert.deepEqual(store.getSession('one'), records[0]);
  assert.deepEqual(store.getSession('two'), records[1]);
  assert.equal(canResume(store.getSession('one'), 'claude-code', dir), true);
  assert.equal(canResume(store.getSession('one'), 'codex', dir), false);
  fs.unlinkSync(records[0].transcriptPath);
  assert.equal(canResume(store.getSession('one'), 'claude-code', dir), false);
  store.setSession('one', null);
  save({ ...workspace, boards: [{ ...workspace.boards[0], nodes: workspace.boards[0].nodes.map((n) => ({ ...n, data: { ...n.data, session: records[0] } })) }] });
  assert.equal(store.getSession('one'), null);
  assert.equal(sanitizeSession({ id: '"; injected' }), null);
});

test('restoration ignores beforeunload saves from the old renderer', (t) => {
  const dir = fixture(t); const handlers = new Map();
  const store = load('workspaceStore.cjs', { electron: { app: { getPath: () => dir }, ipcMain: { handle: (key, fn) => handlers.set(key, fn), on() {} } }, './i18n.cjs': i18n, './settingsStore.cjs': { MODEL: /^[\w.-]+$/ } });
  store.register(() => {});
  const save = (workspace, token = handlers.get('workspace:startup')().generation) => handlers.get('workspace:set')(null, workspace, token);
  save(board('First'));
  save(board('Second'));
  const backup = handlers.get('workspace:backups')()[0];
  const oldGeneration = handlers.get('workspace:startup')().generation;
  assert.equal(handlers.get('workspace:restore')(null, backup.id).ok, true);
  save(board('Stale'), oldGeneration);
  assert.equal(handlers.get('workspace:startup')().workspace.boards[0].name, 'First');
  save(board('Late stale'), oldGeneration);
  assert.equal(handlers.get('workspace:get')().boards[0].name, 'First');
  save(board('Fresh'));
  assert.equal(handlers.get('workspace:get')().boards[0].name, 'Fresh');
});

test('undo keeps Note links and excludes terminals closed since the snapshot', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'boardHistory.js'), 'utf8');
  const { restoreBoardHistory } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const restored = restoreBoardHistory([{ id: 'agent', type: 'terminal' }, { id: 'new-note', type: 'note' }], {
    annotations: [{ id: 'note', type: 'note', data: { text: 'before' } }],
    edges: [{ id: 'keep', source: 'agent', target: 'note' }, { id: 'drop', source: 'closed-agent', target: 'note' }], strokes: [],
  });
  assert.deepEqual(restored.edges.map((e) => e.id), ['keep']);
  assert.deepEqual(restored.nodes.map((n) => n.id), ['agent', 'note']);
});
