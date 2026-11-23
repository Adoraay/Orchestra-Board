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

// Script au format npm (comme codex.cmd) : Orchestra lance directement le .js avec Node, sans passer par cmd.
function codexShim(dir) {
  const file = path.join(dir, 'codex.cmd');
  if (!fs.existsSync(file)) {
    fs.copyFileSync(path.join(__dirname, 'fake-codex.cjs'), path.join(dir, 'fake-codex.cjs'));
    fs.writeFileSync(file, '@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\fake-codex.cjs" %*\r\n');
  }
  return file;
}

// Faux agy derrière un script au format npm : lancé directement avec Node, arguments intacts (comme le vrai agy.exe).
function agyShim(dir) {
  const file = path.join(dir, 'agy.cmd');
  if (!fs.existsSync(file)) {
    fs.copyFileSync(path.join(__dirname, 'fake-agy.cjs'), path.join(dir, 'fake-agy.cjs'));
    fs.writeFileSync(file, '@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\fake-agy.cjs" %*\r\n');
  }
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
    findCommand: async (engine) => ({ ok: true, message: engine === 'codex' ? codexShim(dir) : engine === 'antigravity' ? agyShim(dir) : program }),
    toolUrl: (id) => `http://127.0.0.1:9/tool/${id}?t=x`,
    mcpServerPath: () => path.join(dir, 'mcpServer.cjs'),
    tools: ['read_board', 'create_agent'],
    // pending.next : plan que le chef d'orchestre « propose » pendant l'exécution qui s'ouvre.
    openSession: (id, options) => {
      sessions.push({ id, ...options });
      if (pending.next) { pending.list = pending.next; pending.next = null; }
    },
    closeSession: (id) => sessions.push({ id, closed: true }),
    boardExists: (id) => id === 'main',
    emit: (boardId, event) => events.push({ boardId, ...event }),
    pendingOf: () => pending.list,
    // pending.blocked : validation refusée en entier (rien appliqué, le plan reste) ; commits : exécution en cours ou non.
    commit: async () => {
      pending.commits.push(session.get('main').running);
      if (pending.blocked) return { applied: false, results: [{ summary: pending.list[0].summary, text: pending.blocked, isError: true }] };
      const results = pending.list.map((p) => ({ summary: p.summary, text: p.fail ? 'refused' : 'ok', isError: Boolean(p.fail) }));
      pending.list = [];
      return { applied: true, results };
    },
    discard: () => { pending.list = []; },
  };
  const pending = { list: [], next: null, blocked: null, commits: [] };
  const settings = {};
  deps.settings = () => settings;
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
  return { dir, folder, session, create, events, sessions, idle, calls, pending, settings };
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
  assert.deepEqual(s.sessions[0], { id: 'conductor-main', boardId: 'main', folder: s.folder, preview: true, auto: false }, 'preview by default');

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

test('preview: approve, cancel and correction are applied and told to the conductor at the next message', async (t) => {
  const s = setup(t);
  const last = () => s.session.get('main').history.at(-1);
  const reply = () => s.session.get('main').history.filter((e) => e.kind === 'assistant').at(-1).text;
  assert.match((await s.session.approve('main')).error, /nothingPending/);
  assert.match(s.session.cancel('main').error, /nothingPending/);

  // Valider : résultats dans la conversation, échecs détaillés, et note pour le chef d'orchestre.
  s.pending.list = [{ summary: 'Agent A' }, { summary: 'Link A → B', fail: true }];
  assert.deepEqual(s.session.get('main').pending.length, 2);
  assert.deepEqual(await s.session.approve('main'), { ok: true });
  const history = s.session.get('main').history;
  assert.match(history.at(-2).text, /conductorSession.applied 1 2/);
  assert.match(history.at(-1).text, /Link A → B : refused/);
  await s.session.send('main', 'Next', s.folder);
  await s.idle();
  assert.match(reply(), /^Fait : \[Orchestra\] The user approved your plan. Applied, except: Link A → B \(refused\)\.\n\nNext$/);

  // Annuler.
  s.pending.list = [{ summary: 'Agent C' }];
  assert.deepEqual(s.session.cancel('main'), { ok: true });
  assert.match(last().text, /conductorSession.cancelled/);
  assert.deepEqual(s.pending.list, []);
  await s.session.send('main', 'Other', s.folder);
  await s.idle();
  assert.match(reply(), /cancelled your proposed plan: nothing was applied\.\n\nOther$/);

  // Un message pendant l'aperçu = une correction : plan effacé, nouveau plan demandé.
  s.pending.list = [{ summary: 'Agent D' }];
  await s.session.send('main', 'Use Codex instead', s.folder);
  assert.deepEqual(s.pending.list, []);
  await s.idle();
  assert.match(reply(), /rejected your proposed plan .*\n\nUse Codex instead$/);
  // La note ne sert qu'une fois.
  await s.session.send('main', 'Plain', s.folder);
  await s.idle();
  assert.equal(reply(), 'Fait : Plain');

  // Valider pendant une exécution : refusé.
  s.pending.list = [{ summary: 'E' }];
  await s.session.send('main', 'SLOW', s.folder);
  await new Promise((r) => setTimeout(r, 300));
  assert.match((await s.session.approve('main')).error, /busy/);
  s.session.stop('main');
  await s.idle();
});

