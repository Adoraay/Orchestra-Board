const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { randomUUID } = require('crypto');
const { t } = require('./i18n.cjs');

// Session cachée du chef d'orchestre (PLAN.md §3.25) : une conversation par tableau, lancée en arrière-plan à
// chaque message de l'utilisateur (jamais de boucle autonome) avec le CLI déjà connecté de l'utilisateur (aucune
// clé d'API). Deux moteurs (Paramètres › Général) :
// - Claude Code (`claude -p`, reprise par --resume) : ses seuls outils sont ceux du chef d'orchestre, aucun
//   outil intégré ; il ne lit ni n'écrit de fichier, il délègue ;
// - Codex (`codex exec`, reprise par `exec resume`) : ne peut pas être limité à ces outils. Il tourne en lecture
//   seule sans approbation possible (aucune modification), avec la plupart de ses fonctions désactivées, mais
//   garde la lecture de fichiers et les commandes de lecture : limite signalée dans les paramètres ;
// - Antigravity (`agy -p --mode plan`, reprise par --conversation) : dans un dossier privé qui contient seulement la
//   config MCP d'Orchestra ; ses permissions n'autorisent que les outils d'Orchestra et refusent commandes, web et
//   sous-agents. Ses outils de fichiers restent (le mode plan les retient) : limite signalée dans les paramètres.
// Conversation gardée dans userData/conductor.json (messages et actions affichés dans la bulle).
// Aperçu (par défaut, sauf Paramètres › mode auto) : ses changements restent en attente, montrés en fantômes sur
// la map ; Valider les applique, Annuler les efface, un nouveau message les remplace par un nouveau plan. Le
// chef d'orchestre l'apprend au message suivant (notes ajoutées devant le message de l'utilisateur).
const MAX_MESSAGE = 20000;
const MAX_HISTORY = 300;
const MAX_ENTRY = 8000;
const MAX_STDERR = 4000;
const SAVE_DELAY = 500;
const ID = /^[\w-]{1,100}$/;
const ENGINES = ['claude', 'codex', 'antigravity'];

