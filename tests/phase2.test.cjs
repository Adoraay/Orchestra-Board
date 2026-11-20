const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load, i18n } = require('./helpers.cjs');
const { createBlockers } = require('../electron/blockers.cjs');
const { createRoleState } = require('../electron/roleState.cjs');
const { createMcpCatalog } = require('../electron/mcpCatalog.cjs');
const { sharedWorktrees } = require('../electron/sharedWorktrees.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-p2-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const agents = [{ id: 'claude-code', hooks: 'claude' }, { id: 'codex', hooks: 'codex' }, { id: 'antigravity', hooks: 'antigravity' }, { id: 'shell' }];
const node = (id, role = '') => ({ id, type: 'terminal', position: { x: 10, y: 20 }, style: { width: 640, height: 400 }, data: { agentId: 'claude-code', label: id, role } });
const workspace = (role = 'Old role') => ({ boards: [{ id: 'one', name: 'One', nodes: [node('a', role), node('b')], edges: [{ id: 'ab', source: 'a', target: 'b', data: { mode: 'delegate', enabled: true } }] }, { id: 'two', name: 'Two', nodes: [node('c')], edges: [] }] });

function templates(t) {
  const directory = fixture(t);
  const electron = { app: { getPath: () => directory }, ipcMain: { handle() {}, on() {} } };
  const store = load('workspaceStore.cjs', { electron, './settingsStore.cjs': { MODEL: /^[\w.-]+$/ }, './i18n.cjs': i18n });
  const teams = load('teamTemplates.cjs', { electron, './workspaceStore.cjs': store, './settingsStore.cjs': { load: () => ({ agents }) }, './i18n.cjs': i18n });
  return { teams, directory };
}

test('team templates retain configuration but strip sessions, paths, branches and execution state', (t) => {
  const { teams, directory } = templates(t);
  const input = { nodes: [node('dev', 'Developer'), { ...node('review', 'Reviewer'), data: { ...node('review').data, agentId: 'codex', model: 'test-model', role: 'Reviewer' } }, { id: 'note', type: 'note', position: { x: 80, y: 50 }, data: { label: 'Plan', text: '- [ ] Check' } }], edges: [{ id: 'link', source: 'dev', target: 'review', data: { mode: 'delegate', maxTurns: 4, bidirectional: true } }, { id: 'note-link', source: 'dev', target: 'note', data: { mode: 'note' } }], strokes: [{ id: 'stroke', points: [[1, 2], [3, 4]] }], viewport: { x: 12, y: 34, zoom: 0.7 } };
  Object.assign(input.nodes[0].data, { cwd: directory, worktree: directory, branch: 'old-branch', session: { id: 'aaaaaaaa-1111', agentId: 'claude-code', cwd: directory, transcriptPath: path.join(directory, 'session.jsonl') }, status: 'working', restored: true, pending: ['secret'] });
  const item = teams.save('My team', input);
  const disk = fs.readFileSync(path.join(directory, 'team-templates.json'), 'utf8');
  assert.doesNotMatch(disk, /session|transcriptPath|old-branch|worktree|cwd|secret|restored/);
  const nextDir = path.join(directory, 'project'); fs.mkdirSync(nextDir);
  const first = teams.instantiate(item.id, nextDir);
  const second = teams.instantiate(item.id, nextDir);
  assert.equal(first.board.nodes[0].data.role, 'Developer');
  assert.equal(first.board.nodes[0].data.cwd, nextDir);
  assert.equal(first.board.nodes[2].data.text, '- [ ] Check');
  assert.equal(first.board.edges[0].data.maxTurns, 4);
  const ids = new Set(first.board.nodes.map((n) => n.id));
  assert.ok(first.board.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
  assert.ok(first.board.nodes.every((n) => !input.nodes.some((old) => old.id === n.id)));
  assert.ok(second.board.nodes.every((n) => !ids.has(n.id)));
  assert.notEqual(first.board.strokes[0].id, second.board.strokes[0].id);
  assert.equal(input.nodes[0].data.branch, 'old-branch');
});

test('missing agents require compatible replacements, without reusing their models', (t) => {
  const { teams, directory } = templates(t);
  const original = node('dev', 'Role'); original.data.agentId = 'missing'; original.data.model = 'old-model';
  const saved = teams.save('Unavailable', { nodes: [original], edges: [] });
  assert.throws(() => teams.instantiate(saved.id, directory), /missingAgent/);
  assert.throws(() => teams.instantiate(saved.id, directory, { missing: 'shell' }), /incompatible/);
  const created = teams.instantiate(saved.id, directory, { missing: 'codex' });
  assert.equal(created.board.nodes[0].data.agentId, 'codex');
  assert.equal(created.board.nodes[0].data.model, undefined);
  assert.throws(() => teams.instantiate(saved.id, path.join(directory, 'absent')), /invalidFolder/);
});

test('recipes are usable and invalid or unreadable libraries are never overwritten', (t) => {
  const { teams, directory } = templates(t);
  assert.equal(teams.list().length, 5);
  for (const recipe of teams.list()) assert.ok(teams.instantiate(recipe.id, directory).board.nodes.length >= 2);
  assert.throws(() => teams.save('', { nodes: [] }), /invalidName/);
  assert.throws(() => teams.save('Empty', { nodes: [] }), /empty/);
  teams.save('Once', { nodes: [node('a')] });
  assert.throws(() => teams.save('once', { nodes: [node('a')] }), /duplicate/);
  const file = path.join(directory, 'team-templates.json'); fs.writeFileSync(file, '{ broken');
  assert.throws(() => teams.save('More', { nodes: [node('a')] }), /unreadable/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
});

test('a saved preset reuses MCP IDs across repositories and preserves explicit card overrides', (t) => {
  const { teams, directory } = templates(t);
  const catalog = createMcpCatalog(directory);
  catalog.save('source', null, {
    add: { id: 'project-tools', type: 'http', url: 'http://localhost:8080/mcp' },
    selection: ['linear', 'project-tools'],
  });
  catalog.save('source', 'a', { selection: ['chrome-devtools'] });
  catalog.save('source', 'b', { selection: [] });
  const template = teams.save('Project setup', { nodes: [node('a'), node('b'), node('c')] }, 'source');
  const target = path.join(directory, 'other-repo');
  fs.mkdirSync(target);
  const created = teams.instantiate(template.id, target);
  const [a, b, c] = created.board.nodes;
  assert.equal(a.data.cwd, target);
  assert.notEqual(a.id, 'a');
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'team-templates.json'), 'utf8'), /localhost:8080/);
  catalog.applyPreset('created', [a.id, b.id, c.id], created.mcp, () => {
    assert.deepEqual(Object.keys(catalog.resolve('created', a.id)), ['chrome-devtools']);
    assert.deepEqual(catalog.resolve('created', b.id), {});
    assert.deepEqual(Object.keys(catalog.resolve('created', c.id)), ['linear', 'project-tools']);
  });
  catalog.save('source', null, { remove: 'project-tools' });
  assert.throws(() => catalog.applyPreset('new-board', [], created.mcp, () => assert.fail()), { missingServers: ['project-tools'] });
});

