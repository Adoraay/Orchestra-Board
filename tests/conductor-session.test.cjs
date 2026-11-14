const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load, i18n } = require('./helpers.cjs');

// Session cachée du chef d'orchestre (electron/conductorSession.cjs) avec un faux claude (tests/fake-claude.cjs)
// lancé par un script .cmd, comme une installation npm de Claude Code : aucun modèle sollicité.
function fakeClaude(dir) {
  const fake = path.join(__dirname, 'fake-claude.cjs');
  if (process.platform === 'win32') {
    const file = path.join(dir, 'claude.cmd');
    fs.writeFileSync(file, `@"${process.execPath}" "${fake}" %*\r\n`);
    return file;
  }
  const file = path.join(dir, 'claude');
  fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  return file;
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-session-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const folder = path.join(dir, 'project');
  fs.mkdirSync(folder);
  const argsLog = path.join(dir, 'args.log');
  process.env.FAKE_CLAUDE_LOG = argsLog;
  t.after(() => delete process.env.FAKE_CLAUDE_LOG);
  const program = fakeClaude(dir);
  const events = [];
  const sessions = [];
  const deps = {
    dir: () => dir,
    settings: () => ({}),
    findClaude: async () => ({ ok: true, message: program }),
    toolUrl: (id) => `http://127.0.0.1:9/tool/${id}?t=x`,
    mcpServerPath: () => path.join(dir, 'mcpServer.cjs'),
    tools: ['read_board', 'create_agent'],
    openSession: (id, options) => sessions.push({ id, ...options }),
    closeSession: (id) => sessions.push({ id, closed: true }),
    boardExists: (id) => id === 'main',
    emit: (boardId, event) => events.push({ boardId, ...event }),
  };
  const create = () => {
    const session = load('conductorSession.cjs', { './i18n.cjs': i18n });
    session.init(deps);
    return session;
  };
  const session = create();
  const idle = async () => {
    for (let i = 0; i < 200; i++) {
      if (!session.get('main').running) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('the conductor run did not end');
  };
  const calls = () => (fs.existsSync(argsLog) ? fs.readFileSync(argsLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { dir, folder, session, create, events, sessions, idle, calls };
}

test('a message runs claude -p with only the conductor tools, streams its text and keeps the session', async (t) => {
  const s = setup(t);
  assert.deepEqual(await s.session.send('main', 'Bonjour', s.folder), { ok: true });
  assert.equal(s.session.get('main').running, true);
  assert.match((await s.session.send('main', 'Again', s.folder)).error, /conductorSession.busy/, 'one run at a time per board');
  await s.idle();

  const [args] = s.calls();
  assert.deepEqual(args.slice(0, 5), ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']);
  assert.equal(args[args.indexOf('--tools') + 1], '', 'no built-in tool (no file access, no shell)');
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'mcp__orchestra__read_board,mcp__orchestra__create_agent');
  assert.ok(args.includes('--strict-mcp-config'));
  const sessionId = args[args.indexOf('--session-id') + 1];
  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  const mcp = JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8')).mcpServers.orchestra;
  assert.equal(mcp.env.ORCHESTRA_TOOLSET, 'conductor');
  assert.equal(mcp.env.ORCHESTRA_URL, 'http://127.0.0.1:9/tool/conductor-main?t=x');
  assert.match(fs.readFileSync(args[args.indexOf('--append-system-prompt-file') + 1], 'utf8'), /You are the conductor of Orchestra/);
  assert.deepEqual(s.sessions[0], { id: 'conductor-main', boardId: 'main', folder: s.folder, preview: false });

  const { history } = s.session.get('main');
  assert.deepEqual(history.map((e) => e.kind), ['user', 'assistant']);
  assert.equal(history[1].text, 'Fait : Bonjour');
  assert.equal(s.events.filter((e) => e.type === 'delta').map((e) => e.text).join(''), 'Je construis…');

  // Message suivant : même conversation, reprise par --resume.
  await s.session.send('main', 'Suite', s.folder);
  await s.idle();
  const second = s.calls()[1];
  assert.equal(second[second.indexOf('--resume') + 1], sessionId);
  assert.equal(second.includes('--session-id'), false);

  // Conversation gardée sur le disque, relue par une nouvelle instance (redémarrage de l'app).
  await new Promise((r) => setTimeout(r, 600));
  const reloaded = s.create();
  assert.equal(reloaded.get('main').history.length, 4);
  await reloaded.send('main', 'Après redémarrage', s.folder);
  for (let i = 0; i < 200 && reloaded.get('main').running; i++) await new Promise((r) => setTimeout(r, 25));
  const third = s.calls()[2];
  assert.equal(third[third.indexOf('--resume') + 1], sessionId);
});

test('errors, stop, reset and validation', async (t) => {
  const s = setup(t);
  assert.match((await s.session.send('other', 'x', s.folder)).error, /noBoard/);
  assert.match((await s.session.send('main', '   ', s.folder)).error, /badMessage/);
  assert.match((await s.session.send('main', 'x', path.join(s.dir, 'missing'))).error, /badFolder/);
  assert.match((await s.session.send('main', 'x', 'relative')).error, /badFolder/);

  await s.session.send('main', 'FAIL please', s.folder);
  await s.idle();
  const failed = s.session.get('main').history.at(-1);
  assert.equal(failed.kind, 'error');
  assert.match(failed.text, /conductorSession.exited 2 boom: not logged in/);

  await s.session.send('main', 'SLOW', s.folder);
  for (let i = 0; i < 100 && !s.calls().some((a) => a.includes('--resume') || a.length); i++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 300));
  assert.match(s.session.reset('main').error, /busy/, 'no reset while running');
  s.session.stop('main');
  await s.idle();
  assert.equal(s.session.get('main').history.at(-1).text.trim(), 'conductorSession.stopped');

  assert.deepEqual(s.session.reset('main'), { ok: true });
  assert.deepEqual(s.session.get('main').history, []);
  assert.ok(s.sessions.some((e) => e.id === 'conductor-main' && e.closed));
  await s.session.send('main', 'Nouvelle', s.folder);
  await s.idle();
  const ids = s.calls().map((a) => a[a.indexOf('--session-id') + 1] ?? a[a.indexOf('--resume') + 1]);
  assert.notEqual(ids.at(-1), ids[0], 'a new conversation uses a new session');

  s.session.prune(['main']);
  assert.equal(s.session.get('main').history.length, 2);
  s.session.prune([]);
  assert.deepEqual(s.session.get('main').history, []);
});

test('tool calls are shown with their names and marked done or failed', async () => {
  const session = load('conductorSession.cjs', { './i18n.cjs': i18n });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-session-'));
  session.init({ dir: () => dir, emit: () => {} });
  const run = { live: 'partial', tools: new Map() };
  session.onLine('b', run, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'mcp__orchestra__create_agent', input: { type: 'claude', name: 'API', prompt: 'long secret prompt' } }] } }));
  session.onLine('b', run, JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'text', text: 'limit reached' }], is_error: true }] } }));
  session.onLine('b', run, 'not json');
  const [entry] = session.get('b').history;
  assert.equal(entry.tool, 'create_agent');
  assert.deepEqual(entry.input, { type: 'claude', name: 'API' }, 'prompts are not copied into the history');
  assert.equal(entry.error, 'limit reached');
  assert.equal(run.live, '');
  fs.rmSync(dir, { recursive: true, force: true });
});
