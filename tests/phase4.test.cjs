const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { load, clock, i18n } = require('./helpers.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-phase4-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function store(directory, extra = {}) {
  return load('taskStore.cjs', { './i18n.cjs': i18n }).createTaskStore(directory, {
    owner: (id) => id === 'worker' ? { name: 'Worker', boardId: 'main', cwd: directory } : null,
    capture: async () => ({ state: 'available', at: 1234 }), ...extra,
  });
}

test('tasks require validated dependencies, reject cycles, and keep response separate from validation', async (t) => {
  const tasks = store(fixture(t));
  const first = tasks.create({ title: 'Build', owner: 'worker' });
  const second = tasks.create({ title: 'Review', owner: 'worker', dependencies: [first.id] });
  assert.equal(tasks.list().tasks[1].state, 'blocked');
  await assert.rejects(tasks.start(second.id), /task.dependenciesPending/);
  assert.throws(() => tasks.update(first.id, { dependencies: [second.id] }), /task.cycle/);
  assert.throws(() => tasks.update(first.id, { dependencies: ['gone'] }), /task.missingDependency/);
  await tasks.start(first.id);
  tasks.finishOwner('worker', 'built successfully');
  assert.equal(tasks.get(first.id).state, 'responded');
  assert.equal(tasks.list().tasks[1].state, 'blocked');
  tasks.action(first.id, 'validate');
  assert.equal(tasks.list().tasks[1].state, 'todo');
  await tasks.start(second.id);
  assert.equal(tasks.get(second.id).startedAt, 1234);
  tasks.update(first.id, { result: 'changed result' });
  assert.equal(tasks.get(first.id).state, 'responded', 'editing a validated result revokes validation');
});

test('exchange IDs and results survive restart; unfinished work is marked interrupted', async (t) => {
  const directory = fixture(t);
  const tasks = store(directory);
  const entry = { taskId: 'delegation-task', kind: 'delegate', text: 'Build it', to: 'worker', toName: 'Worker', boardId: 'main', at: Date.now() };
  tasks.onLog(entry);
  await tasks.beforeDeliver(entry.taskId);
  tasks.onLog({ ...entry, kind: 'delivered' });
  tasks.onLog({ ...entry, kind: 'reply', text: 'Result from worker' });
  assert.equal(tasks.get(entry.taskId).result, 'Result from worker');
  assert.equal(tasks.get(entry.taskId).state, 'responded');
  const active = tasks.create({ title: 'Still working', owner: 'worker' });
  await tasks.start(active.id);
  const restored = store(directory);
  assert.equal(restored.get(entry.taskId).id, entry.taskId);
  assert.equal(restored.get(entry.taskId).state, 'responded');
  assert.equal(restored.get(active.id).state, 'interrupted');
  assert.equal(restored.get(active.id).baseline.at, 1234);
});

test('cancel during reference capture never revives a task, and corrupt task storage is preserved', async (t) => {
  const directory = fixture(t);
  let release;
  const tasks = store(directory, { capture: () => new Promise((resolve) => { release = resolve; }) });
  const task = tasks.create({ title: 'Cancel me', owner: 'worker' });
  const starting = tasks.start(task.id);
  tasks.action(task.id, 'cancel');
  release({ state: 'available', at: 5 });
  await assert.rejects(starting, /task.cancelled/);
  assert.equal(tasks.get(task.id).state, 'cancelled');
  fs.writeFileSync(path.join(directory, 'tasks.json'), '{ broken');
  const corrupted = store(directory);
  assert.match(corrupted.list().error, /task.storageFailed/);
  assert.throws(() => corrupted.create({ title: 'Overwrite?' }), /task.storageFailed/);
  assert.equal(fs.readFileSync(path.join(directory, 'tasks.json'), 'utf8'), '{ broken');
});

