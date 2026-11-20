const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { t } = require('./i18n.cjs');

// Chef d'orchestre (PLAN.md §3.25) : outils MCP qui construisent et dirigent un tableau (cases, liens, post-it,
// rôles, messages). Node valide tout ici, puis l'interface applique chaque changement avec les mêmes
// opérations que l'utilisateur (useBoardOps) : la map se met à jour en direct, la sauvegarde suit.
// Appelants : la session cachée du chef d'orchestre (openSession, étape 2), ou une case Claude Code quand
// Paramètres › Général › « outils du chef d'orchestre » est coché (test). Une case créée par le chef
// d'orchestre n'a jamais ces outils.
// Aperçu : les actions sont gardées en attente avec des ids temporaires (pending-N), utilisables par les outils
// suivants et visibles dans read_board ; commit() les applique dans l'ordre en remplaçant ces ids.
const TOOLS = ['read_board', 'create_agent', 'create_link', 'update_link', 'remove_link', 'create_sticky', 'update_sticky', 'set_role', 'send_to', 'remove_agent', 'read_agent_output', 'arrange', 'create_board'];
const TYPES = { claude: 'claude-code', codex: 'codex', antigravity: 'antigravity', terminal: 'shell' };
const TYPE_NAMES = Object.fromEntries(Object.entries(TYPES).map(([type, agentId]) => [agentId, type]));
const LINK_MODES = ['relay', 'delegate'];
const LAYOUTS = ['pyramid', 'row', 'column', 'grid'];
const MAX_NAME = 40;
const MAX_ROLE = 2000; // = workspaceStore.cjs
const MAX_TEXT = 20000;
const MAX_TURNS = 20;
const DEFAULT_LINES = 40;
const MAX_LINES = 80; // read_agent_output : peu de lignes, pour ne pas gaspiller de tokens
const LOG_ENTRIES = 20;
const SHORT = 300; // caractères gardés par texte dans read_board
const START_DELAY = 1500; // ms après SessionStart : l'invite du CLI finit de s'afficher avant le collage
const START_TIMEOUT = 90000;
const MAX_NEW_BOARDS = 3; // tableaux que le chef d'orchestre peut créer par message de l'utilisateur

let deps = {
  requestOp: async () => ({ error: 'unavailable' }), // (boardId, op) -> { id } | { error }, appliqué par l'interface
  settings: () => ({ maxAgents: 6, tileTools: false }),
  agents: () => [],
  info: () => null, // agentStatus.info
  enqueue: () => null, // linkRelay.enqueue
  buffer: () => '', // ptyManager.buffer
  clean: (text) => text, // terminalLink.clean (codes ANSI retirés)
  ensureWorktree: async () => ({ error: 'unavailable' }),
  isRepo: async () => ({ error: 'unavailable' }),
  logEntries: () => [],
  log: () => {},
  onPending: () => {}, // (appelant, actions en attente) : l'aperçu a changé
  onBoardCreated: () => {}, // (appelant, tableau) : la conversation suit dans le nouveau tableau
};
let boards = [];
const sessions = new Map(); // appelant -> { boardId, folder, preview, pending, next }
const created = new Set(); // cases créées par le chef d'orchestre, connues avant même leur sauvegarde
const starting = new Map(); // case -> { text, from, timer } : prompt initial envoyé à son SessionStart

function init(d) {
  deps = { ...deps, ...d };
}

// Appelé à chaque sauvegarde de workspace.json (déjà validé), tous tableaux confondus.
function setWorkspace(workspace) {
  boards = workspace.boards;
}

const isTool = (name) => TOOLS.includes(name);
const result = (text, isError = false) => ({ text, isError });
const fail = (key, vars) => result(t(key, vars), true);
const normalize = (value) => String(value ?? '').trim().toLowerCase();
const short = (text) => (text.length > SHORT ? `${text.slice(0, SHORT)}…` : text);

const agentOf = (agentId) => deps.agents().find((a) => a.id === agentId) ?? null;
const findNode = (id) => {
  for (const board of boards) {
    const node = board.nodes.find((n) => n.id === id);
    if (node) return { board, node };
  }
  return null;
};
const fromConductor = (node) => created.has(node.id) || node.data.createdBy === 'conductor';
const kindOf = (node) => (node.type === 'note' ? 'sticky' : node.type === 'terminal' ? (node.data.agentId === 'shell' ? 'terminal' : 'agent') : null);
const labelOf = (node) =>
  node.data.label || (node.type === 'note' ? t('note.defaultName') : agentOf(node.data.agentId)?.name ?? node.data.agentId);

// Nom d'une case (journal) ou du chef d'orchestre lui-même.
function nameOf(id) {
  if (sessions.has(id) && !findNode(id)) return t('conductor.name');
  const found = findNode(id);
  return found ? labelOf(found.node) : null;
}

