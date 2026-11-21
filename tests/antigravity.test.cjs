const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load, i18n } = require('./helpers.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-agy-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adapter = load('antigravityHooks.cjs', {
    electron: { app: { getPath: () => root } },
    os: { homedir: () => root, tmpdir: () => root },
    './claudeHooks.cjs': { mcpServerPath: () => '/orchestra/mcpServer.cjs' },
    './hookServer.cjs': {
      hookUrl: (id) => `http://127.0.0.1:3210/hook/${id}?t=token`,
      toolUrl: (id) => `http://127.0.0.1:3210/tool/${id}?t=token`,
    },
  });
  return { root, adapter };
}

test('AGY cards get distinct workspace hooks and the selected native MCP servers', (t) => {
  const { adapter } = fixture(t);
  const full = adapter.prepare('lead', {
    linear: { type: 'http', url: 'https://example.com/mcp' },
    browser: { type: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp'] },
  }, 'powershell');
  const basic = adapter.prepare('backend', {}, 'cmd');
  assert.equal(full.args, ' --add-dir "$env:ORCHESTRA_AGY_WORKSPACE"');
  assert.equal(basic.args, ' --add-dir "%ORCHESTRA_AGY_WORKSPACE%"');
  const a = full.env.ORCHESTRA_AGY_WORKSPACE;
  const b = basic.env.ORCHESTRA_AGY_WORKSPACE;
  assert.notEqual(a, b);
  const readConfig = (workspace, filename) => JSON.parse(fs.readFileSync(path.join(workspace, '.agents', filename), 'utf8'));
  const { mcpServers } = readConfig(a, 'mcp_config.json');
  assert.deepEqual(mcpServers.linear, { serverUrl: 'https://example.com/mcp' });
  assert.deepEqual(mcpServers.browser, { command: 'npx', args: ['-y', 'chrome-devtools-mcp'] });
  assert.equal(mcpServers.orchestra.env.ORCHESTRA_URL, 'http://127.0.0.1:3210/tool/lead?t=token');
  assert.deepEqual(Object.keys(readConfig(b, 'mcp_config.json').mcpServers), ['orchestra']);
  const { orchestra } = readConfig(a, 'hooks.json');
  assert.deepEqual(Object.keys(orchestra), ['SessionStart', 'PreInvocation', 'Stop']);
  assert.match(orchestra.Stop[0].command, /http:\/\/127\.0\.0\.1:3210\/hook\/lead\?t=token/);
  adapter.remove('lead');
  assert.equal(fs.existsSync(a), false);
  assert.equal(fs.existsSync(b), true);
});

// agy lance ses commandes dans le premier de ses dossiers triés (casse comprise) : le dossier temporaire doit passer
// après celui de la case, sinon les commandes partent dans le dossier des hooks.
test('AGY hook workspace sorts after the card folder, so commands run in the card folder', { skip: process.platform !== 'win32' }, (t) => {
  const { root, adapter } = fixture(t);
  const listed = adapter.prepare('lead', {}, 'powershell').env.ORCHESTRA_AGY_WORKSPACE;
  assert.match(listed, /^[a-z]:\\/);
  assert.ok(fs.existsSync(path.join(listed, '.agents', 'hooks.json')));
  const folder = adapter.caseFolder(root[0].toLowerCase() + root.slice(1));
  assert.match(folder, /^[A-Z]:\\/);
  for (const project of [folder, 'D:\\work', 'Z:\\app', '\\\\server\\share\\app']) assert.equal([listed, project].sort()[0], project);
  assert.equal(adapter.caseFolder(undefined), undefined);
  adapter.remove('lead');
  assert.equal(fs.existsSync(listed), false);
});

test('AGY stop hooks relay the current turn only, after the agent is fully idle', (t) => {
  const { root, adapter } = fixture(t);
  const { lastReply } = load('linkRelay.cjs', { './i18n.cjs': i18n });
  const sessionId = '9c96be4b-797c-489e-b62a-b1ec1d779775';
  const transcript = path.join(root, '.gemini', 'antigravity-cli', 'brain', sessionId, '.system_generated', 'logs', 'transcript.jsonl');
  fs.mkdirSync(path.dirname(transcript), { recursive: true });
  const hook = { conversationId: sessionId, transcriptPath: transcript };
  assert.equal(adapter.normalize({ ...hook, hookEventName: 'PreInvocation' }).hook_event_name, 'UserPromptSubmit');
  assert.equal(adapter.normalize({ ...hook, hookEventName: 'Stop', fullyIdle: false }), null);
  const completion = adapter.normalize({ ...hook, hookEventName: 'Stop', fullyIdle: true });
  assert.equal(completion.session_id, sessionId);
  assert.equal(completion.transcript_path, transcript);
  assert.equal(adapter.normalize({ ...hook, hookEventName: 'Stop', transcriptPath: path.join(root, 'unrelated.jsonl') }).transcript_path, null);
  assert.equal(adapter.normalize({ ...hook, hookEventName: 'Stop', conversationId: 'not-a-uuid' }).session_id, null);
  const steps = [
    { type: 'USER_INPUT', content: 'Previous prompt' },
    { type: 'PLANNER_RESPONSE', content: 'Previous reply' },
    { type: 'USER_INPUT', content: 'Current prompt' },
  ];
  fs.writeFileSync(transcript, steps.map((step) => JSON.stringify(step)).join('\n') + '\n');
  assert.equal(lastReply(completion), '');
  fs.appendFileSync(transcript, JSON.stringify({ type: 'PLANNER_RESPONSE', content: 'Current reply' }));
  assert.equal(lastReply(completion), 'Current reply');
});
