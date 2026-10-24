const test = require('node:test');
const assert = require('node:assert/strict');
const { load, clock, i18n } = require('./helpers.cjs');

// Une source A reliée à B en Transmission (review au choix), et un chef qui délègue à B.
function setup({ review = true } = {}) {
  const time = clock();
  const logs = [];
  const writes = [];
  const events = [];
  let pending = [];
  const statuses = new Map(['a', 'b', 'chief'].map((id) => [id, { status: 'idle' }]));
  const relay = load('linkRelay.cjs', { './i18n.cjs': i18n }, time);
  const delegation = load('delegation.cjs', { './linkRelay.cjs': relay, './i18n.cjs': i18n }, time);
  const workspace = {
    boards: [{
      nodes: ['a', 'b', 'chief'].map((id) => ({ id, type: 'terminal', data: { agentId: 'claude-code', label: id } })),
      edges: [
        { id: 'relay-link', source: 'a', target: 'b', data: { mode: 'relay', prompt: 'Review: {response}', maxTurns: 3, enabled: true, review } },
        { id: 'delegate-link', source: 'chief', target: 'b', data: { mode: 'delegate', maxTurns: 3, enabled: true } },
      ],
    }],
  };
  relay.init({
    write: (id, data) => writes.push({ id, data }),
    status: (id) => statuses.get(id)?.status ?? null,
    arm() {},
    emit: (id, event) => events.push({ id, ...event }),
    log: (e) => logs.push(e),
    nameOf: (id) => id.toUpperCase(),
    pending: (list) => { pending = list; },
  });
  delegation.init({ info: (id) => statuses.get(id), agent: () => ({ name: 'Claude', hooks: 'claude' }), emit() {}, log: (e) => logs.push(e) });
  relay.setLinks(workspace);
  delegation.setWorkspace(workspace);
  const status = (id, value) => {
    const info = value === null ? null : { status: value };
    if (info) statuses.set(id, info);
    else statuses.delete(id);
    relay.onStatus(id, info);
    delegation.onStatus(id, info);
  };
  const finish = (id, text) => {
    relay.onStop(id, { last_assistant_message: text });
    delegation.onStop(id, { last_assistant_message: text });
    status(id, 'done');
  };
  return { time, logs, writes, events, statuses, relay, delegation, workspace, status, finish, pending: () => pending };
}

const pasted = (s, id) => s.writes.filter((w) => w.id === id && w.data.startsWith('\x1b[200~'));

test('a reviewed relay waits as an editable draft, then sends the edited text', () => {
  const s = setup();
  s.finish('a', 'my reply');
  s.time.tick(400);
  assert.equal(pasted(s, 'b').length, 0, 'nothing is sent without approval');
  const [draft] = s.pending();
  assert.equal(draft.state, 'draft');
  assert.equal(draft.text, 'Review: my reply');
  assert.equal(draft.fromName, 'A');
  assert.equal(s.events.at(-1).state, 'review');

  assert.ok(s.relay.approve(draft.qid, 'Edited: my reply').ok);
  assert.equal(pasted(s, 'b').length, 1);
  assert.match(pasted(s, 'b')[0].data, /Edited: my reply/);
  s.time.tick(250);
  const kinds = s.logs.filter((e) => e.taskId === draft.qid).map((e) => e.kind);
  assert.deepEqual(kinds, ['draft', 'relay', 'delivered']);
  assert.equal(s.pending().length, 0);
});

test('a discarded draft never leaves and does not use a turn', () => {
  const s = setup();
  s.finish('a', 'reply');
  s.time.tick(400);
  const [draft] = s.pending();
  assert.ok(s.relay.discard(draft.qid).ok);
  assert.equal(pasted(s, 'b').length, 0);
  assert.equal(s.logs.at(-1).kind, 'cancelled');
  assert.equal(s.relay.chainOf('a').counts.get('relay-link') ?? 0, 0);
  assert.ok(s.relay.approve(draft.qid, 'late').error, 'a discarded draft cannot be sent afterwards');
});

test('relay settings are checked again after the transcript read delay', () => {
  for (const change of ['remove', 'disable', 'redirect', 'empty']) {
    const s = setup();
    s.finish('a', 'stale reply');
    const edge = s.workspace.boards[0].edges[0];
    if (change === 'remove') s.workspace.boards[0].edges = [];
    if (change === 'disable') edge.data.enabled = false;
    if (change === 'redirect') edge.target = 'chief';
    if (change === 'empty') edge.data.prompt = '';
    s.relay.setLinks(s.workspace);
    s.time.tick(400);
    assert.equal(s.pending().length, 0, change);
    assert.equal(s.writes.length, 0, change);
  }

  const s = setup({ review: false });
  s.finish('a', 'requires approval');
  s.workspace.boards[0].edges[0].data.review = true;
  s.relay.setLinks(s.workspace);
  s.time.tick(400);
  assert.equal(s.pending()[0].state, 'draft', 'enabling review before preparation prevents an automatic send');
  assert.equal(s.writes.length, 0);
});

test('multiple drafts are handled by identity without recalling or duplicating a message', () => {
  const s = setup();
  s.finish('a', 'first');
  s.time.tick(400);
  s.finish('a', 'second');
  s.time.tick(400);
  const [first, second] = s.pending();
  assert.notEqual(first.qid, second.qid);
  s.relay.discard(first.qid);
  assert.deepEqual(s.pending().map((d) => d.qid), [second.qid]);
  assert.ok(s.relay.approve(second.qid, second.text).ok);
  assert.ok(s.relay.approve(second.qid, second.text).error);
  assert.equal(pasted(s, 'b').length, 1);
  assert.match(pasted(s, 'b')[0].data, /second/);
  assert.doesNotMatch(pasted(s, 'b')[0].data, /first/);
});

