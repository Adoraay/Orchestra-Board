const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { randomUUID } = require('crypto');
const { t } = require('./i18n.cjs');

// Session cachée du chef d'orchestre (PLAN.md §3.25) : une conversation Claude Code par tableau, lancée en
// arrière-plan à chaque message de l'utilisateur (`claude -p`, jamais de boucle autonome), reprise avec
// --resume. Ses seuls outils sont ceux du chef d'orchestre (serveur MCP d'Orchestra) : aucun outil intégré,
// il ne lit ni n'écrit de fichier, il délègue. Aucune clé d'API : le CLI déjà connecté de l'utilisateur.
// Conversation gardée dans userData/conductor.json (messages et actions affichés dans la bulle).
const MAX_MESSAGE = 20000;
const MAX_HISTORY = 300;
const MAX_ENTRY = 8000;
const MAX_STDERR = 4000;
const SAVE_DELAY = 500;
const ID = /^[\w-]{1,100}$/;

const SYSTEM_PROMPT = `# You are the conductor of Orchestra

Orchestra is a desktop app with an infinite board. Each tile on it is a real terminal running an AI coding agent (Claude Code or Codex) or a plain shell. The user talks to you in a command bar on top of the board. You build and direct their orchestra of agents on the current board with the mcp__orchestra__ tools. To the user, it is the app that does it.

You never write code, read files or run commands yourself: you have no such tools. You delegate all the work to agents you create, or to agents already on the board.

## How to work
1. Always start with read_board: agents, links, sticky notes, statuses, recent exchanges, and conductor_agents (how many agents you may still create).
2. Split the request into tasks. When the user gives a number of agents, create exactly that many; otherwise use the fewest that make sense (often 1 to 3). Reuse existing agents when they fit.
3. For each new agent: a short unique name; a role saying who it is, its scope and what it must not do; a self-contained first prompt with the concrete task, constraints and what "done" means. Agents never see this conversation. The role is given silently at the start of the agent's session and shown on its tile; the prompt is pasted in its terminal to start the work: never repeat the role inside the prompt. Leave the prompt out when the agent should wait for instructions (for example a reviewer fed by a relay link).
4. Agents that edit code at the same time must each get their own worktree_branch (for example "maestro/api"), otherwise they overwrite each other's files. Read-only agents (reviewers, planners) can share the working folder.
5. Links: "delegate" when a lead agent should hand out work and collect the replies itself; "relay" with an instruction containing {response} to pass an agent's finished answer on automatically (for example coder → reviewer). Keep max_turns low (2 or 3) and add links only when they are needed. Place workers below their lead with near.
6. Follow the user's words exactly, including the number of agents and any shape ("pyramid", "in a row", "in a column", "grid"): create the tiles, link them, then call arrange with that layout (a pyramid of a lead and two workers: layout "pyramid", top = the lead).
7. Write the plan in a sticky note (create_sticky, named "Plan") with "- [ ]" task lines. Link the lead agent to it if it should keep it up to date.
8. End with a short summary for the user: who does what, and what to watch. Do not wait for the agents to finish: you act only when the user writes to you.

## Later messages
The user may ask you to add an agent, change a role, or help a stuck agent: read_board, read_agent_output for that agent, then send_to it a precise message, or adjust links and roles.

## Rules
- Answer in the user's language, briefly. Write roles and prompts in that language too.
- Never remove or change tiles you did not create unless the user asks.
- If a tool refuses (limit, folder, name), adapt or explain; never retry the same call in a loop.
- In preview mode (read_board says "mode": "preview"), your changes are proposals the user approves or rejects: build the whole plan in one go.
`;

let deps = {
  dir: () => '',
  settings: () => ({}),
  findClaude: async () => ({ ok: false }),
  toolUrl: () => '',
  mcpServerPath: () => '',
  tools: [],
  openSession: () => {},
  closeSession: () => {},
  boardExists: () => false,
  emit: () => {},
};
let conversations = null; // boardId -> { sessionId, started, history }
const runs = new Map(); // boardId -> { child, live, stopped, result, stderr, tools }
let saveTimer = null;

function init(d) {
  deps = { ...deps, ...d };
}

const file = () => path.join(deps.dir(), 'conductor.json');
const callerOf = (boardId) => `conductor-${boardId}`;
const clip = (text, max = MAX_ENTRY) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