test('owner exit fails active work; cancellation and dependency references prevent unsafe deletion', async (t) => {
  const tasks = store(fixture(t));
  const a = tasks.create({ title: 'First', owner: 'worker' });
  const b = tasks.create({ title: 'Next', dependencies: [a.id] });
  await tasks.start(a.id);
  tasks.onExit('worker');
  assert.equal(tasks.get(a.id).state, 'failed');
  assert.throws(() => tasks.remove(a.id), /task.cannotRemove/);
  tasks.action(b.id, 'cancel');
  tasks.remove(b.id);
  tasks.remove(a.id);
  assert.equal(tasks.list().tasks.length, 0);
});

test('task comparison starts from dirty contents, includes new/deleted files, and never substitutes HEAD', async (t) => {
  const directory = fixture(t);
  const repo = path.join(directory, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'already dirty\n');
  fs.writeFileSync(path.join(repo, 'delete.txt'), 'delete this\n');
  fs.writeFileSync(path.join(repo, 'binary.bin'), Buffer.from([0, 1, 2]));
  fs.writeFileSync(path.join(repo, 'large.txt'), 'x'.repeat(205000));
  const calls = [];
  const run = (file, args, options, cb) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return cb(null, repo + '\n');
    if (args[0] === 'ls-files') return cb(null, (args.includes('--cached') ? ['tracked.txt', 'delete.txt', 'binary.bin', 'large.txt'] : fs.readdirSync(repo).filter((name) => name === 'new.txt')).join('\0') + '\0');
    return execFile(file, args, options, cb);
  };
  const snapshots = load('taskSnapshots.cjs', { child_process: { execFile: run }, './i18n.cjs': i18n }).createTaskSnapshots(path.join(directory, 'snapshots'));
  await snapshots.capture('task-1', repo);
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'already dirty\nnew task line\n');
  fs.writeFileSync(path.join(repo, 'new.txt'), 'brand new\n');
  fs.writeFileSync(path.join(repo, 'binary.bin'), Buffer.from([0, 1, 3]));
  fs.unlinkSync(path.join(repo, 'delete.txt'));
  const result = await snapshots.changes('task-1');
  assert.deepEqual(result.files.map((file) => file.path).sort(), ['binary.bin', 'delete.txt', 'new.txt', 'tracked.txt']);
  assert.equal(result.filesLimited, true);
  const diff = await snapshots.diff('task-1', 'tracked.txt');
  assert.match(diff.diff, /\+new task line/);
  assert.doesNotMatch(diff.diff, /\+already dirty/);
  assert.equal((await snapshots.diff('task-1', 'binary.bin')).binary, true);
  assert.ok((await snapshots.changes('old-task-without-reference')).error);
  assert.ok((await snapshots.diff('task-1', '../outside.txt')).error);
  assert.ok(calls.every((args) => ['rev-parse', 'ls-files', 'diff'].includes(args[0])));
  assert.ok(!calls.some((args) => args.includes('HEAD') || args.includes('stash') || args.includes('commit')));
});

test('snapshot preparation reserves a target, remains cancellable, and never pastes into a new permission', async () => {
  const time = clock();
  const writes = [];
  let state = 'idle';
  let release;
  const relay = load('linkRelay.cjs', { './i18n.cjs': i18n }, time);
  const deferred = [];
  relay.init({ status: () => state, write: (...args) => writes.push(args), beforeDeliver: () => new Promise((resolve) => { release = resolve; }), deferred: (id) => deferred.push(id) });
  const item = { qid: 'first', id: 'link', from: 'source', text: 'secret task', chain: relay.chainOf('source'), key: 'link', turns: 1 };
  relay.enqueue('target', item);
  await Promise.resolve();
  assert.equal(writes.length, 0);
  assert.equal(relay.pendingList()[0].state, 'queued');
  relay.cancel('first');
  release();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(writes.length, 0);
  relay.enqueue('target', { ...item, qid: 'next' });
  await Promise.resolve();
  state = 'waiting';
  release();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(writes.length, 0, 'never pasted into a permission that appeared during capture');
  assert.deepEqual(deferred, ['next']);
  assert.equal(relay.pendingList()[0].qid, 'next');
});