// Mêmes règles que linkRule de src/lib/boardOps.js (vérifié par tests/conductor.test.cjs) : Node doit refuser
// un lien impossible avant de le proposer, y compris entre éléments encore en aperçu.
const TOOL_CARDS = ['visualTest', 'interactiveBrowser'];
function linkRule(a, b, defaultMode, hasHooks = () => false) {
  if (!a || !b || a.id === b.id) return null;
  const linkable = (n) => ['terminal', 'note', ...TOOL_CARDS].includes(n.type);
  if (!linkable(a) || !linkable(b)) return null;
  const isCard = (n) => TOOL_CARDS.includes(n.type);
  if (isCard(a) || isCard(b)) {
    const [agent, card] = isCard(b) ? [a, b] : [b, a];
    if (agent.type !== 'terminal' || !hasHooks(agent.data?.agentId)) return null;
    return { source: agent.id, target: card.id, mode: card.type === 'interactiveBrowser' ? 'browser' : 'visual' };
  }
  const isNote = (n) => n.type === 'note';
  if (isNote(a) || isNote(b)) {
    const [agent, note] = isNote(b) ? [a, b] : [b, a];
    if (isNote(agent) || agent.data?.agentId === 'shell') return null;
    return { source: agent.id, target: note.id, mode: 'note' };
  }
  const isShell = (n) => n.data?.agentId === 'shell';
  const mode = !isShell(a) && isShell(b) ? 'terminal' : isShell(a) ? 'relay' : defaultMode;
  const fallback = mode === 'relay' && !hasHooks(a.data?.agentId);
  return { source: a.id, target: b.id, mode, ...(fallback && { extra: { terminalFallback: true, review: true } }) };
}
const hasHooks = (agentId) => Boolean(agentOf(agentId)?.hooks);

// Les outils du chef d'orchestre sont-ils donnés à cette case Claude Code (réglage de test) ?
function tileTools(id) {
  if (!deps.settings().tileTools || created.has(id)) return false;
  const found = findNode(id);
  return !found || (found.node.type === 'terminal' && !fromConductor(found.node));
}

// Session du chef d'orchestre (étape 2) : tableau, dossier de travail, aperçu ou non.
function openSession(id, { boardId, folder, preview }) {
  const previous = sessions.get(id);
  // runStickies : post-it créés depuis le dernier message de l'utilisateur (rangés avec les agents par arrange) ;
  // newBoards : tableaux créés pendant ce message ; planBoards : tableaux créés pour un aperçu pas encore validé.
  sessions.set(id, {
    boardId, folder, preview: Boolean(preview), pending: previous?.boardId === boardId ? previous.pending : [], next: previous?.next ?? 1,
    runStickies: [], newBoards: 0, planBoards: previous?.planBoards ?? [],
  });
}
function closeSession(id) {
  sessions.delete(id);
}

// Contexte de l'appelant : sa session, ou la case de test (toujours en direct, dossier de la case).
function contextOf(caller) {
  const session = sessions.get(caller);
  if (session) {
    const board = boards.find((b) => b.id === session.boardId);
    return board ? { caller, board, session } : { error: fail('conductor.noBoard') };
  }
  const found = findNode(caller);
  if (!found || !deps.settings().tileTools || found.node.type !== 'terminal' || fromConductor(found.node) || !deps.info(caller)) {
    return { error: fail('conductor.notAllowed') };
  }
  const folder = found.node.data.worktree ?? found.node.data.cwd;
  return { caller, board: found.board, session: { boardId: found.board.id, folder, preview: false, pending: [], next: 1, runStickies: [] } };
}

// Élément du tableau désigné par son id ou son nom (sans casse), y compris en attente d'aperçu.
function resolve(ctx, ref, kinds) {
  const key = String(ref ?? '').trim();
  if (!key) return null;
  const nodes = ctx.board.nodes.filter((n) => kinds.includes(kindOf(n)));
  const node = nodes.find((n) => n.id === key) ?? nodes.find((n) => normalize(labelOf(n)) === normalize(key));
  if (node) return { id: node.id, name: labelOf(node), kind: kindOf(node), node };
  const item = ctx.session.pending.find((p) => p.tempId && kinds.includes(p.kind) && (p.tempId === key || normalize(p.name) === normalize(key)));
  return item ? { id: item.tempId, name: item.name, kind: item.kind, node: item.node, pending: true } : null;
}

// Lien désigné par son id, ou par ses deux extrémités (dans un sens ou dans l'autre).
function resolveLink(ctx, { link, from, to }) {
  const edges = [...ctx.board.edges, ...ctx.session.pending.filter((p) => p.type === 'create_link').map((p) => ({ id: p.tempId, source: p.source, target: p.target, data: p.data, pending: true }))];
  if (link) return edges.find((e) => e.id === String(link).trim()) ?? null;
  const a = resolve(ctx, from, ['agent', 'terminal', 'sticky']);
  const b = resolve(ctx, to, ['agent', 'terminal', 'sticky']);
  if (!a || !b) return null;
  return edges.find((e) => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)) ?? null;
}