test('the maintenance preset provides Linear and Chrome roles plus a project test URL', (t) => {
  const { teams, directory } = templates(t);
  const result = teams.instantiate('recipe-maintenance', directory, {}, agents, 'http://localhost:3001/tasks');
  const [lead, developer, qa, plan, visual] = result.board.nodes;
  assert.deepEqual(result.mcp.cards, { [lead.id]: ['linear'], [qa.id]: ['chrome-devtools'] });
  assert.equal(result.mcp.cards[developer.id], undefined);
  assert.match(lead.data.role, /team.guide.linear/);
  assert.match(qa.data.role, /team.guide.chrome/);
  assert.equal(visual.data.url, 'http://localhost:3001/tasks');
  assert.deepEqual(result.backlog, { noteId: plan.id, cwd: directory });
  assert.ok(result.board.edges.some(({ source, target, data }) => source === developer.id && target === qa.id && data.mode === 'delegate' && data.bidirectional));
  assert.ok(result.board.edges.some(({ source, target, data }) => source === qa.id && target === visual.id && data.mode === 'visual'));
  assert.throws(() => teams.instantiate('recipe-maintenance', directory, {}, agents, 'file:///local'), /invalidTestUrl/);
  const catalog = createMcpCatalog(directory);
  assert.throws(() => catalog.applyPreset('new-board', [lead.id, qa.id], result.mcp, () => {
    assert.deepEqual(Object.keys(catalog.resolve('new-board', lead.id)), ['linear']);
    throw new Error('workspace failed');
  }), /workspace failed/);
  assert.equal(catalog.get('new-board', lead.id).card, null);
});