test('a target that closes produces a final refused state for its queued task', () => {
  const s = setup({ review: false });
  s.status('b', 'working');
  s.finish('a', 'queued reply');
  s.time.tick(400);
  const [queued] = s.pending();
  s.status('b', null);
  assert.equal(s.pending().length, 0);
  assert.deepEqual(s.logs.filter((e) => e.taskId === queued.taskId).map((e) => e.kind), ['relay', 'refused']);
  assert.equal(s.writes.length, 0);
});

test('removing the link drops its draft; automatic relay still works without review', () => {
  const s = setup();
  s.finish('a', 'reply');
  s.time.tick(400);
  s.relay.setLinks({ boards: [{ nodes: [], edges: [] }] });
  assert.equal(s.pending().length, 0);
  assert.equal(s.logs.at(-1).kind, 'cancelled');

  const auto = setup({ review: false });
  auto.finish('a', 'reply');
  auto.time.tick(400);
  assert.equal(pasted(auto, 'b').length, 1);
});

test('a queued delegation cancelled while the target works never reaches it', async () => {
  const s = setup({ review: false });
  s.status('b', 'working');
  const sent = await s.delegation.callTool('chief', 'send_to_agent', { name: 'b', message: 'do it' });
  assert.equal(sent.isError, false);
  const [queued] = s.pending();
  assert.equal(queued.state, 'queued');
  assert.equal(queued.kind, 'delegate');
  assert.equal(queued.text, 'do it');

  assert.ok(s.relay.cancel(queued.qid).ok);
  s.status('b', 'done');
  s.time.tick(5000);
  assert.equal(pasted(s, 'b').length, 0, 'not sent when the target becomes free');
  const reply = await s.delegation.callTool('chief', 'wait_for_replies', {});
  assert.match(reply.text, /pending.cancelledByUser/);
  assert.equal(s.relay.chainOf('chief').counts.get('delegate-link'), 0, 'the turn is given back');
  assert.ok(s.relay.cancel(queued.qid).error);
});

test('a message already being pasted cannot be cancelled', async () => {
  const s = setup({ review: false });
  await s.delegation.callTool('chief', 'send_to_agent', { name: 'b', message: 'now' });
  const [delivering] = s.pending();
  assert.equal(delivering.state, 'delivering');
  assert.ok(s.relay.cancel(delivering.qid).error);
  s.time.tick(250);
  assert.equal(s.pending().length, 0, 'a submitted message is no longer pending');
  assert.ok(s.logs.some((e) => e.kind === 'delivered' && e.taskId === delivering.taskId));
});

test('activity log keeps the board of each event and the new kinds', () => {
  const sent = [];
  const log = load('activityLog.cjs', { electron: { ipcMain: { handle() {} } } });
  log.init({ nameOf: (id) => id, boardOf: (id) => ({ a: 'board-1', b: 'board-2' })[id] ?? null, emit: (e) => sent.push(e) });
  log.add({ kind: 'delivered', taskId: 't1', from: 'a', to: 'b' });
  log.add({ kind: 'cancelled', taskId: 't2', from: null, to: 'b' });
  log.add({ kind: 'unknown' });
  assert.deepEqual(sent.map((e) => [e.kind, e.boardId]), [['delivered', 'board-1'], ['cancelled', 'board-2']]);
});

test('diagnostics distinguish missing command, unknown and unchecked versions, and hooks', async () => {
  const diag = load('diagnostics.cjs');
  const agents = [
    { id: 'claude-code', name: 'Claude Code', command: 'claude', hooks: 'claude' },
    { id: 'codex', name: 'Codex', command: 'codex', hooks: 'codex' },
    { id: 'custom-abcd', name: 'Mine', command: 'mine --flag' },
    { id: 'gemini', name: 'Gemini', command: 'gemini' },
    { id: 'shell', name: 'Terminal', command: null },
  ];
  const testCommand = async (command) => (command === 'gemini' ? { ok: false, message: 'not in PATH' } : { ok: true, message: `C:\\bin\\${command.split(' ')[0]}.exe` });
  const runs = [];
  const run = (file, args, _opts, cb) => {
    runs.push(file);
    cb(null, file.includes('claude') ? '2.1.4 (Claude Code)\n' : 'no number here', '');
  };
  const result = await diag.checkAgents(agents, testCommand, run);
  const byId = Object.fromEntries(result.map((r) => [r.id, r]));
  assert.equal(result.length, 4, 'the plain terminal has no command to check');
  assert.equal(byId['claude-code'].version, '2.1.4');
  assert.equal(byId.codex.version, null);
  assert.equal(byId.codex.versionChecked, true);
  assert.equal(byId['custom-abcd'].versionChecked, false);
  assert.ok(!runs.some((file) => file.includes('mine')), 'custom commands are never run');
  assert.equal(byId.gemini.state, 'missing');

  diag.onLaunch('t1');
  diag.onLaunch('t2');
  diag.onHook('t1', 'Stop');
  const tiles = diag.tileStates([
    { id: 't1', hooks: 'claude' },
    { id: 't2', hooks: 'codex' },
    { id: 't3', hooks: null },
  ]);
  assert.equal(tiles[0].lastHook.event, 'Stop');
  assert.equal(tiles[1].lastHook, null);
  assert.ok(tiles[1].launchedAt);
  assert.equal(tiles[2].lastHook, null);
  diag.onLaunch('t1');
  assert.equal(diag.tileStates([{ id: 't1', hooks: 'claude' }])[0].lastHook, null, 'a relaunch starts without the old hook');
});