const usedNames = (ctx) => [...ctx.board.nodes.map(labelOf), ...ctx.session.pending.filter((p) => p.tempId).map((p) => p.name)].map(normalize);
function nextName(ctx, base) {
  const used = new Set(usedNames(ctx));
  let n = 1;
  while (used.has(normalize(`${base} ${n}`))) n++;
  return `${base} ${n}`;
}
const cleanName = (value) => (typeof value === 'string' && value.trim() && value.trim().length <= MAX_NAME && !/[\r\n]/.test(value) ? value.trim() : null);
const linkEnds = (ctx, edge) => [edge.source, edge.target].map((id) => resolve(ctx, id, ['agent', 'terminal', 'sticky'])?.name ?? '?');

function conductorAgents(ctx) {
  const onBoard = ctx.board.nodes.filter((n) => kindOf(n) === 'agent' && fromConductor(n)).length;
  return onBoard + ctx.session.pending.filter((p) => p.type === 'create_agent' && p.kind === 'agent').length;
}

// Dossier demandé : le dossier de travail ou un sous-dossier existant (jamais créé).
function folderOf(ctx, folder) {
  const base = ctx.session.folder;
  if (!base) return null;
  const target = folder ? path.resolve(base, String(folder)) : base;
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try { return fs.statSync(target).isDirectory() ? target : null; } catch { return null; }
}

// ——— Lecture du tableau ———

function readBoard(ctx) {
  const { board, session } = ctx;
  const pendingIds = new Set(session.pending.filter((p) => p.tempId).map((p) => p.tempId));
  const removing = new Set(session.pending.filter((p) => p.type === 'remove_agent').map((p) => p.target));
  const nodes = [...board.nodes, ...session.pending.filter((p) => p.node).map((p) => p.node)];
  const agent = (n) => ({
    id: n.id,
    name: labelOf(n),
    type: TYPE_NAMES[n.data.agentId] ?? n.data.agentId,
    status: pendingIds.has(n.id) ? 'pending' : deps.info(n.id)?.status ?? 'not_running',
    folder: n.data.worktree ?? n.data.cwd ?? null,
    ...(n.data.branch && { branch: n.data.branch }),
    ...(n.data.role && { role: short(n.data.role) }),
    ...(fromConductor(n) && { created_by_conductor: true }),
    ...(pendingIds.has(n.id) && { pending: true }),
    ...(removing.has(n.id) && { pending_removal: true }),
  });
  const edges = [...board.edges.map((e) => ({ ...e })), ...session.pending.filter((p) => p.type === 'create_link').map((p) => ({ id: p.tempId, source: p.source, target: p.target, data: p.data, pending: true }))];
  const names = new Map(nodes.map((n) => [n.id, labelOf(n)]));
  const recent = deps.logEntries().filter((e) => e.boardId === board.id).slice(-LOG_ENTRIES);
  const view = {
    board: board.name,
    board_id: board.id,
    boards: boards.map((b) => ({ id: b.id, name: b.name })),
    folder: session.folder,
    mode: session.preview ? 'preview' : 'direct',
    conductor_agents: { used: conductorAgents(ctx), max: deps.settings().maxAgents },
    agents: nodes.filter((n) => kindOf(n) === 'agent').map(agent),
    terminals: nodes.filter((n) => kindOf(n) === 'terminal').map(agent),
    stickies: nodes.filter((n) => kindOf(n) === 'sticky').map((n) => ({ id: n.id, name: labelOf(n), text: short(n.data.text ?? ''), ...(pendingIds.has(n.id) && { pending: true }) })),
    links: edges.map((e) => ({
      id: e.id, from: names.get(e.source) ?? e.source, to: names.get(e.target) ?? e.target, from_id: e.source, to_id: e.target,
      mode: e.data.mode, ...(e.data.prompt && { instruction: short(e.data.prompt) }), max_turns: e.data.maxTurns,
      enabled: e.data.enabled !== false, ...(e.data.bidirectional && { bidirectional: true }), ...(e.pending && { pending: true }),
    })),
    pending_changes: session.pending.filter((p) => !p.tempId).map((p) => p.summary),
    recent_log: recent.map((e) => ({
      at: new Date(e.at).toTimeString().slice(0, 8), kind: e.kind, ...(e.fromName && { from: e.fromName }), ...(e.toName && { to: e.toName }), text: short(e.text ?? ''),
    })),
  };
  return result(JSON.stringify(view));
}

function readAgentOutput(ctx, { agent, lines } = {}) {
  const target = resolve(ctx, agent, ['agent', 'terminal']);
  if (!target || target.pending) return fail('conductor.notFound', { ref: agent });
  if (!deps.info(target.id)) return fail('conductor.notRunning', { name: target.name });
  const count = Math.min(MAX_LINES, Math.max(1, Number.isInteger(lines) ? lines : DEFAULT_LINES));
  const text = deps.clean(deps.buffer(target.id) ?? '').split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-count).join('\n');
  return result(text || t('conductor.noOutput'));
}

