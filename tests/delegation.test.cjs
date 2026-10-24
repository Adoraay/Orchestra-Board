const test = require('node:test');
const assert = require('node:assert/strict');
const { load, clock, i18n } = require('./helpers.cjs');

function setup() {
  const time = clock();
  const logs = [];
  const writes = [];
  const statuses = new Map(['a', 'b', 'worker'].map((id) => [id, { status: 'idle' }]));
  const relay = load('linkRelay.cjs', { './i18n.cjs': i18n }, time);
  const delegation = load('delegation.cjs', { './linkRelay.cjs': relay, './i18n.cjs': i18n }, time);
  const workspace = { boards: [{ nodes: ['a', 'b', 'worker'].map((id) => ({ id, type: 'terminal', data: { agentId: 'claude-code', label: id } })), edges: ['a', 'b'].map((id) => ({ id, source: id, target: 'worker', data: { mode: 'delegate', maxTurns: 3, enabled: true } })) }] };
  relay.init({ write: (id, data) => writes.push({ id, data }), status: (id) => statuses.get(id)?.status ?? null, arm() {}, emit() {}, log: (e) => logs.push(e) });
  delegation.init({ info: (id) => statuses.get(id), agent: () => ({ name: 'Claude', hooks: 'claude' }), emit() {}, log: (e) => logs.push(e) });
  relay.setLinks(workspace);
  delegation.setWorkspace(workspace);
  const send = (caller, message) => delegation.callTool(caller, 'send_to_agent', { name: 'worker', message });
  const status = (value) => {
    if (value) statuses.set('worker', { status: value }); else statuses.delete('worker');
    relay.onStatus('worker', value ? { status: value } : null);
    delegation.onStatus('worker', value ? { status: value } : null);
  };
  const stop = (text) => {
    const payload = { last_assistant_message: text };
    delegation.onStop('worker', payload);
    relay.onStop('worker', payload);
    status('done');
  };
  return { time, writes, logs, statuses, relay, delegation, workspace, send, status, stop };
}

test('two chiefs receive their own replies; the second paste waits for the first Stop', async () => {
  const s = setup();
  await s.send('a', 'task A');
  await s.send('b', 'task B');
  assert.equal(s.writes.length, 1);
  s.time.tick(250);
  s.status('working');
  assert.equal(s.writes.length, 2);
  s.stop('reply A');
  s.time.tick(409);
  assert.equal(s.writes.length, 2);
  s.time.tick(1);
  assert.equal(s.writes.length, 3);
  const ids = s.logs.filter((e) => e.kind === 'delegate').map((e) => e.taskId);
  assert.notEqual(ids[0], ids[1]);
  const first = await s.delegation.callTool('a', 'wait_for_replies', { task_ids: [ids[0]] });
  assert.match(first.text, /reply A/);
  assert.doesNotMatch(first.text, /reply B/);
  s.time.tick(250);
  s.status('working');
  s.stop('reply B');
  s.time.tick(410);
  const second = await s.delegation.callTool('b', 'wait_for_replies', {});
  assert.match(second.text, /reply B/);
  assert.doesNotMatch(second.text, /reply A/);
});

test('same chief can queue multiple tasks for one target and collect both', async () => {
  const s = setup();
  await s.send('a', 'one'); await s.send('a', 'two');
  for (const reply of ['first', 'second']) {
    s.time.tick(250); s.status('working'); s.stop(reply); s.time.tick(410);
  }
  const result = await s.delegation.callTool('a', 'wait_for_replies', { names: ['worker'] });
  assert.match(result.text, /first/); assert.match(result.text, /second/);
  assert.match((await s.delegation.callTool('a', 'wait_for_replies', {})).text, /nothingPending/);
});

test('permissions block delivery; foreign task IDs are refused; turn limit still applies', async () => {
  const s = setup();
  s.status('waiting');
  await s.send('a', 'one');
  assert.equal(s.writes.length, 0);
  const id = s.logs.find((e) => e.kind === 'delegate').taskId;
  assert.equal((await s.delegation.callTool('b', 'wait_for_replies', { task_ids: [id] })).isError, true);
  await s.send('a', 'two'); await s.send('a', 'three');
  assert.equal((await s.send('a', 'four')).isError, true);
  s.status(null);
  assert.match((await s.delegation.callTool('a', 'wait_for_replies', {})).text, /targetGone|closed/);
  s.time.tick(40000); assert.equal(s.writes.length, 0);
});

test('a removed queued link does not starve the next valid task', async () => {
  const s = setup();
  s.status('working');
  await s.send('a', 'cancelled'); await s.send('b', 'valid');
  s.workspace.boards[0].edges[0].data.enabled = false;
  s.delegation.setWorkspace(s.workspace);
  s.status('done');
  assert.equal(s.writes.length, 1);
  assert.match(s.writes[0].data, /valid/);
  assert.match((await s.delegation.callTool('a', 'wait_for_replies', {})).text, /cancelled/);
  s.status(null);
});

test('closed or unconfirmed target releases waits without delivering stale queued messages', async () => {
  const s = setup();
  await s.send('a', 'one'); await s.send('b', 'two');
  s.time.tick(30000);
  assert.match((await s.delegation.callTool('a', 'wait_for_replies', {})).text, /unconfirmed/);
  assert.match((await s.delegation.callTool('b', 'wait_for_replies', {})).text, /unconfirmed/);
  assert.equal(s.writes.filter((w) => w.data.includes('two')).length, 0);
});

test('unlinking a delivery already pasted keeps its reply and never mixes the next prompt', async () => {
  const s = setup();
  await s.send('a', 'already pasted');
  s.workspace.boards[0].edges[0].data.enabled = false;
  s.delegation.setWorkspace(s.workspace);
  s.time.tick(250); s.status('working'); s.stop('still tracked'); s.time.tick(410);
  assert.match((await s.delegation.callTool('a', 'wait_for_replies', {})).text, /still tracked/);
  assert.equal(s.writes.filter((w) => w.data === '\r').length, 1);
});