test('enterprise roles have independent agent choices and the expected collaboration paths', (t) => {
  const { teams, directory } = templates(t);
  const setup = teams.instantiate('recipe-enterprise-squad', directory, {}, agents, '', { backend: 'claude-code' });
  const [architect, lead, backend, frontend, qa, msbuild, npm, plan, visual] = setup.board.nodes;
  const linked = (from, to, mode, twoWay = false) =>
    setup.board.edges.some(({ source, target, data }) => source === from.id && target === to.id && data.mode === mode && data.bidirectional === twoWay);
  assert.equal(architect.data.agentId, 'antigravity');
  assert.equal(backend.data.agentId, 'claude-code');
  assert.equal(qa.data.agentId, 'codex');
  assert.equal(msbuild.data.agentId, 'shell');
  assert.equal(npm.data.agentId, 'shell');
  assert.ok(linked(architect, lead, 'delegate'));
  assert.ok(linked(architect, plan, 'note'));
  assert.ok(linked(backend, msbuild, 'terminal'));
  assert.ok(linked(frontend, npm, 'terminal'));
  assert.ok(linked(backend, qa, 'delegate', true));
  assert.ok(linked(frontend, qa, 'delegate', true));
  assert.ok(linked(qa, visual, 'visual'));
  assert.deepEqual(setup.backlog, { noteId: plan.id, cwd: directory });
  assert.deepEqual(setup.mcp.cards, { [lead.id]: ['linear'], [qa.id]: ['chrome-devtools'] });
});

test('saving a project backlog as a preset retains only its portable binding intent', (t) => {
  const { teams, directory } = templates(t);
  const project = path.join(directory, 'original');
  fs.mkdirSync(project);
  const dev = node('dev');
  dev.data.cwd = project;
  const plan = { id: 'plan', type: 'note', position: { x: 80, y: 50 }, data: { text: '- [ ] Check' } };
  const saved = teams.save('With backlog', { nodes: [dev, plan] }, 'original-board',
    (id) => id === plan.id ? { file: path.join(project, 'TODO.md') } : null);
  assert.equal(saved.backlog, plan.id);
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'team-templates.json'), 'utf8'), /TODO\.md|cwd/);
  const setup = teams.instantiate(saved.id, directory);
  assert.deepEqual(setup.backlog, { cwd: directory, noteId: setup.board.nodes[1].id });
});

test('permission blockers deduplicate, survive clear-resolved, and resolve on work resumption', () => {
  const inbox = createBlockers(); inbox.setWorkspace(workspace());
  inbox.onStatus('a', { status: 'waiting' }); inbox.onStatus('a', { status: 'waiting' });
  assert.equal(inbox.snapshot().length, 1);
  const id = inbox.snapshot()[0].id;
  inbox.clearResolved(); assert.equal(inbox.snapshot().length, 1);
  inbox.onStatus('a', { status: 'working' });
  assert.equal(inbox.snapshot()[0].resolved, true);
  inbox.onStatus('a', { status: 'waiting' });
  assert.equal(inbox.snapshot()[0].id, id);
  assert.equal(inbox.snapshot()[0].resolved, false);
});

test('link refusals and limits deduplicate, resolve, and navigate across boards', () => {
  const inbox = createBlockers(); inbox.setWorkspace(workspace());
  inbox.onLink('ab', { state: 'limit' });
  inbox.onLog({ kind: 'refused', linkId: 'ab', from: 'a', to: 'b', text: 'limit reached' });
  assert.equal(inbox.snapshot().length, 1);
  assert.equal(inbox.snapshot()[0].kind, 'limit');
  inbox.onLink('ab', { state: 'ready' }); assert.equal(inbox.snapshot()[0].resolved, true);
  inbox.onStatus('c', { status: 'waiting' });
  assert.equal(inbox.snapshot().find((e) => e.caseId === 'c').boardId, 'two');
  const next = workspace(); next.boards.pop(); inbox.setWorkspace(next);
  const removed = inbox.snapshot().find((e) => e.caseId === 'c');
  assert.equal(removed.navigable, false); assert.equal(removed.resolved, true);
});

test('process exits resolve on restart and resolved-event cleanup preserves active requests', () => {
  const inbox = createBlockers(); inbox.setWorkspace(workspace());
  inbox.onExit('a', 1);
  assert.equal(inbox.snapshot()[0].kind, 'exit');
  inbox.onStatus('a', { status: 'idle' });
  inbox.onStatus('c', { status: 'waiting' });
  inbox.clearResolved(); assert.deepEqual(inbox.snapshot().map((e) => e.caseId), ['c']);
});