// ——— Actions (proposées en aperçu, appliquées sinon) ———

function planAgent(ctx, args = {}) {
  const agentId = TYPES[args.type];
  if (!agentId) return { error: fail('conductor.unknownType', { type: args.type }) };
  const agent = agentOf(agentId);
  if (!agent || (agentId !== 'shell' && !agent.hooks)) return { error: fail('conductor.agentMissing', { type: args.type }) };
  const kind = agentId === 'shell' ? 'terminal' : 'agent';
  const name = args.name === undefined ? nextName(ctx, agent.name) : cleanName(args.name);
  if (!name) return { error: fail('conductor.badName') };
  if (usedNames(ctx).includes(normalize(name))) return { error: fail('conductor.nameTaken', { name }) };
  const role = typeof args.role === 'string' ? args.role.trim() : '';
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if ((role || prompt) && kind !== 'agent') return { error: fail('conductor.noPrompt') };
  if (role.length > MAX_ROLE) return { error: fail('conductor.tooLong', { field: 'role', max: MAX_ROLE }) };
  if (prompt.length > MAX_TEXT) return { error: fail('conductor.tooLong', { field: 'prompt', max: MAX_TEXT }) };
  const max = deps.settings().maxAgents;
  if (kind === 'agent' && conductorAgents(ctx) >= max) return { error: fail('conductor.limit', { max }) };
  const cwd = folderOf(ctx, args.folder);
  if (!cwd) return { error: fail('conductor.badFolder', { folder: ctx.session.folder ?? '?' }) };
  const branch = typeof args.worktree_branch === 'string' && args.worktree_branch.trim() ? args.worktree_branch.trim() : null;
  const near = args.near ? resolve(ctx, args.near, ['agent', 'terminal', 'sticky']) : null;
  if (args.near && !near) return { error: fail('conductor.notFound', { ref: args.near }) };
  return { action: { type: 'create_agent', kind, name, agentId, cwd, role, prompt, branch, near: near?.id ?? null } };
}

function planLink(ctx, args = {}) {
  const a = resolve(ctx, args.from, ['agent', 'terminal', 'sticky']);
  if (!a) return { error: fail('conductor.notFound', { ref: args.from }) };
  const b = resolve(ctx, args.to, ['agent', 'terminal', 'sticky']);
  if (!b) return { error: fail('conductor.notFound', { ref: args.to }) };
  if (args.mode !== undefined && !LINK_MODES.includes(args.mode)) return { error: fail('conductor.badMode') };
  const rule = linkRule(a.node, b.node, args.mode ?? 'delegate', hasHooks);
  if (!rule) return { error: fail('conductor.linkImpossible') };
  const existing = resolveLink(ctx, { from: a.id, to: b.id });
  if (existing) return { error: fail('conductor.linkExists', { id: existing.id }) };
  const patch = linkPatch(args);
  if (patch.error) return patch;
  return { action: { type: 'create_link', source: rule.source, target: rule.target, data: { mode: rule.mode, prompt: '', maxTurns: 3, bidirectional: false, ...patch.value, ...rule.extra } } };
}

function linkPatch(args) {
  const value = {};
  if (args.instruction !== undefined) {
    if (typeof args.instruction !== 'string' || args.instruction.length > MAX_TEXT) return { error: fail('conductor.tooLong', { field: 'instruction', max: MAX_TEXT }) };
    value.prompt = args.instruction.trim();
  }
  if (args.max_turns !== undefined) {
    if (!Number.isInteger(args.max_turns) || args.max_turns < 1 || args.max_turns > MAX_TURNS) return { error: fail('conductor.badTurns') };
    value.maxTurns = args.max_turns;
  }
  if (typeof args.bidirectional === 'boolean') value.bidirectional = args.bidirectional;
  if (typeof args.enabled === 'boolean') value.enabled = args.enabled;
  return { value };
}

function planSticky(ctx, args = {}) {
  const text = typeof args.text === 'string' ? args.text : '';
  if (text.length > MAX_TEXT) return { error: fail('conductor.tooLong', { field: 'text', max: MAX_TEXT }) };
  const name = args.name === undefined ? nextName(ctx, t('note.defaultName')) : cleanName(args.name);
  if (!name) return { error: fail('conductor.badName') };
  if (usedNames(ctx).includes(normalize(name))) return { error: fail('conductor.nameTaken', { name }) };
  const near = args.near ? resolve(ctx, args.near, ['agent', 'terminal', 'sticky']) : null;
  if (args.near && !near) return { error: fail('conductor.notFound', { ref: args.near }) };
  return { action: { type: 'create_sticky', kind: 'sticky', name, text, near: near?.id ?? null } };
}