test('formations use actual sizes and undo restores positions without recreating closed terminals', async () => {
  const layoutSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'layout.js'), 'utf8');
  const { arrangeNodes, cleanGroups } = await import('data:text/javascript;base64,' + Buffer.from(layoutSource).toString('base64'));
  const nodes = [
    { id: 'a', type: 'terminal', selected: true, position: { x: 10, y: 40 }, style: { width: 100, height: 50 } },
    { id: 'b', type: 'terminal', selected: true, position: { x: 400, y: 80 }, style: { width: 200, height: 60 } },
    { id: 'c', type: 'note', selected: true, position: { x: 1000, y: 100 }, style: { width: 50, height: 40 } },
  ];
  const distributed = arrangeNodes(nodes, 'column');
  assert.deepEqual(distributed.map((node) => node.position.x + node.style.width / 2), [530, 530, 530]);
  assert.strictEqual(distributed[0].data, nodes[0].data);
  assert.deepEqual(cleanGroups([{ id: 'group', name: 'Team', members: ['a', 'gone'] }], nodes)[0].members, ['a']);
  const historySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'boardHistory.js'), 'utf8');
  const { restoreBoardHistory } = await import('data:text/javascript;base64,' + Buffer.from(historySource).toString('base64'));
  const restored = restoreBoardHistory([distributed[0]], { annotations: [nodes[2]], positions: nodes.map(({ id, position }) => ({ id, position })), edges: [{ id: 'note-link', source: 'a', target: 'c' }, { id: 'closed-link', source: 'a', target: 'b' }], strokes: [], groups: [{ id: 'group', name: 'Team', members: ['a', 'b', 'c'] }] });
  assert.deepEqual(restored.nodes.map((node) => node.id), ['a', 'c']);
  assert.equal(restored.nodes[0].position.x, 10);
  assert.deepEqual(restored.edges.map((edge) => edge.id), ['note-link']);
  assert.deepEqual(restored.groups[0].members, ['a', 'c']);
});

test('workspace groups sanitize membership and template instances receive fresh group IDs', (t) => {
  const directory = fixture(t);
  const electron = { app: { getPath: () => directory }, ipcMain: { handle() {}, on() {} } };
  const settings = { MODEL: /^[\w.-]+$/, load: () => ({ agents: [{ id: 'shell', name: 'Terminal' }] }) };
  const workspace = load('workspaceStore.cjs', { electron, './settingsStore.cjs': settings, './i18n.cjs': i18n });
  const nodes = ['a', 'b'].map((id) => ({ id, type: 'terminal', position: { x: 0, y: 0 }, data: { agentId: 'shell' } }));
  const board = workspace.sanitizeContent({ nodes, groups: [{ id: 'g1', name: 'Group', members: ['a', 'a', 'missing'] }, { id: 'g2', name: 'Other', members: ['a', 'b'] }] });
  assert.deepEqual(board.groups.map((group) => group.members), [['a'], ['b']]);
  const teams = load('teamTemplates.cjs', { electron, './settingsStore.cjs': settings, './workspaceStore.cjs': workspace, './i18n.cjs': i18n });
  const saved = teams.save('Grouped', board);
  const instance = teams.instantiate(saved.id, directory);
  assert.notEqual(instance.board.groups[0].id, 'g1');
  assert.ok(instance.board.groups.every((group) => group.members.every((id) => instance.board.nodes.some((node) => node.id === id))));
});