test('Codex engine: read-only exec with the conductor tools, instructions, JSON events and resume', { skip: process.platform !== 'win32' }, async (t) => {
  const s = setup(t);
  await s.session.send('main', 'Bonjour', s.folder); // une conversation Claude d'abord
  await s.idle();
  s.settings.engine = 'codex';
  s.settings.model = 'gpt-test';
  await s.session.send('main', 'Salut', s.folder);
  await s.idle();
  const args = s.calls().at(-1);
  assert.equal(args[0], 'exec');
  assert.equal(args[1], '--json', 'a new Codex session, not a resume of the Claude one');
  const config = (key) => args.filter((a, i) => args[i - 1] === '-c').find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);
  assert.equal(config('sandbox_mode'), '"read-only"');
  assert.equal(config('approval_policy'), '"never"');
  assert.match(config('mcp_servers.orchestra.env'), /ORCHESTRA_TOOLSET = "conductor", ORCHESTRA_URL = "http:\/\/127\.0\.0\.1:9\/tool\/conductor-main\?t=x"/);
  assert.equal(config('mcp_servers.orchestra.default_tools_approval_mode'), '"approve"');
  // Consignes passées entières, retours à la ligne et guillemets compris (aucun passage par cmd).
  const instructions = JSON.parse(config('developer_instructions'));
  assert.ok(instructions.startsWith('# You are the conductor of Orchestra'));
  assert.match(instructions, /never use them/);
  for (const feature of ['shell_tool', 'unified_exec', 'multi_agent', 'plugins']) assert.ok(args.some((a, i) => a === feature && args[i - 1] === '--disable'), feature);
  assert.equal(args.includes('code_mode_host'), false, 'its MCP tools go through code mode');
  assert.equal(args[args.indexOf('-m') + 1], 'gpt-test');
  assert.equal(args.at(-1), '-');
  const history = s.session.get('main').history;
  assert.match(history.find((e) => e.kind === 'info').text, /conductorSession.engineChanged conductorSession.engine.codex/);
  assert.equal(history.at(-1).text, 'Codex : Salut');

  // Message suivant : exec resume <thread>.
  await s.session.send('main', 'Encore', s.folder);
  await s.idle();
  const second = s.calls().at(-1);
  assert.deepEqual(second.slice(0, 3), ['exec', 'resume', '--json']);
  const thread = second.at(-2);
  assert.match(thread, /^[0-9a-f-]{36}$/);
  await s.session.send('main', 'Toujours', s.folder);
  await s.idle();
  assert.equal(s.calls().at(-1).at(-2), thread, 'same Codex thread');

  // Tour échoué : erreur affichée.
  await s.session.send('main', 'FAIL', s.folder);
  await s.idle();
  assert.match(s.session.get('main').history.at(-1).text, /not logged in to Codex/);
});