function plan(ctx, name, args = {}) {
  switch (name) {
    case 'create_agent': return planAgent(ctx, args);
    case 'create_link': return planLink(ctx, args);
    case 'create_sticky': return planSticky(ctx, args);
    case 'update_link': {
      const edge = resolveLink(ctx, args);
      if (!edge) return { error: fail('conductor.notFound', { ref: args.link ?? `${args.from} → ${args.to}` }) };
      const patch = linkPatch(args);
      if (patch.error) return patch;
      if (args.mode !== undefined) {
        if (!LINK_MODES.includes(args.mode)) return { error: fail('conductor.badMode') };
        if (LINK_MODES.includes(edge.data.mode)) patch.value.mode = args.mode;
      }
      return { action: { type: 'update_link', target: edge.id, patch: patch.value } };
    }
    case 'remove_link': {
      const edge = resolveLink(ctx, args);
      if (!edge) return { error: fail('conductor.notFound', { ref: args.link ?? `${args.from} → ${args.to}` }) };
      return { action: { type: 'remove_link', target: edge.id } };
    }
    case 'update_sticky': {
      const note = resolve(ctx, args.sticky, ['sticky']);
      if (!note) return { error: fail('conductor.notFound', { ref: args.sticky }) };
      if (typeof args.text !== 'string' || args.text.length > MAX_TEXT) return { error: fail('conductor.tooLong', { field: 'text', max: MAX_TEXT }) };
      return { action: { type: 'update_sticky', target: note.id, text: args.text } };
    }
    case 'set_role': {
      const agent = resolve(ctx, args.agent, ['agent']);
      if (!agent) return { error: fail('conductor.notFound', { ref: args.agent }) };
      const role = typeof args.role === 'string' ? args.role.trim() : '';
      if (role.length > MAX_ROLE) return { error: fail('conductor.tooLong', { field: 'role', max: MAX_ROLE }) };
      return { action: { type: 'set_role', target: agent.id, role } };
    }
    case 'send_to': {
      const agent = resolve(ctx, args.agent, ['agent']);
      if (!agent) return { error: fail('conductor.notFound', { ref: args.agent }) };
      const message = typeof args.message === 'string' ? args.message.trim() : '';
      if (!message || message.length > MAX_TEXT) return { error: fail('conductor.tooLong', { field: 'message', max: MAX_TEXT }) };
      if (!agent.pending && !deps.info(agent.id)) return { error: fail('conductor.notRunning', { name: agent.name }) };
      return { action: { type: 'send_to', target: agent.id, message } };
    }
    case 'remove_agent': {
      const agent = resolve(ctx, args.agent, ['agent', 'terminal']);
      if (!agent) return { error: fail('conductor.notFound', { ref: args.agent }) };
      return { action: { type: 'remove_agent', target: agent.id } };
    }
    case 'arrange': {
      if (!LAYOUTS.includes(args.layout)) return { error: fail('conductor.badLayout') };
      const kinds = ['agent', 'terminal', 'sticky'];
      const refs = Array.isArray(args.tiles)
        ? args.tiles
        : [...ctx.board.nodes.filter((n) => ['agent', 'terminal'].includes(kindOf(n))).map((n) => n.id), ...ctx.session.pending.filter((p) => p.type === 'create_agent').map((p) => p.tempId)];
      const ids = [];
      for (const ref of refs) {
        const tile = resolve(ctx, ref, kinds);
        if (!tile) return { error: fail('conductor.notFound', { ref }) };
        if (!ids.includes(tile.id)) ids.push(tile.id);
      }
      if (ids.length < 2) return { error: fail('conductor.arrangeFew') };
      const top = args.top ? resolve(ctx, args.top, kinds) : null;
      if (args.top && (!top || !ids.includes(top.id))) return { error: fail('conductor.notFound', { ref: args.top }) };
      // Post-it qui accompagnent le groupe : reliés à ses cases (lien Note) ou écrits pendant ce message.
      const noteLinks = [...ctx.board.edges, ...ctx.session.pending.filter((p) => p.type === 'create_link')].filter((e) => (e.data?.mode === 'note') && ids.includes(e.source));
      const fresh = [...(ctx.session.runStickies ?? []), ...ctx.session.pending.filter((p) => p.type === 'create_sticky').map((p) => p.tempId)];
      const companions = [...new Set([...noteLinks.map((e) => e.target), ...fresh])].filter((id) => !ids.includes(id));
      return { action: { type: 'arrange', targets: ids, top: top?.id ?? null, layout: args.layout, companions } };
    }
  }
  return { error: fail('conductor.notAllowed') };
}

// Une action proposée : les créations reçoivent un id temporaire et une case fictive (pour les règles de
// lien et read_board) ; retirer un élément encore en aperçu l'efface de l'aperçu, avec ses liens.
function propose(ctx, action) {
  const answer = addProposal(ctx, action);
  notify(ctx.caller);
  return answer;
}

