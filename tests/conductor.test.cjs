const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load, clock, i18n } = require('./helpers.cjs');

// Chef d'orchestre (PLAN.md §3.25) : électron/conductor.cjs avec une fausse interface qui applique les
// changements sur un faux workspace, comme useConductorOps le fait sur la vraie map.
const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', hooks: 'claude' },
  { id: 'codex', name: 'Codex', hooks: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', hooks: null },
  { id: 'shell', name: 'Terminal', hooks: null },
];

async function esm(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', file), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

function setup(t, { tileTools = true, maxAgents = 6, running = ['lead'] } = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-conductor-'));
  fs.mkdirSync(path.join(folder, 'api'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const timers = clock();
  const conductor = load('conductor.cjs', { './i18n.cjs': i18n }, timers);
  const workspace = { boards: [{ id: 'main', name: 'Main', nodes: [{ id: 'lead', type: 'terminal', data: { agentId: 'claude-code', label: 'Lead', cwd: folder } }], edges: [] }] };
  const board = workspace.boards[0];
  const ops = [];
  const enqueued = [];
  const logs = [];
  const settings = { tileTools, maxAgents };
  const live = new Set(running);
  let notes = 0;
  const requestOp = async (boardId, op) => {
    ops.push(op);
    if (boardId !== 'main') return { error: 'board' };
    const node = (id) => board.nodes.find((n) => n.id === id);
    switch (op.type) {
      case 'addAgent':
        board.nodes.push({ id: op.id, type: 'terminal', data: { agentId: op.agentId, label: op.label, cwd: op.cwd, createdBy: 'conductor', ...(op.role && { role: op.role }), ...(op.worktree && { branch: op.branch, worktree: op.worktree }) } });
        break;
      case 'addSticky': {
        const id = `note-${++notes}`;
        board.nodes.push({ id, type: 'note', data: { label: op.label, text: op.text } });
        conductor.setWorkspace(workspace);
        return { id };
      }
      case 'addLink': {
        const id = `xy-edge__${op.source}-${op.target}`;
        board.edges.push({ id, source: op.source, target: op.target, data: { enabled: true, maxTurns: 3, prompt: '', ...op.data } });
        conductor.setWorkspace(workspace);
        return { id };
      }
      case 'updateLink': { const edge = board.edges.find((e) => e.id === op.id); edge.data = { ...edge.data, ...op.patch }; break; }
      case 'removeLink': board.edges = board.edges.filter((e) => e.id !== op.id); break;
      case 'removeNode':
        board.nodes = board.nodes.filter((n) => n.id !== op.id);
        board.edges = board.edges.filter((e) => e.source !== op.id && e.target !== op.id);
        break;
      case 'updateSticky': node(op.id).data.text = op.text; break;
      case 'setRole': node(op.id).data.role = op.role; break;
    }
    conductor.setWorkspace(workspace);
    return { id: op.id ?? null };
  };
  conductor.init({
    requestOp,
    settings: () => settings,
    agents: () => AGENTS,
    info: (id) => (live.has(id) ? { status: 'idle' } : null),
    enqueue: (target, item) => enqueued.push({ target, item }),
    buffer: (id) => (id === 'lead' ? Array.from({ length: 200 }, (_, i) => `\x1b[32mline ${i}\x1b[0m`).join('\r\n') : ''),
    clean: (text) => text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n'),
    ensureWorktree: async (cwd, branch, options) => (options?.create ? { path: path.join(cwd, '..', 'wt', branch), branch } : { error: 'no' }),
    isRepo: async () => ({ root: folder }),
    logEntries: () => logs.map((entry, i) => ({ ...entry, at: 1000 * i, boardId: 'main' })),
    log: (entry) => logs.push(entry),
  });
  conductor.setWorkspace(workspace);
  const call = (name, args, caller = 'lead') => conductor.callTool(caller, name, args);
  return { conductor, workspace, board: () => workspace.boards[0], ops, enqueued, logs, settings, live, timers, folder, call };
}

test('Node link rules match the ones used by the map (src/lib/boardOps.js)', async () => {
  const { linkRule } = await esm('boardOps.js');
  const { linkRule: nodeRule } = load('conductor.cjs', { './i18n.cjs': i18n });
  const tiles = [
    { id: 'a', type: 'terminal', data: { agentId: 'claude-code' } },
    { id: 'b', type: 'terminal', data: { agentId: 'codex' } },
    { id: 's', type: 'terminal', data: { agentId: 'shell' } },
    { id: 't', type: 'terminal', data: { agentId: 'shell' } },
    { id: 'n', type: 'note', data: {} },
    { id: 'm', type: 'note', data: {} },
    { id: 'p', type: 'panel', data: {} },
  ];
  for (const a of tiles) for (const b of tiles) for (const mode of ['relay', 'delegate']) {
    assert.deepEqual(nodeRule(a, b, mode), linkRule(a, b, mode), `${a.id} -> ${b.id} (${mode})`);
  }
});

test('conductor tools are refused unless the caller is allowed', async (t) => {
  const off = setup(t, { tileTools: false });
  assert.equal((await off.call('read_board', {})).isError, true);
  const on = setup(t);
  assert.equal((await on.call('read_board', {}, 'unknown')).isError, true);
  on.live.delete('lead');
  assert.equal((await on.call('read_board', {})).isError, true, 'a tile that is not running cannot call the tools');
  assert.equal(on.conductor.tileTools('lead'), true);
  on.settings.tileTools = false;
  assert.equal(on.conductor.tileTools('lead'), false);
});

test('direct mode creates agents, links and sticky notes through the map and logs each creation', async (t) => {
  const s = setup(t);
  const created = await s.call('create_agent', { type: 'claude', name: 'Backend', role: 'You write the API.', prompt: 'Build /health', folder: 'api', near: 'Lead' });
  assert.equal(created.isError, false, created.text);
  const add = s.ops.find((op) => op.type === 'addAgent');
  assert.equal(add.label, 'Backend');
  assert.equal(add.cwd, path.join(s.folder, 'api'));
  assert.equal(add.role, 'You write the API.');
  assert.equal(add.near, 'lead');
  assert.match(created.text, new RegExp(add.id));
  // Une case créée par le chef d'orchestre n'a jamais ses outils.
  assert.equal(s.conductor.tileTools(add.id), false);
  assert.equal(s.conductor.isCreated(add.id), true);
  s.live.add(add.id);
  assert.equal((await s.call('read_board', {}, add.id)).isError, true);

  const link = await s.call('create_link', { from: 'lead', to: 'backend', mode: 'delegate', max_turns: 5 });
  assert.equal(link.isError, false, link.text);
  assert.deepEqual(s.board().edges[0].data.mode, 'delegate');
  assert.equal(s.board().edges[0].data.maxTurns, 5);
  assert.equal((await s.call('create_link', { from: 'Backend', to: 'Lead' })).isError, true, 'a second link between the same tiles is refused');

  const sticky = await s.call('create_sticky', { text: '- [ ] API', name: 'Plan' });
  assert.equal(sticky.isError, false);
  // Agent -> post-it : lien Note, quel que soit l'ordre et le mode demandé.
  await s.call('create_link', { from: 'Plan', to: 'Backend', mode: 'relay' });
  const noteLink = s.board().edges.find((e) => e.target === 'note-1');
  assert.equal(noteLink.source, add.id);
  assert.equal(noteLink.data.mode, 'note');
  assert.equal((await s.call('create_link', { from: 'Plan', to: 'Plan' })).isError, true);

  assert.equal((await s.call('update_link', { from: 'Lead', to: 'Backend', instruction: 'Review: {response}', mode: 'relay' })).isError, false);
  assert.equal(s.board().edges[0].data.mode, 'relay');
  assert.equal(s.board().edges[0].data.prompt, 'Review: {response}');
  assert.equal((await s.call('update_sticky', { sticky: 'Plan', text: '- [x] API' })).isError, false);
  assert.equal(s.board().nodes.find((n) => n.id === 'note-1').data.text, '- [x] API');
  assert.equal((await s.call('set_role', { agent: 'Backend', role: 'New role' })).isError, false);
  assert.equal(s.board().nodes.find((n) => n.id === add.id).data.role, 'New role');

  const kinds = s.logs.filter((e) => e.kind === 'conductor').map((e) => e.text.split(' ')[0]);
  assert.deepEqual(kinds, ['conductor.log.agent', 'conductor.log.link', 'conductor.log.sticky', 'conductor.log.link', 'conductor.log.linkUpdated', 'conductor.log.stickyUpdated', 'conductor.log.role']);
  assert.ok(s.logs.every((e) => e.from === 'lead'));

  assert.equal((await s.call('remove_link', { from: 'Lead', to: 'Backend' })).isError, false);
  assert.equal(s.board().edges.length, 1);
  assert.equal((await s.call('remove_agent', { agent: 'Backend' })).isError, false);
  assert.equal(s.board().nodes.some((n) => n.id === add.id), false);
});

test('validation: names, types, folders, limit and roles', async (t) => {
  const s = setup(t, { maxAgents: 2 });
  assert.equal((await s.call('create_agent', { type: 'gemini' })).isError, true);
  assert.equal((await s.call('create_agent', { type: 'claude', name: 'Lead' })).isError, true, 'name taken');
  assert.equal((await s.call('create_agent', { type: 'claude', name: 'x'.repeat(41) })).isError, true);
  assert.equal((await s.call('create_agent', { type: 'claude', folder: '..' })).isError, true, 'outside the working folder');
  assert.equal((await s.call('create_agent', { type: 'claude', folder: 'missing' })).isError, true, 'no folder creation');
  assert.equal((await s.call('create_agent', { type: 'terminal', prompt: 'npm test' })).isError, true, 'a terminal takes no prompt');
  assert.equal((await s.call('create_agent', { type: 'claude', near: 'nobody' })).isError, true);
  assert.equal(s.ops.length, 0, 'nothing reaches the map when validation fails');

  // Noms par défaut numérotés ; la limite ne compte que les agents (pas les terminaux ni les post-it).
  assert.equal((await s.call('create_agent', { type: 'codex' })).isError, false);
  assert.equal(s.ops.at(-1).label, 'Codex 1');
  assert.equal((await s.call('create_agent', { type: 'terminal' })).isError, false);
  assert.equal((await s.call('create_agent', { type: 'claude' })).isError, false);
  const limit = await s.call('create_agent', { type: 'claude' });
  assert.equal(limit.isError, true);
  assert.match(limit.text, /conductor\.limit 2/);
  assert.equal((await s.call('create_sticky', { text: 'still allowed' })).isError, false);
});

test('worktree option creates the branch worktree before the tile', async (t) => {
  const s = setup(t);
  const result = await s.call('create_agent', { type: 'claude', name: 'Front', worktree_branch: 'maestro/front' });
  assert.equal(result.isError, false, result.text);
  const add = s.ops.find((op) => op.type === 'addAgent');
  assert.equal(add.branch, 'maestro/front');
  assert.equal(add.worktree, path.join(s.folder, '..', 'wt', 'maestro/front'));
  assert.equal(add.cwd, s.folder);
});

test('initial prompt is queued after the agent SessionStart, and messages need a running agent', async (t) => {
  const s = setup(t);
  await s.call('create_agent', { type: 'claude', name: 'Worker', prompt: 'Write the tests' });
  const id = s.ops[0].id;
  assert.equal(s.enqueued.length, 0);
  s.live.add(id);
  s.conductor.onHook(id, { hook_event_name: 'UserPromptSubmit' });
  s.timers.tick(5000);
  assert.equal(s.enqueued.length, 0);
  s.conductor.onHook(id, { hook_event_name: 'SessionStart' });
  s.timers.tick(1499);
  assert.equal(s.enqueued.length, 0, 'waits for the CLI prompt to be drawn');
  s.timers.tick(1);
  assert.equal(s.enqueued.length, 1);
  assert.equal(s.enqueued[0].target, id);
  assert.equal(s.enqueued[0].item.text, 'Write the tests');
  assert.equal(s.enqueued[0].item.from, 'lead');
  assert.equal(s.enqueued[0].item.id, null, 'no link is animated');

  assert.equal((await s.call('send_to', { agent: 'Worker', message: 'Also lint' })).isError, false);
  assert.equal(s.enqueued.at(-1).item.text, 'Also lint');
  s.live.delete(id);
  assert.equal((await s.call('send_to', { agent: 'Worker', message: 'Hello?' })).isError, true);

  // Un agent qui ne démarre jamais : refus dans le journal.
  await s.call('create_agent', { type: 'codex', name: 'Late', prompt: 'Go' });
  s.timers.tick(90000);
  assert.equal(s.logs.at(-1).kind, 'refused');
});

test('read_board and read_agent_output stay compact', async (t) => {
  const s = setup(t);
  await s.call('create_agent', { type: 'claude', name: 'Worker', role: 'r'.repeat(1000) });
  const view = JSON.parse((await s.call('read_board', {})).text);
  assert.equal(view.mode, 'direct');
  assert.deepEqual(view.conductor_agents, { used: 1, max: 6 });
  assert.equal(view.agents.find((a) => a.name === 'Lead').type, 'claude');
  const worker = view.agents.find((a) => a.name === 'Worker');
  assert.equal(worker.status, 'not_running');
  assert.equal(worker.created_by_conductor, true);
  assert.ok(worker.role.length <= 301);
  assert.equal(view.recent_log.length, 1);

  const output = (await s.call('read_agent_output', { agent: 'Lead', lines: 500 })).text.split('\n');
  assert.equal(output.length, 80);
  assert.equal(output.at(-1), 'line 199');
  assert.ok(output.every((line) => !line.includes('\x1b')));
  assert.equal((await s.call('read_agent_output', { agent: 'Lead' })).text.split('\n').length, 40);
  assert.equal((await s.call('read_agent_output', { agent: 'Worker' })).isError, true, 'not running');
});

test('preview keeps actions pending with temporary ids, then commit applies them in order', async (t) => {
  const s = setup(t, { maxAgents: 2 });
  s.conductor.openSession('conductor-main', { boardId: 'main', folder: s.folder, preview: true });
  const call = (name, args) => s.conductor.callTool('conductor-main', name, args);

  const a = await call('create_agent', { type: 'claude', name: 'Backend', prompt: 'API' });
  assert.match(a.text, /pending-1/);
  const b = await call('create_agent', { type: 'codex', name: 'Tester', near: 'pending-1' });
  assert.match(b.text, /pending-2/);
  assert.equal((await call('create_agent', { type: 'claude' })).isError, true, 'the limit counts pending agents');
  assert.equal((await call('create_agent', { type: 'claude', name: 'Backend' })).isError, true, 'pending names are taken');
  assert.equal((await call('create_link', { from: 'Backend', to: 'pending-2', mode: 'relay', instruction: 'Test: {response}' })).isError, false);
  await call('create_sticky', { text: '- [ ] API', name: 'Plan' });
  await call('create_link', { from: 'Plan', to: 'Backend' });
  await call('set_role', { agent: 'Lead', role: 'Coordinate' });
  await call('send_to', { agent: 'Tester', message: 'Wait for Backend' });
  assert.equal(s.ops.length, 0, 'nothing touches the map before approval');

  const view = JSON.parse((await call('read_board', {})).text);
  assert.equal(view.mode, 'preview');
  assert.equal(view.agents.find((x) => x.name === 'Backend').pending, true);
  assert.equal(view.agents.find((x) => x.name === 'Backend').status, 'pending');
  assert.equal(view.links.filter((l) => l.pending).length, 2);
  assert.equal(view.stickies[0].pending, true);
  assert.equal(view.pending_changes.length, 2);

  // Retirer un élément de l'aperçu retire aussi ce qui en dépend.
  await call('create_agent', { type: 'terminal', name: 'Shell' });
  await call('create_link', { from: 'Backend', to: 'Shell' });
  await call('remove_agent', { agent: 'Shell' });
  const shellId = 'pending-6';
  assert.equal(s.conductor.pendingOf('conductor-main').some((p) => p.tempId === shellId || p.target === shellId || p.source === shellId), false);
  assert.equal(s.conductor.pendingOf('conductor-main').length, 7);

  const results = await s.conductor.commit('conductor-main');
  assert.ok(results.every((r) => !r.isError), JSON.stringify(results));
  const board = s.board();
  const backend = board.nodes.find((n) => n.data.label === 'Backend');
  const tester = board.nodes.find((n) => n.data.label === 'Tester');
  assert.equal(s.ops.find((op) => op.label === 'Tester').near, backend.id, 'temporary ids are remapped');
  assert.ok(board.edges.some((e) => e.source === backend.id && e.target === tester.id && e.data.mode === 'relay'));
  assert.ok(board.edges.some((e) => e.source === backend.id && e.data.mode === 'note'));
  assert.equal(board.nodes.find((n) => n.id === 'lead').data.role, 'Coordinate');
  assert.deepEqual(s.conductor.pendingOf('conductor-main'), []);
  // Message à un agent créé par la validation : envoyé avec son démarrage.
  s.live.add(tester.id);
  s.conductor.onHook(tester.id, { hook_event_name: 'SessionStart' });
  s.timers.tick(1500);
  assert.equal(s.enqueued.find((e) => e.target === tester.id).item.text, 'Wait for Backend');

  await call('create_agent', { type: 'terminal', name: 'Later' });
  s.conductor.discard('conductor-main');
  assert.deepEqual(s.conductor.pendingOf('conductor-main'), []);
});

test('autoPlace never overlaps and fans agents out below their lead', async () => {
  const { autoPlace } = await esm('autoPlace.js');
  const size = { width: 640, height: 400 };
  assert.deepEqual(autoPlace([], size, { origin: { x: 1000, y: 500 } }), { x: 680, y: 300 });
  const nodes = [{ id: 'lead', position: { x: 0, y: 0 }, style: { ...size } }];
  const placed = [];
  for (let i = 0; i < 5; i++) {
    const at = autoPlace(nodes, size, { near: 'lead' });
    placed.push(at);
    nodes.push({ id: `w${i}`, position: at, style: { ...size } });
  }
  assert.equal(placed[0].x, 0, 'first worker right below the lead');
  assert.ok(placed.slice(0, 3).every((p) => p.y === 520));
  assert.ok(placed[1].x > 0 && placed[2].x < 0, 'then right and left');
  const free = autoPlace(nodes, { width: 270, height: 180 });
  nodes.push({ id: 'note', position: free, style: { width: 270, height: 180 } });
  for (const a of nodes) for (const b of nodes) {
    if (a === b) continue;
    const [sa, sb] = [a.style, b.style];
    const overlap = a.position.x < b.position.x + sb.width && a.position.x + sa.width > b.position.x && a.position.y < b.position.y + sb.height && a.position.y + sa.height > b.position.y;
    assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
  }
});

test('ensureWorktree with create makes a new branch worktree from HEAD with real Git, and reuses it', async (t) => {
  const { execFileSync } = require('child_process');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-wt-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  const run = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: repo });
  run('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  run('add', 'a.txt');
  run('commit', '-q', '-m', 'init');
  const git = load('git.cjs', { electron: { ipcMain: { handle: () => {} }, shell: {} }, './i18n.cjs': i18n });

  assert.match((await git.ensureWorktree(repo, 'maestro/api')).error, /git.branchNotFound/, 'without create, unknown branches are still refused');
  assert.match((await git.ensureWorktree(repo, 'bad..name', { create: true })).error, /git.badBranchName/);
  const created = await git.ensureWorktree(repo, 'maestro/api', { create: true });
  assert.equal(created.branch, 'maestro/api');
  assert.equal(fs.realpathSync(created.path), fs.realpathSync(path.join(base, 'repo-worktrees', 'maestro', 'api')));
  assert.ok(fs.existsSync(path.join(created.path, 'a.txt')));
  const again = await git.ensureWorktree(repo, 'maestro/api', { create: true });
  assert.equal(fs.realpathSync(again.path), fs.realpathSync(created.path), 'a second agent on the same branch reuses the worktree');
});

test('a lead with two workers forms a symmetric pyramid, and arrangeShape follows the asked layout', async () => {
  const { autoPlace, centeredRow, arrangeShape } = await esm('autoPlace.js');
  const size = { width: 640, height: 400 };
  const lead = { id: 'lead', position: { x: 0, y: 0 }, style: { ...size } };
  const leadCenter = 320;
  // Premier agent : sous le chef ; deuxième : la rangée est recentrée.
  const first = { id: 'a', position: autoPlace([lead], size, { near: 'lead' }), style: { ...size } };
  assert.equal(first.position.x + 320, leadCenter);
  const row = centeredRow([lead, first], 'lead', ['a'], size);
  const [left, right] = row;
  assert.equal(left.id, 'a');
  assert.equal(right.id, null);
  assert.equal((left.x + right.x + 640) / 2, leadCenter, 'the lead is centered above its two workers');
  assert.equal(left.y, right.y);
  // Une case qui gêne : pas de recentrage (repli sur la place libre).
  const blocker = { id: 'b', position: { x: right.x, y: right.y }, style: { ...size } };
  assert.equal(centeredRow([lead, first, blocker], 'lead', ['a'], size), null);

  // arrange : pyramide suivant les liens depuis le haut, quel que soit l'ordre de départ.
  const nodes = ['lead', 'w1', 'w2', 'w3'].map((id, i) => ({ id, position: { x: i * 700, y: 0 }, style: { ...size } }));
  const edges = [{ source: 'lead', target: 'w1' }, { source: 'lead', target: 'w2' }, { source: 'w2', target: 'w3' }];
  const pyramid = arrangeShape(nodes, edges, ['w3', 'w1', 'lead', 'w2'], 'pyramid', 'lead');
  const p = (id) => pyramid.get(id);
  assert.equal(p('w1').y, p('w2').y);
  assert.ok(p('w3').y > p('w1').y && p('w1').y > p('lead').y);
  assert.equal((p('w1').x + p('w2').x) / 2, p('lead').x, 'second row centered under the top');
  assert.equal(p('w3').x, p('lead').x);
  const line = arrangeShape(nodes, [], ['lead', 'w1', 'w2'], 'row');
  assert.equal(new Set([...line.values()].map((v) => v.y)).size, 1);
  const column = arrangeShape(nodes, [], ['lead', 'w1', 'w2'], 'column');
  assert.equal(new Set([...column.values()].map((v) => v.x)).size, 1);
  const grid = arrangeShape(nodes, [], ['lead', 'w1', 'w2', 'w3'], 'grid');
  assert.equal(new Set([...grid.values()].map((v) => v.y)).size, 2);
});

test('arrange is validated, logged, and kept with remapped ids in preview', async (t) => {
  const s = setup(t);
  await s.call('create_agent', { type: 'terminal', name: 'A' });
  assert.equal((await s.call('arrange', { layout: 'circle' })).isError, true);
  assert.equal((await s.call('arrange', { layout: 'row', tiles: ['Lead'] })).isError, true, 'at least two tiles');
  assert.equal((await s.call('arrange', { layout: 'pyramid', tiles: ['Lead', 'A'], top: 'Nobody' })).isError, true);
  assert.equal((await s.call('arrange', { layout: 'pyramid', top: 'Lead' })).isError, false);
  const op = s.ops.at(-1);
  assert.deepEqual({ type: op.type, layout: op.layout, top: op.top, count: op.ids.length }, { type: 'arrange', layout: 'pyramid', top: 'lead', count: 2 });
  assert.match(s.logs.at(-1).text, /conductor.log.arrange 2/);

  s.conductor.openSession('conductor-main', { boardId: 'main', folder: s.folder, preview: true });
  const call = (name, args) => s.conductor.callTool('conductor-main', name, args);
  await call('create_agent', { type: 'terminal', name: 'B' });
  await call('arrange', { layout: 'row', tiles: ['Lead', 'pending-1'] });
  const before = s.ops.length;
  await s.conductor.commit('conductor-main');
  const arrange = s.ops.slice(before).find((o) => o.type === 'arrange');
  const b = s.board().nodes.find((n) => n.data.label === 'B');
  assert.deepEqual(arrange.ids, ['lead', b.id]);
});

test('the preview puts ghosts exactly where approval will place the tiles', async () => {
  const { previewLayout, placeAgent, autoPlace, arrangeShape } = await esm('autoPlace.js');
  const agentSize = { width: 640, height: 400 };
  const noteSize = { width: 270, height: 180 };
  const origin = { x: 0, y: 0 };
  const nodes = [
    { id: 'lead', position: { x: 0, y: 0 }, style: { ...agentSize } },
    { id: 'old', position: { x: 2000, y: 0 }, style: { ...agentSize } },
  ];
  const pending = [
    { type: 'create_agent', tempId: 'pending-1', kind: 'agent', agentId: 'claude-code', name: 'A', near: 'lead', role: 'r', prompt: 'p' },
    { type: 'create_agent', tempId: 'pending-2', kind: 'agent', agentId: 'codex', name: 'B', near: 'lead' },
    { type: 'create_sticky', tempId: 'pending-3', kind: 'sticky', name: 'Plan', text: '- [ ] x' },
    { type: 'create_link', tempId: 'pending-4', source: 'lead', target: 'pending-1', data: { mode: 'delegate' } },
    { type: 'remove_agent', target: 'old' },
  ];
  const view = previewLayout(nodes, [], pending, { origin, agentSize, noteSize });

  // Même suite d'opérations qu'à la validation (useConductorOps) : placeAgent, puis autoPlace pour le post-it.
  let work = nodes.map((n) => ({ ...n }));
  const a = placeAgent(work, [], 'lead', agentSize, origin);
  work.push({ id: 'A', position: a.position, style: { ...agentSize } });
  const b = placeAgent(work, ['A'], 'lead', agentSize, origin);
  work = work.map((n) => (b.moved.has(n.id) ? { ...n, position: b.moved.get(n.id) } : n));
  work.push({ id: 'B', position: b.position, style: { ...agentSize } });
  const note = autoPlace(work, noteSize, { origin });
  const ghost = (id) => view.ghosts.find((g) => g.id === id);
  assert.deepEqual(ghost('pending-1').position, work.find((n) => n.id === 'A').position);
  assert.deepEqual(ghost('pending-2').position, b.position);
  assert.deepEqual(ghost('pending-3').position, note);
  assert.equal(ghost('pending-1').data.role, 'r');
  assert.equal(ghost('pending-3').kind, 'sticky');
  assert.deepEqual(view.links, [{ id: 'pending-4', source: 'lead', target: 'pending-1', mode: 'delegate' }]);
  assert.deepEqual([...view.removing], ['old']);
  assert.equal(view.ghosts.some((g) => g.kind === 'move'), false, 'nothing real moves here');

  // arrange qui déplace une case existante : sa nouvelle place est montrée.
  const arranged = previewLayout(nodes, [], [{ type: 'arrange', targets: ['lead', 'old'], layout: 'column', top: null }], { origin, agentSize, noteSize });
  const expected = arrangeShape(nodes, [], ['lead', 'old'], 'column', null);
  const moves = arranged.ghosts.filter((g) => g.kind === 'move');
  assert.ok(moves.length >= 1);
  for (const m of moves) assert.deepEqual(m.position, expected.get(m.of));
});

test('pending changes are announced on proposal, approval and cancellation', async (t) => {
  const s = setup(t);
  const seen = [];
  s.conductor.init({ onPending: (caller, items) => seen.push({ caller, count: items.length }) });
  s.conductor.openSession('conductor-main', { boardId: 'main', folder: s.folder, preview: true });
  await s.conductor.callTool('conductor-main', 'create_sticky', { text: 'a' });
  await s.conductor.callTool('conductor-main', 'create_sticky', { text: 'b' });
  assert.deepEqual(seen.map((e) => e.count), [1, 2]);
  assert.ok(seen.every((e) => e.caller === 'conductor-main'));
  s.conductor.discard('conductor-main');
  assert.equal(seen.at(-1).count, 0);
  await s.conductor.callTool('conductor-main', 'create_sticky', { text: 'c' });
  await s.conductor.commit('conductor-main');
  assert.equal(seen.at(-1).count, 0);
  assert.ok(s.board().nodes.some((n) => n.data.text === 'c'));
});

test('sticky notes written in the same message, or linked to the group, follow it when it is arranged', async (t) => {
  const s = setup(t);
  s.conductor.openSession('conductor-main', { boardId: 'main', folder: s.folder, preview: false });
  const call = (name, args) => s.conductor.callTool('conductor-main', name, args);
  await call('create_sticky', { text: 'old', name: 'Old' });
  s.conductor.openSession('conductor-main', { boardId: 'main', folder: s.folder, preview: false }); // message suivant
  await call('create_agent', { type: 'terminal', name: 'A' });
  await call('create_sticky', { text: '- [ ] plan', name: 'Plan' });
  await call('arrange', { layout: 'row', tiles: ['Lead', 'A'] });
  const arrange = s.ops.at(-1);
  const plan = s.board().nodes.find((n) => n.data.label === 'Plan').id;
  assert.deepEqual(arrange.companions, [plan], 'only the note written during this message');
  // Un post-it relié à une case du groupe la suit aussi.
  const old = s.board().nodes.find((n) => n.data.label === 'Old').id;
  await call('create_link', { from: 'Lead', to: 'Old' });
  await call('arrange', { layout: 'column', tiles: ['Lead', 'A'] });
  assert.deepEqual(s.ops.at(-1).companions.sort(), [old, plan].sort());

  const { besideGroup, previewLayout, arrangeShape } = await esm('autoPlace.js');
  const size = { width: 640, height: 400 };
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, style: { ...size } },
    { id: 'b', position: { x: 700, y: 0 }, style: { ...size } },
    { id: 'n', position: { x: 5000, y: 3000 }, style: { width: 270, height: 180 } },
  ];
  const shape = arrangeShape(nodes, [{ source: 'a', target: 'b' }], ['a', 'b'], 'pyramid', 'a');
  const beside = besideGroup(nodes, shape, ['n']).get('n');
  const right = Math.max(...['a', 'b'].map((id) => shape.get(id).x + 640));
  assert.ok(beside.x > right && beside.x - right <= 200, 'right next to the group');
  assert.equal(beside.y, Math.min(...['a', 'b'].map((id) => shape.get(id).y)));
  const view = previewLayout(nodes, [], [{ type: 'arrange', targets: ['a', 'b'], layout: 'pyramid', top: 'a', companions: ['n'] }], { origin: { x: 0, y: 0 }, agentSize: size, noteSize: { width: 270, height: 180 } });
  assert.deepEqual(view.ghosts.find((g) => g.of === 'n').position, besideGroup(nodes, arrangeShape(nodes, [], ['a', 'b'], 'pyramid', 'a'), ['n']).get('n'));
});