test('all six formations keep mixed-size tiles apart, preserve the center and remain stable when reapplied', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'layout.js'), 'utf8');
  const { arrangeNodes, nodeSize, boundsOf, FORMATIONS, formationDimensions } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const input = [0, 1, 2].map((i) => ({ id: 'n' + i, selected: true, type: 'terminal', position: { x: 10, y: 10 }, style: { width: 360 + i * 100, height: 220 + i * 50 } }));
  const untouched = { id: 'other', selected: false, type: 'note', position: { x: -500, y: -500 }, style: { width: 50, height: 50 } };
  for (const action of FORMATIONS) {
    const output = arrangeNodes([...input, untouched], action);
    assert.strictEqual(output[3], untouched);
    const before = boundsOf(input), after = boundsOf(output.slice(0, 3));
    assert.ok(Math.abs(before.left + before.width / 2 - after.left - after.width / 2) < 1e-8);
    assert.ok(Math.abs(before.top + before.height / 2 - after.top - after.height / 2) < 1e-8);
    const repeated = arrangeNodes(output, action);
    assert.ok(repeated.every((node, index) => Math.abs(node.position.x - output[index].position.x) < 1e-8 && Math.abs(node.position.y - output[index].position.y) < 1e-8));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = output[i], b = output[j];
      const overlap = a.position.x < b.position.x + nodeSize(b).width && b.position.x < a.position.x + nodeSize(a).width && a.position.y < b.position.y + nodeSize(b).height && b.position.y < a.position.y + nodeSize(a).height;
      assert.equal(overlap, false, action);
    }
  }
  assert.deepEqual(formationDimensions(16, 'grid'), { columns: 4, rows: 4 });
  assert.deepEqual(formationDimensions(64, 'grid'), { columns: 8, rows: 8 });
  assert.deepEqual(formationDimensions(7, 'rows3'), { columns: 3, rows: 3 });
  assert.deepEqual(formationDimensions(2, 'rows4'), { columns: 2, rows: 1 });
  assert.deepEqual(formationDimensions(0, 'grid'), { columns: 0, rows: 0 });
  assert.strictEqual(arrangeNodes(input, 'unknown'), input);
});

test('adaptive grids and rows of three grow with selection size and center incomplete rows', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'layout.js'), 'utf8');
  const { arrangeNodes, nodeSize, FORMATIONS } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const input = Array.from({ length: 64 }, (_, index) => ({ id: 'n' + index, selected: true, type: 'terminal', position: { x: index * 5, y: index * 7 }, style: { width: 360 + index % 3 * 50, height: 220 + index % 5 * 30 } }));
  for (const action of FORMATIONS) {
    const output = arrangeNodes(input, action);
    for (let i = 0; i < output.length; i++) for (let j = i + 1; j < output.length; j++) {
      const a = output[i], b = output[j];
      assert.ok(a.position.x + nodeSize(a).width <= b.position.x || b.position.x + nodeSize(b).width <= a.position.x || a.position.y + nodeSize(a).height <= b.position.y || b.position.y + nodeSize(b).height <= a.position.y, action);
    }
  }
  const seven = arrangeNodes(input.slice(0, 7), 'rows3');
  const center = (index) => seven[index].position.x + nodeSize(seven[index]).width / 2;
  assert.equal(center(6), center(1), 'single last tile sits in the middle column');
  assert.equal(center(3), center(0));
  assert.equal(center(5), center(2));
});

test('log export respects all filters and retains task state from unfiltered events', () => {
  const { createReport } = load('logReport.cjs', { './i18n.cjs': i18n });
  const entries = [
    { id: 1, kind: 'delegate', boardId: 'one', taskId: 't1', from: 'a', to: 'b', text: 'private request' },
    { id: 2, kind: 'reply', boardId: 'one', taskId: 't1', from: 'b', to: 'a', text: 'private result' },
    { id: 3, kind: 'command', boardId: 'two', from: 'c', to: 'd', text: 'legacy command' },
  ];
  const report = createReport(entries, { board: 'one', tile: 'a', task: 't1', kind: 'delegate' });
  assert.equal(report.events.length, 1);
  assert.equal(report.events[0].state, 'replied');
  assert.equal(report.events[0].text, 'private request');
  assert.equal(createReport(entries).events.length, 3);
  assert.equal(createReport(entries).events[2].state, null);
  assert.throws(() => createReport(entries, { kind: 'not-a-kind' }), /log.invalidFilter/);
  assert.equal(entries.length, 3, 'export never clears or rewrites the log');
});