function addProposal(ctx, action) {
  const { session } = ctx;
  if (action.type === 'remove_agent' && action.target.startsWith('pending-')) {
    session.pending = session.pending.filter((p) => p.tempId !== action.target && p.source !== action.target && p.target !== action.target && p.near !== action.target);
    return result(t('conductor.agentRemoved', { name: action.target }));
  }
  if (action.type === 'remove_link' && action.target.startsWith('pending-')) {
    session.pending = session.pending.filter((p) => p.tempId !== action.target && p.target !== action.target);
    return result(t('conductor.linkRemoved', { from: '?', to: '?' }));
  }
  const what = describe(ctx, action);
  if (['create_agent', 'create_sticky', 'create_link'].includes(action.type)) {
    const tempId = `pending-${session.next++}`;
    const item = { ...action, tempId, summary: what };
    if (action.type === 'create_agent') item.node = { id: tempId, type: 'terminal', data: { agentId: action.agentId, label: action.name, cwd: action.cwd, role: action.role, createdBy: 'conductor' } };
    if (action.type === 'create_sticky') item.node = { id: tempId, type: 'note', data: { label: action.name, text: action.text } };
    if (action.type === 'create_link') item.name = tempId;
    session.pending.push({ ...item, boardId: ctx.board.id });
    return result(t('conductor.proposed', { what, id: tempId }));
  }
  session.pending.push({ ...action, summary: what, boardId: ctx.board.id });
  return result(t('conductor.proposedChange', { what }));
}

// Résumé d'une action proposée, à l'infinitif (« Créer l'agent… ») : ligne du plan à valider.
function describe(ctx, action) {
  const name = (id) => resolve(ctx, id, ['agent', 'terminal', 'sticky'])?.name ?? id;
  switch (action.type) {
    case 'create_agent': return t(action.kind === 'agent' ? 'conductor.do.agent' : 'conductor.do.terminal', { name: action.name });
    case 'create_sticky': return t('conductor.do.sticky', { name: action.name });
    case 'create_link': return t('conductor.do.link', { from: name(action.source), to: name(action.target), mode: t(`conductor.mode.${action.data.mode}`) });
    case 'update_sticky': return t('conductor.do.stickyUpdated', { name: name(action.target) });
    case 'set_role': return t('conductor.do.role', { name: name(action.target), role: short(action.role) });
    case 'remove_agent': return t('conductor.do.removed', { name: name(action.target) });
    case 'send_to': return t('conductor.do.send', { name: name(action.target), message: short(action.message) });
    case 'arrange': return t('conductor.do.arrange', { count: action.targets.length, layout: t(`conductor.layout.${action.layout}`) });
    default: {
      const edge = resolveLink(ctx, { link: action.target });
      const [from, to] = edge ? linkEnds(ctx, edge) : ['?', '?'];
      return t(action.type === 'remove_link' ? 'conductor.do.linkRemoved' : 'conductor.do.linkUpdated', { from, to });
    }
  }
}

const opError = (response) => fail('conductor.opFailed', { reason: response?.error ?? '?' });

