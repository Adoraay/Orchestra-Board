const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./helpers.cjs');

// Demande d'autorisation d'Antigravity, sans hook : lue à l'écran. Fixture = vraie sortie d'agy 1.5.13
// (mode accept-edits) pendant « Remove-Item -Recurse -Force sub ».
const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'agy-permission.raw'), 'utf8');

function setup(kind = 'antigravity') {
  const status = load('agentStatus.cjs');
  const events = [];
  status.init((id, info) => events.push(info), () => {});
  status.register('agy', 'hooks', { name: 'Designer', kind });
  status.onHook('agy', { hook_event_name: 'SessionStart' });
  status.onHook('agy', { hook_event_name: 'UserPromptSubmit' });
  const feed = () => { for (let i = 0; i < raw.length; i += 173) status.onOutput('agy', raw.slice(i, i + 173)); };
  return { status, events, feed };
}

test('an Antigravity permission prompt on screen puts the tile in waiting with the command', () => {
  const { status, feed } = setup();
  assert.equal(status.info('agy').status, 'working');
  feed();
  const info = status.info('agy');
  assert.equal(info.status, 'waiting');
  assert.deepEqual(info.permission, { tool: 'Command', detail: 'Remove-Item -Recurse -Force sub', actionable: true });
});

test('answers: 1 accepts, Escape refuses (no Stop hook comes back), Escape typed in the terminal too', () => {
  const accept = setup();
  accept.feed();
  assert.equal(accept.status.answerPermission('agy', true), '1');
  assert.equal(accept.status.info('agy').status, 'working');

  const refuse = setup();
  refuse.feed();
  assert.equal(refuse.status.answerPermission('agy', false), '\x1b');
  assert.equal(refuse.status.info('agy').status, 'idle');

  const typed = setup();
  typed.feed();
  typed.status.onInput('agy', '\x1b');
  assert.equal(typed.status.info('agy').status, 'idle');
});

test('the screen is only read while Antigravity works, and only for Antigravity', () => {
  const idle = setup();
  idle.status.onHook('agy', { hook_event_name: 'Stop' });
  idle.feed();
  assert.equal(idle.status.info('agy').status, 'done');

  const claude = setup('claude');
  claude.feed();
  assert.equal(claude.status.info('agy').status, 'working', 'Claude reports permissions with its hook');
});