test('a reference that fails or is invalidated never starves another queued task', async () => {
  for (const invalidate of [false, true]) {
    const time = clock();
    const writes = [];
    const logs = [];
    let release;
    let valid = true;
    const relay = load('linkRelay.cjs', { './i18n.cjs': i18n }, time);
    relay.init({ status: () => 'idle', write: (...args) => writes.push(args), log: (entry) => logs.push(entry), beforeDeliver: (id) => id === 'first' ? new Promise((resolve, reject) => { release = invalidate ? resolve : () => reject(new Error('snapshot storage failed')); }) : Promise.resolve() });
    const item = { qid: 'first', id: 'link-a', text: 'first', chain: relay.chainOf('source'), key: 'link-a', turns: 1, stillValid: () => valid };
    relay.enqueue('target', item);
    relay.enqueue('target', { ...item, qid: 'second', id: 'link-b', text: 'second', stillValid: () => true });
    await Promise.resolve();
    valid = !invalidate;
    release();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(writes.length, 1);
    assert.match(writes[0][1], /second/);
    assert.equal(logs[0].kind, invalidate ? 'cancelled' : 'refused');
  }
});

test('reference count is bounded and the newest capture is retained even with equal timestamps', async (t) => {
  const directory = fixture(t);
  const snapshotsDir = path.join(directory, 'snapshots');
  const snapshots = load('taskSnapshots.cjs', { './i18n.cjs': i18n, child_process: { execFile: (_file, args, _opts, cb) => cb(null, args[0] === 'rev-parse' ? directory : '') } }).createTaskSnapshots(snapshotsDir);
  for (let i = 0; i < 21; i++) assert.equal((await snapshots.capture('task-' + i, directory)).state, 'available');
  assert.equal(fs.readdirSync(snapshotsDir).filter((name) => name.endsWith('.json')).length, 20);
  assert.ok(!(await snapshots.changes('task-20')).error);
  const expired = Array.from({ length: 21 }, (_, i) => 'task-' + i).find((id) => !fs.existsSync(path.join(snapshotsDir, id + '.json')));
  assert.ok((await snapshots.changes(expired)).error);
});

test('references enforce file and total byte limits without inventing a baseline for excluded files', async (t) => {
  const directory = fixture(t);
  const repo = path.join(directory, 'repo');
  fs.mkdirSync(repo);
  const names = Array.from({ length: 501 }, (_, i) => `file-${String(i).padStart(4, '0')}.txt`);
  for (const [i, name] of names.entries()) fs.writeFileSync(path.join(repo, name), i < 50 ? 'x'.repeat(200 * 1024) : 'small\n');
  const snapshotsDir = path.join(directory, 'snapshots');
  const snapshots = load('taskSnapshots.cjs', { './i18n.cjs': i18n, child_process: { execFile: (_file, args, _opts, cb) => cb(null, args[0] === 'rev-parse' ? repo : args.includes('--cached') ? names.join('\0') + '\0' : '') } }).createTaskSnapshots(snapshotsDir);
  await snapshots.capture('bounded', repo);
  const manifest = JSON.parse(fs.readFileSync(path.join(snapshotsDir, 'bounded.json'), 'utf8'));
  assert.equal(Object.keys(manifest.entries).length, 500);
  assert.ok(manifest.bytes <= 8 * 1024 * 1024);
  fs.writeFileSync(path.join(repo, names[500]), 'modified but uncaptured\n');
  const result = await snapshots.changes('bounded');
  assert.equal(result.filesLimited, true);
  assert.equal(result.files.length, 0, 'an existing uncaptured path must not look like a new task file');
});