// Applique une action sur la map (via l'interface) et la note dans le journal. Renvoie { text, isError, id }.
async function execute(ctx, action) {
  const { caller, board } = ctx;
  const log = (to, text) => deps.log({ kind: 'conductor', from: caller, to, text });
  switch (action.type) {
    case 'create_agent': {
      let branch = null;
      let worktree = null;
      if (action.branch) {
        const tree = await deps.ensureWorktree(action.cwd, action.branch, { create: true });
        if (tree.error) return fail('conductor.opFailed', { reason: tree.error });
        ({ path: worktree, branch } = tree);
      }
      const id = randomUUID();
      created.add(id);
      const response = await deps.requestOp(board.id, { type: 'addAgent', id, agentId: action.agentId, cwd: action.cwd, label: action.name, role: action.role, branch, worktree, near: action.near });
      if (response?.error) { created.delete(id); return opError(response); }
      if (action.prompt) schedulePrompt(id, action.prompt, caller);
      log(id, t(action.kind === 'agent' ? 'conductor.log.agent' : 'conductor.log.terminal', { name: action.name }));
      const parts = [t(action.kind === 'agent' ? 'conductor.agentCreated' : 'conductor.terminalCreated', { name: action.name, id })];
      if (worktree) parts.push(t('conductor.worktree', { branch, path: worktree }));
      if (action.prompt) parts.push(t('conductor.promptScheduled'));
      return { ...result(parts.join(' ')), id };
    }
    case 'create_sticky': {
      const response = await deps.requestOp(board.id, { type: 'addSticky', label: action.name, text: action.text, near: action.near });
      if (response?.error || !response?.id) return opError(response);
      ctx.session.runStickies?.push(response.id);
      log(response.id, t('conductor.log.sticky', { name: action.name }));
      return { ...result(t('conductor.stickyCreated', { name: action.name, id: response.id })), id: response.id };
    }
    case 'create_link': {
      const name = (id) => resolve(ctx, id, ['agent', 'terminal', 'sticky'])?.name ?? id;
      const text = t('conductor.log.link', { from: name(action.source), to: name(action.target), mode: t(`conductor.mode.${action.data.mode}`) });
      const response = await deps.requestOp(board.id, { type: 'addLink', source: action.source, target: action.target, data: action.data });
      if (response?.error || !response?.id) return opError(response);
      log(action.target, text);
      const [from, to] = [action.source, action.target].map((id) => nameOf(id) ?? id);
      return { ...result(t('conductor.linkCreated', { from, to, mode: t(`conductor.mode.${action.data.mode}`), id: response.id })), id: response.id };
    }
    case 'update_link':
    case 'remove_link': {
      const edge = board.edges.find((e) => e.id === action.target);
      if (!edge) return fail('conductor.notFound', { ref: action.target });
      const [from, to] = linkEnds(ctx, edge);
      const response = await deps.requestOp(board.id, action.type === 'remove_link' ? { type: 'removeLink', id: edge.id } : { type: 'updateLink', id: edge.id, patch: action.patch });
      if (response?.error) return opError(response);
      log(edge.target, t(action.type === 'remove_link' ? 'conductor.log.linkRemoved' : 'conductor.log.linkUpdated', { from, to }));
      return result(t(action.type === 'remove_link' ? 'conductor.linkRemoved' : 'conductor.linkUpdated', { from, to }));
    }
    case 'update_sticky': {
      const name = nameOf(action.target);
      const response = await deps.requestOp(board.id, { type: 'updateSticky', id: action.target, text: action.text });
      if (response?.error) return opError(response);
      log(action.target, t('conductor.log.stickyUpdated', { name }));
      return result(t('conductor.stickyUpdated', { name }));
    }
    case 'set_role': {
      const name = nameOf(action.target);
      const response = await deps.requestOp(board.id, { type: 'setRole', id: action.target, role: action.role });
      if (response?.error) return opError(response);
      log(action.target, t('conductor.log.role', { name, role: short(action.role) }));
      return result(t('conductor.roleSet', { name }));
    }
    case 'send_to': {
      const name = nameOf(action.target);
      // Agent créé à l'instant (aperçu validé) : le message part avec son prompt initial, au démarrage.
      if (!deps.info(action.target) && created.has(action.target)) {
        const entry = starting.get(action.target);
        if (entry) entry.text = `${entry.text}\n\n${action.message}`;
        else schedulePrompt(action.target, action.message, caller);
        return result(`${t('conductor.sent', { name })} ${t('conductor.promptScheduled')}`);
      }
      if (!deps.info(action.target)) return fail('conductor.notRunning', { name });
      log(action.target, action.message);
      sendMessage(action.target, action.message, caller);
      return result(t('conductor.sent', { name }));
    }
    case 'arrange': {
      const ids = action.targets.filter((id) => findNode(id));
      if (ids.length < 2) return fail('conductor.arrangeFew');
      const vars = { count: ids.length, layout: t(`conductor.layout.${action.layout}`) };
      const companions = (action.companions ?? []).filter((id) => findNode(id));
      const response = await deps.requestOp(board.id, { type: 'arrange', ids, layout: action.layout, top: action.top, companions });
      if (response?.error) return opError(response);
      log(null, t('conductor.log.arrange', vars));
      return result(t('conductor.arranged', vars));
    }
    case 'remove_agent': {
      const name = nameOf(action.target);
      if (['working', 'waiting'].includes(deps.info(action.target)?.status)) return fail('conductor.busy', { name });
      const response = await deps.requestOp(board.id, { type: 'removeNode', id: action.target });
      if (response?.error) return opError(response);
      log(null, t('conductor.log.removed', { name }));
      return result(t('conductor.agentRemoved', { name }));
    }
  }
  return fail('conductor.notAllowed');
}

// Message du chef d'orchestre pour un agent : même file que les liens (jamais pendant une permission).
function sendMessage(target, text, from) {
  deps.enqueue(target, { kind: 'conductor', from, key: `conductor:${from}`, id: null, text, preview: text, chain: { counts: new Map() }, turns: 1, maxTurns: 1 });
}

function schedulePrompt(id, text, from) {
  const timer = setTimeout(() => {
    starting.delete(id);
    deps.log({ kind: 'refused', from, to: id, text: t('conductor.promptTimeout') });
  }, START_TIMEOUT);
  starting.set(id, { text, from, timer });
}

// Hooks des agents : le prompt initial part après le SessionStart de l'agent créé.
function onHook(id, payload) {
  const entry = starting.get(id);
  if (!entry || payload.hook_event_name !== 'SessionStart') return;
  clearTimeout(entry.timer);
  starting.delete(id);
  setTimeout(() => {
    if (!deps.info(id)) return;
    deps.log({ kind: 'conductor', from: entry.from, to: id, text: entry.text });
    sendMessage(id, entry.text, entry.from);
  }, START_DELAY);
}