test('Codex events become tool lines and replies', async () => {
  const session = load('conductorSession.cjs', { './i18n.cjs': i18n });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-session-'));
  session.init({ dir: () => dir, emit: () => {}, settings: () => ({ engine: 'codex' }) });
  const run = { live: '', tools: new Map() };
  const item = { id: 'i1', type: 'mcp_tool_call', server: 'orchestra', tool: 'create_agent', arguments: { type: 'codex', name: 'API', prompt: 'secret' }, status: 'in_progress' };
  session.codexLine('b', run, JSON.stringify({ type: 'thread.started', thread_id: 'th-1' }));
  session.codexLine('b', run, JSON.stringify({ type: 'item.started', item }));
  session.codexLine('b', run, JSON.stringify({ type: 'item.completed', item: { ...item, status: 'failed', result: { content: [{ type: 'text', text: 'limit reached' }] } } }));
  session.codexLine('b', run, JSON.stringify({ type: 'item.completed', item: { id: 'i2', type: 'command_execution', command: 'ls', status: 'completed' } }));
  session.codexLine('b', run, JSON.stringify({ type: 'item.completed', item: { id: 'i3', type: 'reasoning', text: 'hidden' } }));
  session.codexLine('b', run, JSON.stringify({ type: 'item.completed', item: { id: 'i4', type: 'agent_message', text: 'Done **now**' } }));
  const history = session.get('b').history;
  assert.deepEqual(history.map((e) => e.kind), ['tool', 'tool', 'assistant']);
  assert.deepEqual(history[0].input, { type: 'codex', name: 'API' });
  assert.equal(history[0].error, 'limit reached');
  assert.equal(history[1].tool, 'command_execution', 'other Codex tools stay visible');
  assert.equal(history[2].text, 'Done **now**');
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Codex engine: the user's own MCP servers are turned off (they run outside Codex's sandbox)", async (t) => {
  const s = setup(t);
  const home = path.join(s.dir, 'codex-home');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'config.toml'), [
    'model = "x"',
    '[mcp_servers.node_repl]', 'command = "node"', '[mcp_servers.node_repl.env]', 'A = "1"',
    '[mcp_servers."my server"]', 'command = "x"',
    '[mcp_servers.orchestra]', 'command = "old"',
    '[plugins."browser@openai-bundled"]', 'enabled = true',
  ].join('\n'));
  fs.mkdirSync(path.join(s.folder, '.codex'));
  fs.writeFileSync(path.join(s.folder, '.codex', 'config.toml'), '[mcp_servers.project_db]\ncommand = "db"\n');
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  t.after(() => { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; });

  assert.deepEqual(s.session.userMcpServers(s.folder).sort(), ['my server', 'node_repl', 'project_db']);
  const args = s.session.codexArgs({ started: false }, 'main', {}, s.folder);
  const off = args.filter((a, i) => args[i - 1] === '-c' && a.endsWith('.enabled=false'));
  assert.deepEqual(off.sort(), ['mcp_servers."my server".enabled=false', 'mcp_servers.node_repl.enabled=false', 'mcp_servers.project_db.enabled=false']);
  assert.ok(args.includes('sandbox_mode="read-only"') && args.includes('approval_policy="never"'));
});

test('a board created by the conductor shares the conversation of the board it was asked from', async (t) => {
  const s = setup(t);
  const boards = new Set(['main']);
  s.session.init({ boardExists: (id) => boards.has(id) });
  await s.session.send('main', 'Bonjour', s.folder);
  await s.idle();
  boards.add('board-new');
  s.session.linkBoard('conductor-main', 'board-new');
  assert.deepEqual(s.session.get('board-new').history, s.session.get('main').history);
  assert.ok(s.events.some((e) => e.boardId === 'board-new' && e.type === 'snapshot'));

  // Écrire depuis le nouveau tableau : même conversation (même session), mais c'est lui que le chef d'orchestre vise.
  await s.session.send('board-new', 'Ici', s.folder);
  for (let i = 0; i < 200 && s.session.get('main').running; i++) await new Promise((r) => setTimeout(r, 25));
  const args = s.calls().at(-1);
  const first = s.calls()[0];
  assert.equal(args[args.indexOf('--resume') + 1], first[first.indexOf('--session-id') + 1]);
  assert.deepEqual(s.sessions.at(-1), { id: 'conductor-main', boardId: 'board-new', folder: s.folder, preview: true, auto: false });
  assert.equal(s.session.get('main').history.at(-1).text, 'Fait : Ici');

  // Tableau d'origine supprimé : la conversation reste tant que le nouveau existe.
  s.session.prune(['board-new']);
  assert.equal(s.session.get('board-new').history.length, 4);
  s.session.prune([]);
  assert.deepEqual(s.session.get('board-new').history, []);
});