function load() {
  if (conversations) return conversations;
  conversations = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    for (const [boardId, entry] of Object.entries(data?.boards ?? {})) {
      if (!ID.test(boardId) || typeof entry?.sessionId !== 'string' || !Array.isArray(entry.history)) continue;
      conversations.set(boardId, { sessionId: entry.sessionId, started: entry.started === true, history: entry.history.slice(-MAX_HISTORY) });
    }
  } catch {}
  return conversations;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(deps.dir(), { recursive: true });
      const data = { version: 1, boards: Object.fromEntries(load()) };
      fs.writeFileSync(file() + '.tmp', JSON.stringify(data));
      fs.renameSync(file() + '.tmp', file());
    } catch (error) {
      console.error('Conductor save failed:', error.message);
    }
  }, SAVE_DELAY);
}

function conversation(boardId) {
  const all = load();
  if (!all.has(boardId)) all.set(boardId, { sessionId: randomUUID(), started: false, history: [] });
  return all.get(boardId);
}

function snapshot(boardId) {
  const run = runs.get(boardId);
  return { history: load().get(boardId)?.history ?? [], running: Boolean(run), live: run?.live ?? '' };
}
const publish = (boardId) => deps.emit(boardId, { type: 'snapshot', ...snapshot(boardId) });

function addEntry(boardId, entry) {
  const conv = conversation(boardId);
  conv.history = [...conv.history, { ...entry, at: Date.now() }].slice(-MAX_HISTORY);
  save();
  return conv.history.length - 1;
}

// Arguments d'un outil gardés pour l'affichage (noms et ids seulement, textes courts).
function toolInput(input = {}) {
  const keep = {};
  for (const key of ['type', 'name', 'from', 'to', 'agent', 'sticky', 'link', 'mode', 'near', 'worktree_branch', 'layout', 'top']) {
    if (typeof input[key] === 'string') keep[key] = clip(input[key], 120);
  }
  return keep;
}

// Une ligne du flux stream-json de Claude Code.
function onLine(boardId, run, line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const conv = conversation(boardId);
  switch (message.type) {
    case 'system':
      if (message.subtype !== 'init') return;
      if (message.session_id === conv.sessionId && !conv.started) { conv.started = true; save(); }
      {
        const server = message.mcp_servers?.find((s) => s.name === 'orchestra');
        if (server && server.status !== 'connected') {
          addEntry(boardId, { kind: 'error', text: t('conductorSession.mcpFailed', { status: server.status }) });
          publish(boardId);
        }
      }
      return;
    case 'stream_event': {
      const event = message.event;
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
        run.live += event.delta.text;
        deps.emit(boardId, { type: 'delta', text: event.delta.text });
      }
      return;
    }
    case 'assistant': {
      for (const block of message.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) addEntry(boardId, { kind: 'assistant', text: clip(block.text.trim()) });
        if (block.type === 'tool_use') {
          const tool = String(block.name ?? '').replace(/^mcp__orchestra__/, '');
          run.tools.set(block.id, addEntry(boardId, { kind: 'tool', tool, input: toolInput(block.input) }));
        }
      }
      run.live = '';
      publish(boardId);
      return;
    }
    case 'user': {
      const content = message.message?.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (block.type !== 'tool_result' || !run.tools.has(block.tool_use_id)) continue;
        const index = run.tools.get(block.tool_use_id);
        const text = Array.isArray(block.content) ? block.content.map((c) => c.text ?? '').join('\n') : String(block.content ?? '');
        const entry = conv.history[index];
        if (entry) conv.history[index] = { ...entry, done: true, ...(block.is_error && { error: clip(text, 500) }) };
      }
      save();
      publish(boardId);
      return;
    }
    case 'result':
      run.result = message;
      if (message.is_error || message.subtype !== 'success') {
        addEntry(boardId, { kind: 'error', text: clip(message.result || message.errors?.join('\n') || message.subtype) });
      }
      return;
  }
}

// Le programme claude trouvé dans le PATH ; un script .cmd (installation npm) passe par cmd.
function launch(program, args, options) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(program)) {
    const line = [program, ...args].map((arg) => `"${arg}"`).join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...options, windowsVerbatimArguments: true });
  }
  return spawn(program, args, options);
}

function writeFiles(boardId) {
  const dir = path.join(deps.dir(), 'conductor');
  fs.mkdirSync(dir, { recursive: true });
  const mcp = path.join(dir, `${boardId}.mcp.json`);
  const server = {
    type: 'stdio',
    command: process.execPath,
    args: [deps.mcpServerPath()],
    env: { ELECTRON_RUN_AS_NODE: '1', ORCHESTRA_URL: deps.toolUrl(callerOf(boardId)), ORCHESTRA_TOOLSET: 'conductor' },
  };
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { orchestra: server } }, null, 2));
  const prompt = path.join(dir, 'system-prompt.md');
  fs.writeFileSync(prompt, SYSTEM_PROMPT);
  return { mcp, prompt };
}

