const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, clock, i18n } = require('./helpers.cjs');

function setup(terminalFallback = true, isShell = false) {
  const time = clock();
  const status = load('agentStatus.cjs', {}, time);
  const relay = load('linkRelay.cjs', { './i18n.cjs': i18n }, time);
  const written = [];
  const completion = (id, reply) => { if (reply) relay.onStop(id, { last_assistant_message: reply }, { fallback: true }); };
  relay.init({ status: (id) => status.info(id)?.status, write: (id, text) => written.push([id, text]), arm: status.arm });
  status.init(relay.onStatus, () => {}, completion);
  status.register('source', 'activity', { isShell });
  status.register('target', 'hooks');
  relay.setLinks({ boards: [{ edges: [{
    id: 'link', source: 'source', target: 'target',
    data: { mode: 'relay', enabled: true, maxTurns: 2, review: true, prompt: 'Read: {response}', terminalFallback },
  }] }] });
  return { time, status, relay, written };
}

test('the shell prompt finishes a turn without forwarding the command echo or terminal control characters', () => {
  const { time, status, relay, written } = setup(true, true);
  status.onOutput('source', 'PowerShell\r\nPS F:\\repo> ');
  status.onInput('source', '\r');
  status.onOutput('source', 'PS F:\\repo> echo done\r\n\x1b[32m$& done\x1b[0m');
  time.tick(3000);
  assert.equal(status.info('source').status, 'working');
  assert.deepEqual(relay.pendingList(), []);
  status.onOutput('source', 'PS F:\\re');
  status.onOutput('source', 'po> ');
  time.tick(150 + relay.READ_DELAY);
  const [draft] = relay.pendingList();
  assert.equal(draft.text, 'Read: $& done');
  assert.deepEqual(written, []);
  assert.deepEqual(relay.approve(draft.qid, draft.text), { ok: true });
  time.tick(250);
  assert.deepEqual(written, [['target', '\x1b[200~Read: $& done\x1b[201~'], ['target', '\r']]);
});

test('a CLI without a prompt relays once after two quiet seconds and ignores startup and later output', () => {
  const { time, status, relay } = setup();
  status.onOutput('source', 'Loading CLI…');
  time.tick(10000);
  status.onInput('source', '\r');
  status.onOutput('source', 'First line\r\n');
  time.tick(1999);
  assert.deepEqual(relay.pendingList(), []);
  status.onOutput('source', 'Last line');
  time.tick(2000 + relay.READ_DELAY);
  status.onOutput('source', 'background refresh');
  time.tick(3000);
  assert.deepEqual(relay.pendingList().map((row) => row.text), ['Read: First line\nLast line']);
});

test('legacy links do not auto-forward terminal output and native hooks still relay', () => {
  const { time, status, relay } = setup(false);
  status.onInput('source', '\r');
  status.onOutput('source', 'command output');
  time.tick(2000 + relay.READ_DELAY);
  assert.deepEqual(relay.pendingList(), []);
  relay.onStop('source', { last_assistant_message: 'native reply' });
  time.tick(relay.READ_DELAY);
  assert.equal(relay.pendingList()[0].text, 'Read: native reply');
});

test('an unrecognized new shell prompt (venv then cd) finishes after a long silence and becomes the known prompt', () => {
  const { time, status, relay } = setup(true, true);
  status.onOutput('source', 'PS F:\\repo> ');
  status.onInput('source', '\r');
  status.onOutput('source', 'PS F:\\repo> .venv\\Scripts\\activate\r\n(venv) PS F:\\repo> ');
  time.tick(150 + relay.READ_DELAY);
  assert.equal(status.info('source').status, 'done');
  status.onInput('source', '\r');
  status.onOutput('source', '(venv) PS F:\\repo> cd ..\\app\r\n(venv) PS F:\\app> ');
  time.tick(9999);
  assert.equal(status.info('source').status, 'working');
  time.tick(1 + relay.READ_DELAY);
  assert.equal(status.info('source').status, 'done');
  status.onInput('source', '\r');
  status.onOutput('source', '(venv) PS F:\\app> python -V\r\nPython 3.12.0\r\n(venv) PS F:\\app> ');
  time.tick(150 + relay.READ_DELAY);
  assert.equal(status.info('source').status, 'done');
  assert.equal(relay.pendingList().at(-1).text, 'Read: Python 3.12.0');
});

test('a python REPL prompt ends the turn through the fallback delay', () => {
  const { time, status } = setup(true, true);
  status.onOutput('source', 'PS F:\\repo> ');
  status.onInput('source', '\r');
  status.onOutput('source', 'PS F:\\repo> python\r\nPython 3.12.0\r\n>>> ');
  time.tick(10000);
  assert.equal(status.info('source').status, 'done');
});

test('a long silent build after a finished line stays working until the known prompt returns', () => {
  const { time, status } = setup(true, true);
  status.onOutput('source', 'PS F:\\repo> ');
  status.onInput('source', '\r');
  status.onOutput('source', 'PS F:\\repo> npm run build\r\nBuilding...\r\n');
  time.tick(120000);
  assert.equal(status.info('source').status, 'working');
  status.onOutput('source', 'Done\r\nPS F:\\repo> ');
  time.tick(150);
  assert.equal(status.info('source').status, 'done');
});