test('Antigravity engine: plan mode in a private folder, Orchestra tools only, instructions in the first message, resume', { skip: process.platform !== 'win32' }, async (t) => {
  const s = setup(t);
  s.settings.engine = 'antigravity';
  s.settings.model = 'gemini-4-neon-high';
  await s.session.send('main', 'Salut', s.folder);
  await s.idle();
  const args = s.calls().at(-1);
  assert.deepEqual(args.slice(0, 4), ['--output-format', 'stream-json', '--mode', 'plan']);
  const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(settings.permissions, { allow: ['mcp(orchestra/*)'], deny: ['command(*)', 'url(*)', 'agent(*)'] });
  assert.equal(settings.allowNonWorkspaceAccess, false);
  assert.equal(args[args.indexOf('--model') + 1], 'gemini-4-neon-high');
  const prompt = args.at(-1);
  assert.ok(prompt.startsWith('-p=# You are the conductor of Orchestra'), 'the instructions open the first message');
  assert.match(prompt, /## Antigravity/);
  assert.ok(prompt.endsWith('Salut'));
  // Dossier privé : seulement la config MCP d'Orchestra (pas le dossier du projet).
  const workspace = path.join(s.dir, 'conductor', 'agy-main');
  const mcp = JSON.parse(fs.readFileSync(path.join(workspace, '.agents', 'mcp_config.json'), 'utf8')).mcpServers.orchestra;
  assert.equal(mcp.env.ORCHESTRA_TOOLSET, 'conductor');
  assert.equal(mcp.env.ORCHESTRA_URL, 'http://127.0.0.1:9/tool/conductor-main?t=x');
  assert.deepEqual(fs.readdirSync(s.folder), []);
  const history = s.session.get('main').history;
  assert.equal(history.at(-1).text, 'Agy : Salut', 'text deltas become one reply');
  assert.equal(history.filter((e) => e.kind === 'tool').length, 0, 'reading the MCP tool schemas is not shown');

  // Suite : même conversation, sans répéter les consignes.
  await s.session.send('main', 'Encore', s.folder);
  await s.idle();
  const second = s.calls().at(-1);
  assert.ok(second.includes('--conversation'));
  assert.equal(second.at(-1), '-p=Encore');

  await s.session.send('main', 'FAIL', s.folder);
  await s.idle();
  assert.match(s.session.get('main').history.at(-1).text, /sign in to Antigravity/);

  // Nouvelle conversation : dossier privé retiré.
  assert.deepEqual(s.session.reset('main'), { ok: true });
  assert.equal(fs.existsSync(workspace), false);
});

test('Antigravity events become tool lines and replies', async () => {
  const session = load('conductorSession.cjs', { './i18n.cjs': i18n });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-session-'));
  session.init({ dir: () => dir, emit: () => {}, settings: () => ({ engine: 'antigravity' }) });
  const run = { live: '', tools: new Map(), answered: false };
  const line = (m) => session.agyLine('b', run, JSON.stringify(m));
  line({ event: 'init', conversation_id: 'c-1' });
  line({ event: 'step_update', step_update: { step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'orchestra', ToolName: 'create_agent', Arguments: { type: 'codex', name: 'API', prompt: 'secret' } } } } });
  line({ event: 'step_update', step_update: { step_index: 2, state: 'ERROR', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'orchestra', ToolName: 'create_agent' }, error: { message: 'limit reached' } } } });
  line({ event: 'step_update', step_update: { step_index: 3, state: 'DONE', step_type: 'tool', tool_name: 'write_file', tool_info: { parameters: { Path: 'C:/work/a.txt' } } } });
  line({ event: 'step_update', step_update: { step_index: 4, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Done ' } });
  line({ event: 'step_update', step_update: { step_index: 4, state: 'DONE', step_type: 'agent_response', text_delta: '**now**' } });
  line({ event: 'result', result: { status: 'SUCCESS', response: 'Done **now**' } });
  const history = session.get('b').history;
  assert.deepEqual(history.map((e) => e.kind), ['tool', 'tool', 'assistant'], 'the final result does not repeat the reply');
  assert.deepEqual(history[0].input, { type: 'codex', name: 'API' });
  assert.equal(history[0].error, 'limit reached');
  assert.equal(history[1].tool, 'write_file', 'other Antigravity tools stay visible');
  assert.equal(history[2].text, 'Done **now**');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('approval that cannot be applied changes nothing, keeps the plan and tells the conductor', async (t) => {
  const s = setup(t);
  s.pending.list = [{ summary: 'Agent A' }, { summary: 'Link A → B' }];
  s.pending.blocked = 'worktree failed';
  assert.deepEqual(await s.session.approve('main'), { ok: true });
  assert.match(s.session.get('main').history.at(-1).text, /conductorSession.notApplied Agent A \(worktree failed\)/);
  assert.equal(s.session.get('main').pending.length, 2, 'the plan still waits for approval');
  s.pending.blocked = null;
  s.pending.list = [];
  await s.session.send('main', 'Next', s.folder);
  await s.idle();
  assert.match(s.session.get('main').history.at(-1).text, /could not be applied, so nothing was changed: Agent A \(worktree failed\)/);
});

test('auto mode goes through the preview and applies the plan at the end of a successful run only', async (t) => {
  const s = setup(t);
  s.settings.autoApply = true;
  const kinds = () => s.session.get('main').history.map((e) => e.kind);

  // Exécution réussie : plan appliqué avant la fin de l'exécution (encart de construction), sans ligne « appliqué ».
  s.pending.next = [{ summary: 'Agent A' }, { summary: 'Agent B' }];
  await s.session.send('main', 'Auto', s.folder);
  await s.idle();
  assert.deepEqual(s.sessions.at(-1), { id: 'conductor-main', boardId: 'main', folder: s.folder, preview: true, auto: true });
  assert.deepEqual(s.pending.commits, [true], 'applied while the run is still shown as running');
  assert.deepEqual(s.pending.list, []);
  assert.deepEqual(kinds().slice(-2), ['user', 'assistant']);

  // Exécution qui plante : rien n'est appliqué, le plan reste à valider.
  s.pending.next = [{ summary: 'Agent C' }];
  await s.session.send('main', 'FAIL', s.folder);
  await s.idle();
  assert.deepEqual(s.pending.commits, [true]);
  assert.equal(s.session.get('main').pending.length, 1);
  assert.match(s.session.get('main').history.at(-1).text, /conductorSession.autoInterrupted/);
  assert.deepEqual(await s.session.approve('main'), { ok: true });
  assert.equal(s.pending.commits.length, 2, 'the user can still approve it');

  // Arrêtée par l'utilisateur : pareil.
  s.pending.next = [{ summary: 'Agent D' }];
  await s.session.send('main', 'SLOW', s.folder);
  await new Promise((r) => setTimeout(r, 300));
  s.session.stop('main');
  await s.idle();
  assert.equal(s.pending.commits.length, 2);
  assert.match(s.session.get('main').history.at(-1).text, /conductorSession.autoInterrupted/);

  // Échecs d'un plan appliqué en mode auto : affichés et notés pour le chef d'orchestre.
  s.pending.list = [];
  s.pending.next = [{ summary: 'Agent E' }, { summary: 'Send to Lead', fail: true }];
  await s.session.send('main', 'Auto again', s.folder);
  await s.idle();
  assert.match(s.session.get('main').history.at(-2).text, /conductorSession.applied 1 2/);
  assert.match(s.session.get('main').history.at(-1).text, /Send to Lead : refused/);
});