// Message de l'utilisateur : une exécution de `claude -p`, dans le dossier de travail, sur le tableau donné.
async function send(boardId, message, folder) {
  if (typeof boardId !== 'string' || !ID.test(boardId) || !deps.boardExists(boardId)) return { error: t('conductorSession.noBoard') };
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) return { error: t('conductorSession.badMessage', { max: MAX_MESSAGE }) };
  try {
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || !fs.statSync(folder).isDirectory()) throw new Error();
  } catch { return { error: t('conductorSession.badFolder') }; }
  if (runs.has(boardId)) return { error: t('conductorSession.busy') };

  const claude = await deps.findClaude();
  if (!claude.ok) return { error: t('conductorSession.notFound') };
  if (runs.has(boardId)) return { error: t('conductorSession.busy') };

  const conv = conversation(boardId);
  const settings = deps.settings();
  deps.openSession(callerOf(boardId), { boardId, folder, preview: false });
  const { mcp, prompt } = writeFiles(boardId);
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--mcp-config', mcp, '--strict-mcp-config',
    '--tools', '',
    '--allowedTools', deps.tools.map((tool) => `mcp__orchestra__${tool}`).join(','),
    '--append-system-prompt-file', prompt,
    ...(conv.started ? ['--resume', conv.sessionId] : ['--session-id', conv.sessionId]),
    ...(settings.model ? ['--model', settings.model] : []),
  ];

  addEntry(boardId, { kind: 'user', text: clip(message.trim(), MAX_MESSAGE) });
  const run = { child: null, live: '', stopped: false, result: null, stderr: '', tools: new Map() };
  runs.set(boardId, run);
  publish(boardId);

  let child;
  try {
    child = launch(claude.message, args, { cwd: folder, windowsHide: true, env: { ...process.env } });
  } catch (error) {
    runs.delete(boardId);
    addEntry(boardId, { kind: 'error', text: t('conductorSession.exited', { code: '?', detail: error.message }) });
    publish(boardId);
    return { ok: true };
  }
  run.child = child;
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(boardId, run, line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { run.stderr = (run.stderr + chunk).slice(-MAX_STDERR); });
  child.on('error', (error) => { run.stderr = (run.stderr + error.message).slice(-MAX_STDERR); });
  child.on('close', (code) => {
    if (buffer.trim()) onLine(boardId, run, buffer.trim());
    runs.delete(boardId);
    if (run.stopped) addEntry(boardId, { kind: 'info', text: t('conductorSession.stopped') });
    else if (!run.result) addEntry(boardId, { kind: 'error', text: t('conductorSession.exited', { code: code ?? '?', detail: clip(run.stderr.trim(), 1000) }) });
    publish(boardId);
  });
  child.stdin.on('error', () => {});
  child.stdin.end(message.trim());
  return { ok: true };
}

// Arrêt demandé par l'utilisateur : le processus et ses enfants (serveur MCP compris).
function stop(boardId) {
  const run = runs.get(boardId);
  if (!run?.child) return;
  run.stopped = true;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(run.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else run.child.kill('SIGTERM');
}

// Nouvelle conversation : nouvelle session Claude, historique vidé.
function reset(boardId) {
  if (typeof boardId !== 'string' || !ID.test(boardId)) return { error: t('conductorSession.noBoard') };
  if (runs.has(boardId)) return { error: t('conductorSession.busy') };
  load().set(boardId, { sessionId: randomUUID(), started: false, history: [] });
  deps.closeSession(callerOf(boardId));
  save();
  publish(boardId);
  return { ok: true };
}

// Tableaux supprimés : leur conversation disparaît.
function prune(boardIds) {
  const keep = new Set(boardIds);
  let changed = false;
  for (const boardId of [...load().keys()]) {
    if (keep.has(boardId) || runs.has(boardId)) continue;
    load().delete(boardId);
    deps.closeSession(callerOf(boardId));
    changed = true;
  }
  if (changed) save();
}

function stopAll() {
  for (const boardId of runs.keys()) stop(boardId);
}

function get(boardId) {
  return typeof boardId === 'string' && ID.test(boardId) ? snapshot(boardId) : { history: [], running: false, live: '' };
}

module.exports = { init, send, stop, reset, prune, stopAll, get, callerOf, onLine, SYSTEM_PROMPT };