const SYSTEM_PROMPT = `# You are the conductor of Orchestra

Orchestra is a desktop app with an infinite board. Each tile on it is a real terminal running an AI coding agent (Claude Code, Codex or Antigravity) or a plain shell. The user talks to you in a command bar on top of the board. You build and direct their orchestra of agents on the current board with the mcp__orchestra__ tools. To the user, it is the app that does it.

You never write code, read files or run commands yourself: you have no such tools. You delegate all the work to agents you create, or to agents already on the board.

## How to work
1. Always start with read_board: agents, links, sticky notes, statuses, recent exchanges, and conductor_agents (how many agents you may still create).
2. Split the request into tasks. When the user gives a number of agents, create exactly that many; otherwise use the fewest that make sense (often 1 to 3). Reuse existing agents when they fit.
3. For each new agent: a short unique name; a role saying who it is, its scope and what it must not do; a self-contained first prompt with the concrete task, constraints and what "done" means. Agents never see this conversation. The role is given silently at the start of the agent's session and shown on its tile; the prompt is pasted in its terminal to start the work: never repeat the role inside the prompt. Leave the prompt out when the agent should wait for instructions (for example a reviewer fed by a relay link).
4. Agents that edit code at the same time must each get their own worktree_branch (for example "maestro/api"), otherwise they overwrite each other's files. Read-only agents (reviewers, planners) can share the working folder.
5. Links: "delegate" when a lead agent should hand out work and collect the replies itself; "relay" with an instruction containing {response} to pass an agent's finished answer on automatically (for example coder → reviewer). Keep max_turns low (2 or 3) and add links only when they are needed. Place workers below their lead with near.
6. If the user asks for a new board (tab), call create_board first: your next actions go to that new board. Otherwise work on the current board.
7. Follow the user's words exactly, including the number of agents and any shape ("pyramid", "in a row", "in a column", "grid"): create the tiles, link them, then call arrange with that layout (a pyramid of a lead and two workers: layout "pyramid", top = the lead).
8. Write the plan in a sticky note (create_sticky, named "Plan") with "- [ ]" task lines. Link the lead agent to it if it should keep it up to date.
9. End with a short summary for the user: who does what, and what to watch. Do not wait for the agents to finish: you act only when the user writes to you.

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
  findCommand: async () => ({ ok: false }), // (moteur) -> { ok, message: chemin du programme }
  toolUrl: () => '',
  mcpServerPath: () => '',
  tools: [],
  openSession: () => {},
  closeSession: () => {},
  boardExists: () => false,
  emit: () => {},
  pendingOf: () => [],
  commit: async () => [],
  discard: () => {},
};
// Une conversation par tableau, sauf pour les tableaux que le chef d'orchestre a créés : ils partagent celle du
// tableau d'où on lui a écrit (aliases). Les clés internes (key) sont donc des tableaux « d'origine ».
let conversations = null; // key -> { engine, sessionId, started, history, notes }
let aliases = new Map(); // tableau créé par le chef d'orchestre -> key de sa conversation
const runs = new Map(); // key -> { child, live, stopped, result, stderr, tools }
let saveTimer = null;

function init(d) {
  deps = { ...deps, ...d };
}

const file = () => path.join(deps.dir(), 'conductor.json');
const callerOf = (key) => `conductor-${key}`;
const keyOf = (boardId) => { load(); return aliases.get(boardId) ?? boardId; };
const boardsOf = (key) => [key, ...[...aliases].filter(([, k]) => k === key).map(([boardId]) => boardId)];
const emitAll = (key, event) => { for (const boardId of boardsOf(key)) deps.emit(boardId, event); };
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
      if (!ID.test(boardId) || !Array.isArray(entry?.history)) continue;
      const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : null;
      const engine = ENGINES.includes(entry.engine) ? entry.engine : 'claude';
      const notes = Array.isArray(entry.notes) ? entry.notes.filter((n) => typeof n === 'string').slice(-10) : [];
      conversations.set(boardId, { engine, sessionId, started: entry.started === true && Boolean(sessionId), history: entry.history.slice(-MAX_HISTORY), notes });
    }
    for (const [boardId, key] of Object.entries(data?.aliases ?? {})) if (ID.test(boardId) && ID.test(key)) aliases.set(boardId, key);
  } catch {}
  return conversations;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(deps.dir(), { recursive: true });
      const data = { version: 1, boards: Object.fromEntries(load()), aliases: Object.fromEntries(aliases) };
      fs.writeFileSync(file() + '.tmp', JSON.stringify(data));
      fs.renameSync(file() + '.tmp', file());
    } catch (error) {
      console.error('Conductor save failed:', error.message);
    }
  }, SAVE_DELAY);
}

// Nouvelle session pour un moteur : Claude reçoit son identifiant d'avance, Codex donne le sien à son démarrage.
const freshSession = (engine) => ({ engine, sessionId: engine === 'claude' ? randomUUID() : null, started: false });
const engineOf = (settings) => (ENGINES.includes(settings.engine) ? settings.engine : 'claude');

function conversation(boardId) {
  const all = load();
  if (!all.has(boardId)) all.set(boardId, { ...freshSession(engineOf(deps.settings())), history: [], notes: [] });
  return all.get(boardId);
}

function snapshot(boardId) {
  const run = runs.get(boardId);
  return { history: load().get(boardId)?.history ?? [], running: Boolean(run), live: run?.live ?? '', pending: deps.pendingOf(callerOf(boardId)) };
}
const publish = (key) => emitAll(key, { type: 'snapshot', ...snapshot(key) });

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
function claudeLine(boardId, run, line) {
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
        emitAll(boardId, { type: 'delta', text: event.delta.text });
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

// Une ligne du flux stream-json d'Antigravity : init (conversation), step_update (texte et outils), result.
// Ses lectures des schémas d'outils MCP (~/.gemini/…/mcp/) ne sont pas montrées.
const AGY_SCHEMA = /[\\/]\.gemini[\\/]antigravity-cli[\\/]mcp[\\/]/i;
function agyLine(key, run, line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const conv = conversation(key);
  if (message.event === 'init') {
    if (!conv.started && typeof message.conversation_id === 'string') {
      conv.sessionId = message.conversation_id;
      conv.started = true;
      save();
    }
    return;
  }
  if (message.event === 'step_update') {
    const step = message.step_update ?? {};
    if (step.step_type === 'agent_response') {
      if (typeof step.text_delta === 'string' && step.text_delta) {
        run.live += step.text_delta;
        emitAll(key, { type: 'delta', text: step.text_delta });
      }
      if (step.state === 'DONE') {
        if (run.live.trim()) { addEntry(key, { kind: 'assistant', text: clip(run.live.trim()) }); run.answered = true; }
        run.live = '';
        publish(key);
      }
      return;
    }
    if (step.step_type !== 'tool') return;
    const info = step.tool_info ?? {};
    const params = info.parameters ?? {};
    const mcp = step.tool_name === 'call_mcp_tool';
    if (!mcp && Object.values(params).some((value) => typeof value === 'string' && AGY_SCHEMA.test(value))) return;
    const tool = mcp ? (params.ServerName === 'orchestra' ? params.ToolName : `${params.ServerName}.${params.ToolName}`) : step.tool_name;
    const id = `agy-${step.step_index}`;
    addTool(key, run, id, String(tool ?? ''), mcp && params.Arguments && typeof params.Arguments === 'object' ? params.Arguments : {});
    if (step.state === 'DONE' || step.state === 'ERROR') {
      const index = run.tools.get(id);
      const entry = conv.history[index];
      if (entry) conv.history[index] = { ...entry, done: true, ...(step.state === 'ERROR' && { error: clip(info.error?.message ?? info.output ?? '', 500) }) };
      save();
    }
    publish(key);
    return;
  }
  if (message.event === 'result') {
    const outcome = message.result ?? {};
    run.result = outcome;
    if (outcome.status !== 'SUCCESS') addEntry(key, { kind: 'error', text: clip(outcome.error?.message ?? outcome.response ?? outcome.status ?? 'error') });
    else if (!run.answered && outcome.response?.trim()) addEntry(key, { kind: 'assistant', text: clip(outcome.response.trim()) });
    publish(key);
  }
}

function addTool(boardId, run, id, tool, input) {
  if (!run.tools.has(id)) run.tools.set(id, addEntry(boardId, { kind: 'tool', tool, input: toolInput(input) }));
}

// Une ligne du flux JSON de `codex exec --json` (thread, tours, éléments : message, appel d'outil…).
function codexLine(boardId, run, line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const conv = conversation(boardId);
  const item = message.item;
  const toolOf = (it) => (it.type === 'mcp_tool_call' ? (it.server === 'orchestra' ? it.tool : `${it.server}.${it.tool}`) : it.type);
  const isTool = (it) => it && ['mcp_tool_call', 'command_execution', 'file_change', 'web_search'].includes(it.type);
  switch (message.type) {
    case 'thread.started':
      if (!conv.started && typeof message.thread_id === 'string') {
        conv.sessionId = message.thread_id;
        conv.started = true;
        save();
      }
      return;
    case 'item.started':
      if (isTool(item)) { addTool(boardId, run, item.id, toolOf(item), item.arguments ?? {}); publish(boardId); }
      return;
    case 'item.completed': {
      if (item?.type === 'agent_message' && item.text?.trim()) addEntry(boardId, { kind: 'assistant', text: clip(item.text.trim()) });
      else if (item?.type === 'error' && item.message) addEntry(boardId, { kind: 'info', text: clip(item.message, 500) });
      else if (isTool(item)) {
        addTool(boardId, run, item.id, toolOf(item), item.arguments ?? {});
        const index = run.tools.get(item.id);
        const failed = item.status === 'failed' || Boolean(item.error);
        const text = item.error?.message ?? (item.result?.content ?? []).map((c) => c.text ?? '').join('\n');
        const entry = conv.history[index];
        if (entry) conv.history[index] = { ...entry, done: true, ...(failed && { error: clip(text, 500) }) };
        save();
      } else return;
      publish(boardId);
      return;
    }
    case 'turn.completed':
      run.result = message;
      return;
    case 'turn.failed':
    case 'error':
      run.result = message;
      addEntry(boardId, { kind: 'error', text: clip(message.error?.message ?? message.message ?? message.type) });
      publish(boardId);
      return;
  }
}

// Programme trouvé dans le PATH. Un script npm (.cmd) est lancé directement avec Node quand on y trouve son
// .js : aucun passage par cmd, donc aucun souci de guillemets dans les longues options (consignes de Codex).
function launch(program, args, options) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(program)) {
    let script = null;
    try { script = fs.readFileSync(program, 'utf8').match(/"%~?dp0%?\\([^"]+\.c?js)"/i)?.[1] ?? null; } catch {}
    if (script) {
      const dir = path.dirname(program);
      const node = fs.existsSync(path.join(dir, 'node.exe')) ? path.join(dir, 'node.exe') : 'node';
      return spawn(node, [path.join(dir, script), ...args], options);
    }
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

// Fonctions de Codex retirées au chef d'orchestre. Pas code_mode_host : ses outils MCP passent par lui.
const CODEX_FEATURES_OFF = ['shell_tool', 'unified_exec', 'multi_agent', 'image_generation', 'goals', 'apps', 'plugins', 'browser_use', 'computer_use', 'in_app_browser', 'view_image', 'sleep_tool', 'tool_suggest', 'skill_search'];
const toml = (value) => JSON.stringify(String(value)); // chaîne TOML de base : mêmes échappements que JSON
const CODEX_RULE = '\n## Codex\nOther tools (code execution, file patches, sub-agents) may look available: never use them. You run read-only and Orchestra only lets you direct agents with the orchestra tools.\n';

function claudeArgs(conv, files, settings) {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--mcp-config', files.mcp, '--strict-mcp-config',
    '--tools', '',
    '--allowedTools', deps.tools.map((tool) => `mcp__orchestra__${tool}`).join(','),
    '--append-system-prompt-file', files.prompt,
    ...(conv.started ? ['--resume', conv.sessionId] : ['--session-id', conv.sessionId]),
    ...(settings.model ? ['--model', settings.model] : []),
  ];
}

// Serveurs MCP de l'utilisateur (config de Codex et du projet) : ils tournent hors du bac à sable de Codex et
// pourraient écrire sur le disque. Tous désactivés pour le chef d'orchestre, sauf celui d'Orchestra.
const MCP_TABLE = /^\s*\[\s*mcp_servers\.(?:"([^"\]]+)"|([A-Za-z0-9_-]+))\s*\]/gm;
function userMcpServers(folder) {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const names = new Set();
  for (const file of [path.join(home, 'config.toml'), path.join(folder, '.codex', 'config.toml')]) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const match of text.matchAll(MCP_TABLE)) names.add(match[1] ?? match[2]);
  }
  names.delete('orchestra');
  return [...names];
}
const tomlKey = (name) => (/^[A-Za-z0-9_-]+$/.test(name) ? name : toml(name));

function codexArgs(conv, boardId, settings, folder) {
  const env = `{ ELECTRON_RUN_AS_NODE = "1", ORCHESTRA_TOOLSET = "conductor", ORCHESTRA_URL = ${toml(deps.toolUrl(callerOf(boardId)))} }`;
  return [
    'exec', ...(conv.started ? ['resume'] : []), '--json', '--skip-git-repo-check',
    ...CODEX_FEATURES_OFF.flatMap((feature) => ['--disable', feature]),
    '-c', 'sandbox_mode="read-only"',
    '-c', 'approval_policy="never"',
    '-c', 'web_search="disabled"',
    '-c', `mcp_servers.orchestra.command=${toml(process.execPath)}`,
    '-c', `mcp_servers.orchestra.args=[${toml(deps.mcpServerPath())}]`,
    '-c', `mcp_servers.orchestra.env=${env}`,
    '-c', 'mcp_servers.orchestra.default_tools_approval_mode="approve"',
    ...userMcpServers(folder).flatMap((name) => ['-c', `mcp_servers.${tomlKey(name)}.enabled=false`]),
    '-c', `developer_instructions=${toml(SYSTEM_PROMPT + CODEX_RULE)}`,
    ...(settings.model ? ['-m', settings.model] : []),
    ...(conv.started ? [conv.sessionId] : []),
    '-',
  ];
}

const AGY_RULE = '\n## Antigravity\nYou run in plan mode inside a private, empty folder: never read, write or edit files and never run commands. Only call the orchestra MCP tools (they apply at once or as a proposal the user approves), then answer the user.\n';
const AGY_SETTINGS = JSON.stringify({ permissions: { allow: ['mcp(orchestra/*)'], deny: ['command(*)', 'url(*)', 'agent(*)'] }, allowNonWorkspaceAccess: false });
const agyDir = (key) => path.join(deps.dir(), 'conductor', `agy-${key}`);

// Dossier privé d'Antigravity : sa seule config est le serveur MCP d'Orchestra (adresse et jeton de ce lancement).
function agyWorkspace(key) {
  const dir = agyDir(key);
  fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
  const env = { ELECTRON_RUN_AS_NODE: '1', ORCHESTRA_TOOLSET: 'conductor', ORCHESTRA_URL: deps.toolUrl(callerOf(key)) };
  fs.writeFileSync(path.join(dir, '.agents', 'mcp_config.json'), JSON.stringify({ mcpServers: { orchestra: { command: process.execPath, args: [deps.mcpServerPath()], env, timeoutSeconds: 60 } } }));
  return dir;
}

// Pas d'option de consignes système : elles ouvrent le premier message de la conversation.
function agyArgs(conv, settings, input) {
  const prompt = conv.started ? input : `${SYSTEM_PROMPT}${AGY_RULE}\n---\n\n${input}`;
  return [
    '--output-format', 'stream-json', '--mode', 'plan', '--settings', AGY_SETTINGS,
    ...(conv.started ? ['--conversation', conv.sessionId] : []),
    ...(settings.model ? ['--model', settings.model] : []),
    `-p=${prompt}`,
  ];
}

// Message de l'utilisateur : une exécution du moteur choisi, dans le dossier de travail, sur le tableau donné.
async function send(boardId, message, folder) {
  if (typeof boardId !== 'string' || !ID.test(boardId) || !deps.boardExists(boardId)) return { error: t('conductorSession.noBoard') };
  const key = keyOf(boardId);
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) return { error: t('conductorSession.badMessage', { max: MAX_MESSAGE }) };
  try {
    if (typeof folder !== 'string' || !path.isAbsolute(folder) || !fs.statSync(folder).isDirectory()) throw new Error();
  } catch { return { error: t('conductorSession.badFolder') }; }
  if (runs.has(key)) return { error: t('conductorSession.busy') };

  const settings = deps.settings();
  const engine = engineOf(settings);
  const program = await deps.findCommand(engine);
  if (!program?.ok) return { error: t('conductorSession.notFound', { engine: t(`conductorSession.engine.${engine}`) }) };
  if (runs.has(key)) return { error: t('conductorSession.busy') };

  const conv = conversation(key);
  // Autre moteur que la dernière fois : nouvelle session (une session Claude ne se reprend pas dans Codex).
  if (conv.engine !== engine) {
    Object.assign(conv, freshSession(engine));
    if (conv.history.length) addEntry(key, { kind: 'info', text: t('conductorSession.engineChanged', { engine: t(`conductorSession.engine.${engine}`) }) });
  }
  // Un message pendant un aperçu = une correction : l'ancien plan est effacé, un nouveau est proposé.
  if (deps.pendingOf(callerOf(key)).length) {
    deps.discard(callerOf(key));
    note(key, 'The user rejected your proposed plan (nothing was applied) and asks for the changes below. Propose the whole corrected plan again.');
  }
  deps.openSession(callerOf(key), { boardId, folder, preview: !settings.autoApply });
  const input = [...(conv.notes ?? []).map((text) => `[Orchestra] ${text}`), message.trim()].join('\n\n');
  conv.notes = [];
  const agy = engine === 'antigravity';
  const args = engine === 'codex' ? codexArgs(conv, key, settings, folder) : agy ? agyArgs(conv, settings, input) : claudeArgs(conv, writeFiles(key), settings);
  const onLine = engine === 'codex' ? codexLine : agy ? agyLine : claudeLine;

  addEntry(key, { kind: 'user', text: clip(message.trim(), MAX_MESSAGE) });
  const run = { child: null, live: '', stopped: false, result: null, stderr: '', tools: new Map(), answered: false };
  runs.set(key, run);
  publish(key);

  let child;
  try {
    child = launch(program.message, args, { cwd: agy ? agyWorkspace(key) : folder, windowsHide: true, env: { ...process.env } });
  } catch (error) {
    runs.delete(key);
    addEntry(key, { kind: 'error', text: t('conductorSession.exited', { code: '?', detail: error.message }) });
    publish(key);
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
      if (line) onLine(key, run, line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { run.stderr = (run.stderr + chunk).slice(-MAX_STDERR); });
  child.on('error', (error) => { run.stderr = (run.stderr + error.message).slice(-MAX_STDERR); });
  child.on('close', (code) => {
    if (buffer.trim()) onLine(key, run, buffer.trim());
    runs.delete(key);
    if (run.stopped) addEntry(key, { kind: 'info', text: t('conductorSession.stopped') });
    else if (!run.result) addEntry(key, { kind: 'error', text: t('conductorSession.exited', { code: code ?? '?', detail: clip(run.stderr.trim(), 1000) }) });
    publish(key);
  });
  child.stdin.on('error', () => {});
  child.stdin.end(agy ? '' : input);
  return { ok: true };
}

function note(boardId, text) {
  const conv = conversation(boardId);
  conv.notes = [...(conv.notes ?? []), text].slice(-10);
  save();
}

// Valider l'aperçu : les actions s'appliquent dans l'ordre (conductor.commit), le résultat est noté.
async function approve(boardId) {
  if (typeof boardId !== 'string' || !ID.test(boardId)) return { error: t('conductorSession.noBoard') };
  const key = keyOf(boardId);
  if (runs.has(key)) return { error: t('conductorSession.busy') };
  if (!deps.pendingOf(callerOf(key)).length) return { error: t('conductorSession.nothingPending') };
  const results = await deps.commit(callerOf(key));
  const failed = results.filter((r) => r.isError);
  addEntry(key, { kind: 'info', text: t('conductorSession.applied', { ok: results.length - failed.length, total: results.length }) });
  for (const r of failed) addEntry(key, { kind: 'error', text: clip(`${r.summary} : ${r.text}`, 1000) });
  note(key, failed.length
    ? `The user approved your plan. Applied, except: ${failed.map((r) => `${r.summary} (${r.text})`).join('; ')}.`
    : 'The user approved your plan: everything was applied.');
  publish(key);
  return { ok: true };
}

// Annuler l'aperçu : rien n'est appliqué.
function cancel(boardId) {
  if (typeof boardId !== 'string' || !ID.test(boardId)) return { error: t('conductorSession.noBoard') };
  const key = keyOf(boardId);
  if (runs.has(key)) return { error: t('conductorSession.busy') };
  if (!deps.pendingOf(callerOf(key)).length) return { error: t('conductorSession.nothingPending') };
  deps.discard(callerOf(key));
  addEntry(key, { kind: 'info', text: t('conductorSession.cancelled') });
  note(key, 'The user cancelled your proposed plan: nothing was applied.');
  publish(key);
  return { ok: true };
}

// Aperçu changé (outil proposé, validé ou annulé) : la bulle et les fantômes de la map suivent.
function onPending(caller, items) {
  const key = caller.startsWith('conductor-') ? caller.slice('conductor-'.length) : null;
  if (key) emitAll(key, { type: 'pending', items });
}

// Tableau créé par le chef d'orchestre (outil create_board) : il partage la conversation de son appelant.
function linkBoard(caller, boardId) {
  const key = caller.startsWith('conductor-') ? caller.slice('conductor-'.length) : null;
  if (!key || !ID.test(boardId) || boardId === key) return;
  aliases.set(boardId, key);
  save();
  publish(key);
}

// Arrêt demandé par l'utilisateur : le processus et ses enfants (serveur MCP compris).
function stop(boardId) {
  const run = runs.get(keyOf(boardId));
  if (!run?.child) return;
  run.stopped = true;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(run.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else run.child.kill('SIGTERM');
}

// Nouvelle conversation : nouvelle session Claude, historique vidé.
function reset(boardId) {
  if (typeof boardId !== 'string' || !ID.test(boardId)) return { error: t('conductorSession.noBoard') };
  const key = keyOf(boardId);
  if (runs.has(key)) return { error: t('conductorSession.busy') };
  deps.discard(callerOf(key));
  load().set(key, { ...freshSession(engineOf(deps.settings())), history: [], notes: [] });
  fs.rmSync(agyDir(key), { recursive: true, force: true });
  deps.closeSession(callerOf(key));
  save();
  publish(key);
  return { ok: true };
}

// Tableaux supprimés : leur lien disparaît, et une conversation dont aucun tableau ne reste aussi.
function prune(boardIds) {
  const keep = new Set(boardIds);
  let changed = false;
  for (const boardId of [...aliases.keys()]) {
    if (keep.has(boardId)) continue;
    aliases.delete(boardId);
    changed = true;
  }
  for (const key of [...load().keys()]) {
    if (runs.has(key) || boardsOf(key).some((boardId) => keep.has(boardId))) continue;
    load().delete(key);
    deps.closeSession(callerOf(key));
    fs.rmSync(agyDir(key), { recursive: true, force: true });
    changed = true;
  }
  if (changed) save();
}

function stopAll() {
  for (const boardId of runs.keys()) stop(boardId);
}

function get(boardId) {
  return typeof boardId === 'string' && ID.test(boardId) ? snapshot(keyOf(boardId)) : { history: [], running: false, live: '', pending: [] };
}

module.exports = { init, send, stop, reset, prune, stopAll, get, approve, cancel, onPending, linkBoard, callerOf, onLine: claudeLine, codexLine, agyLine, codexArgs, userMcpServers, SYSTEM_PROMPT };
