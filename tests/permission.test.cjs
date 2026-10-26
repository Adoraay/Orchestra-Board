const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Module neuf à chaque test : agentStatus garde ses cases en mémoire.
function fresh() {
  const file = require.resolve(path.join(__dirname, '..', 'electron', 'agentStatus.cjs'));
  delete require.cache[file];
  const status = require(file);
  const events = [];
  status.init((id, info) => events.push({ id, ...info }), () => {});
  return { status, events };
}

const working = (status, id, kind = 'claude') => {
  status.register(id, 'hooks', { name: 'Dev', kind });
  status.onHook(id, { hook_event_name: 'UserPromptSubmit' });
};

test('a Claude permission request exposes the tool and only yes or no answers', () => {
  const { status } = fresh();
  working(status, 'a');
  status.onHook('a', { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'git init repo', description: 'Init' } });
  assert.equal(status.info('a').status, 'waiting');
  assert.deepEqual(status.info('a').permission, { tool: 'Bash', detail: 'git init repo', actionable: true });
  status.onHook('a', { hook_event_name: 'Notification', notification_type: 'permission_prompt' });
  assert.equal(status.info('a').permission.tool, 'Bash');
  assert.equal(status.answerPermission('a', true), '1');
  assert.equal(status.info('a').status, 'working');
  assert.equal(status.info('a').permission, null);
  assert.equal(status.answerPermission('a', true), null, 'no second keystroke once answered');
});

test('refusing sends Escape and returns to idle since Claude sends no Stop hook', () => {
  const { status } = fresh();
  working(status, 'a');
  status.onHook('a', { hook_event_name: 'PermissionRequest', tool_name: 'Write', tool_input: { file_path: 'C:\\repo\\a.txt' } });
  assert.equal(status.answerPermission('a', false), '\x1b');
  assert.equal(status.info('a').status, 'idle');
});

test('questions, plan exits and Codex requests are answered in the terminal only', () => {
  const { status } = fresh();
  working(status, 'a');
  status.onHook('a', { hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: {} });
  assert.equal(status.info('a').permission.actionable, false);
  assert.equal(status.answerPermission('a', true), null);
  working(status, 'b', 'codex');
  status.onHook('b', { hook_event_name: 'PermissionRequest', tool_name: 'shell' });
  assert.equal(status.info('b').status, 'waiting');
  assert.equal(status.info('b').permission, null);
  assert.equal(status.answerPermission('b', true), null);
});

test('Escape typed in the terminal during a request counts as a refusal; tool use resumes work', () => {
  const { status } = fresh();
  working(status, 'a');
  status.onHook('a', { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm i' } });
  status.onInput('a', '\x1b[I');
  assert.equal(status.info('a').status, 'waiting', 'focus reports from xterm are ignored');
  status.onInput('a', '\x1b');
  assert.equal(status.info('a').status, 'idle');
  working(status, 'b');
  status.onHook('b', { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm i' } });
  status.onHook('b', { hook_event_name: 'PostToolUse' });
  assert.equal(status.info('b').status, 'working');
  assert.equal(status.info('b').permission, null);
});

test('a permission request after the turn ended is ignored', () => {
  const { status } = fresh();
  working(status, 'a');
  status.onHook('a', { hook_event_name: 'Stop' });
  status.onHook('a', { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(status.info('a').status, 'done');
  assert.equal(status.info('a').permission, null);
});