// Case fermée : plus de prompt initial à envoyer.
function onExit(id) {
  const entry = starting.get(id);
  if (entry) clearTimeout(entry.timer);
  starting.delete(id);
}

// Les actions sur la map passent l'une après l'autre (une création doit être sauvegardée avant le lien suivant).
let chain = Promise.resolve();
function callTool(caller, name, args = {}) {
  const run = chain.then(() => runTool(caller, name, args));
  chain = run.catch(() => {});
  return run.then(({ text, isError }) => ({ text, isError }));
}

async function runTool(caller, name, args) {
  if (!isTool(name)) return fail('conductor.notAllowed');
  const ctx = contextOf(caller);
  if (ctx.error) return ctx.error;
  if (name === 'read_board') return readBoard(ctx);
  if (name === 'read_agent_output') return readAgentOutput(ctx, args);
  if (name === 'create_board') return createBoard(ctx, args);
  const planned = plan(ctx, name, args);
  if (planned.error) return planned.error;
  if (planned.action.branch && ctx.session.preview) {
    const repo = await deps.isRepo(planned.action.cwd);
    if (repo.error) return fail('conductor.opFailed', { reason: repo.error });
  }
  return ctx.session.preview ? propose(ctx, planned.action) : execute(ctx, planned.action);
}

// Nouveau tableau (onglet), ouvert et cible des actions suivantes de ce message. Créé tout de suite, même en
// aperçu (un tableau vide ne change rien) ; un tableau d'aperçu resté vide disparaît si le plan est annulé.
async function createBoard(ctx, args = {}) {
  if (!sessions.has(ctx.caller)) return fail('conductor.boardOnlyBar');
  const name = args.name === undefined ? null : cleanName(args.name);
  if (args.name !== undefined && !name) return fail('conductor.badName');
  if (ctx.session.newBoards >= MAX_NEW_BOARDS) return fail('conductor.boardLimit', { max: MAX_NEW_BOARDS });
  const response = await deps.requestOp(null, { type: 'createBoard', name });
  if (response?.error || !response?.id) return opError(response);
  const boardName = boards.find((b) => b.id === response.id)?.name ?? name ?? '';
  ctx.session.newBoards++;
  ctx.session.boardId = response.id;
  if (ctx.session.preview) ctx.session.planBoards.push(response.id);
  deps.onBoardCreated(ctx.caller, response.id);
  deps.log({ kind: 'conductor', from: ctx.caller, to: null, text: t('conductor.log.board', { name: boardName }) });
  return result(t('conductor.boardCreated', { name: boardName, id: response.id }));
}

// Aperçu validé : actions appliquées dans l'ordre, ids temporaires remplacés par les vrais. Renvoie les résultats.
async function commit(caller) {
  const session = sessions.get(caller);
  if (!session) return [];
  const pending = session.pending;
  session.pending = [];
  session.planBoards = [];
  notify(caller);
  const ids = new Map();
  const map = (id) => (id && ids.has(id) ? ids.get(id) : id);
  const results = [];
  for (const item of pending) {
    const run = chain.then(async () => {
      const board = boards.find((b) => b.id === (item.boardId ?? session.boardId));
      if (!board) return fail('conductor.noBoard');
      const { tempId, summary, node, boardId, ...action } = item;
      for (const key of ['source', 'target', 'near', 'top']) if (key in action) action[key] = map(action[key]);
      for (const key of ['targets', 'companions']) if (action[key]) action[key] = action[key].map(map).filter((id) => !id.startsWith('pending-'));
      if ([action.source, action.target, action.near].some((id) => id?.startsWith('pending-'))) return fail('conductor.notFound', { ref: summary });
      return execute({ caller, board, session }, action);
    });
    chain = run.catch(() => {});
    const outcome = await run;
    if (item.tempId && outcome.id) ids.set(item.tempId, outcome.id);
    results.push({ summary: item.summary, text: outcome.text, isError: outcome.isError });
  }
  return results;
}

function discard(caller) {
  const session = sessions.get(caller);
  if (session) {
    session.pending = [];
    for (const boardId of session.planBoards) {
      if (boards.find((b) => b.id === boardId)?.nodes.length === 0) deps.requestOp(boardId, { type: 'deleteBoard', id: boardId });
    }
    session.planBoards = [];
  }
  notify(caller);
}

// Actions en attente (aperçu), sans les cases fictives : pour l'interface et les tests.
const pendingOf = (caller) => sessions.get(caller)?.pending.map(({ node, ...item }) => item) ?? [];
const notify = (caller) => deps.onPending(caller, pendingOf(caller));
const isCreated = (id) => created.has(id) || findNode(id)?.node.data.createdBy === 'conductor';

module.exports = {
  TOOLS, init, setWorkspace, isTool, callTool, tileTools, openSession, closeSession, commit, discard, pendingOf,
  onHook, onExit, nameOf, isCreated, linkRule,
};