test('history retention never evicts active permissions and trims resolved records', () => {
  const inbox = createBlockers();
  const value = { boards: [{ id: 'many', name: 'Many', edges: [], nodes: Array.from({ length: 205 }, (_, i) => node(`agent-${i}`)) }] };
  inbox.setWorkspace(value);
  for (const actor of value.boards[0].nodes) inbox.onStatus(actor.id, { status: 'waiting' });
  assert.equal(inbox.snapshot().length, 205);
  inbox.clearResolved(); assert.equal(inbox.snapshot().length, 205);
  for (const actor of value.boards[0].nodes) inbox.onStatus(actor.id, { status: 'working' });
  assert.equal(inbox.snapshot().length, 200);
  assert.ok(inbox.snapshot().every((entry) => entry.resolved));
});

test('role state tracks what was injected, including deferred edits and removal on clear', () => {
  const runtime = createRoleState({ running: () => true });
  runtime.setWorkspace(workspace());
  assert.equal(runtime.get('a').activeRole, null);
  assert.equal(runtime.start('a'), 'Old role');
  runtime.setWorkspace(workspace('New role'));
  assert.equal(runtime.get('a').activeRole, 'Old role');
  assert.equal(runtime.get('a').savedRole, 'New role');
  assert.equal(runtime.get('a').pending, true);
  runtime.start('a'); assert.equal(runtime.get('a').pending, false);
  runtime.setWorkspace(workspace('')); assert.equal(runtime.get('a').pending, true);
  assert.equal(runtime.start('a'), ''); assert.equal(runtime.get('a').pending, false);
  runtime.clear('a'); assert.equal(runtime.get('a').known, false);
});

test('role edits survive stale renderer saves and a storage restart', (t) => {
  const directory = fixture(t); const handlers = new Map();
  const mocks = { electron: { app: { getPath: () => directory }, ipcMain: { handle: (key, fn) => handlers.set(key, fn), on() {} } }, './settingsStore.cjs': { MODEL: /^[\w.-]+$/ }, './i18n.cjs': i18n };
  let store = load('workspaceStore.cjs', mocks); store.register(() => {});
  const original = workspace();
  const save = () => handlers.get('workspace:set')(null, original, handlers.get('workspace:startup')().generation);
  save(); store.setRole('a', 'Saved immediately'); save();
  store = load('workspaceStore.cjs', mocks); store.register(() => {});
  assert.equal(store.get().boards[0].nodes[0].data.role, 'Saved immediately');
  store.setRole('a', ''); save();
  assert.equal(store.get().boards[0].nodes[0].data.role, undefined);
});

test('shared folders use worktree roots, including subfolders and excluding distinct worktrees', async (t) => {
  const directory = fixture(t);
  const first = path.join(directory, 'repo'); const sub = path.join(first, 'src'); const second = path.join(directory, 'other-worktree');
  fs.mkdirSync(sub, { recursive: true }); fs.mkdirSync(second);
  const value = workspace();
  value.boards[0].nodes[0].data.cwd = first;
  value.boards[0].nodes[1].data.cwd = sub;
  value.boards[1].nodes[0].data.cwd = first;
  value.boards[1].nodes.push({ ...node('separate'), data: { ...node('separate').data, cwd: second } });
  const result = await sharedWorktrees(value, first, 'a', async (cwd) => cwd.toLowerCase() === second.toLowerCase() ? second : first);
  assert.deepEqual(result.map((entry) => entry.id).sort(), ['b', 'c']);
  assert.equal(result.find((entry) => entry.id === 'c').boardName, 'Two');
});

test('team presets drop visual test fill values but keep other steps', () => {
  const { templateBoard } = require('./helpers.cjs').load('teamTemplates.cjs', {
    electron: { app: { getPath: () => require('os').tmpdir() }, ipcMain: { handle() {} } },
    './i18n.cjs': require('./helpers.cjs').i18n,
  });
  const board = templateBoard({ nodes: [{ id: 'v', type: 'visualTest', position: { x: 0, y: 0 }, data: {
    url: 'http://localhost:3000', steps: [
      { id: 'a', action: 'fill', target: 'label:Password', value: 'secret' },
      { id: 'b', action: 'text', target: 'h1', value: 'Welcome' },
    ] } }], edges: [] });
  const steps = board.nodes[0].data.steps;
  assert.equal(steps[0].value, '');
  assert.equal(steps[1].value, 'Welcome');
});
