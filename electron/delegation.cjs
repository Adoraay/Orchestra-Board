const { chainOf, enqueue, lastReply, READ_DELAY } = require('./linkRelay.cjs');
const { tIn, appLanguage, detectLanguage } = require('./i18n.cjs');
const { randomUUID } = require('crypto');

// Délégation (PLAN.md §3.11) : outils MCP qu'un Claude appelle lui-même pour parler aux agents reliés
// à sa case par un lien en Délégation. Appelés par mcpServer.cjs via le serveur local (hookServer.cjs).
const DEFAULT_WAIT = 180; // s
const MAX_WAIT = 300; // s
const MAX_MESSAGE = 20000;

let deps = { info: () => null, agent: () => ({ name: '?', hooks: null }), emit: () => {}, log: () => {} };
let cases = new Map(); // id -> { name, agent, cwd, branch }
let reachable = new Map(); // appelant -> [{ key, id, target, maxTurns, enabled }]
const tasks = new Map(); // identifiant de tâche -> demande et réponse propres à son émetteur
const active = new Map(); // cible -> identifiant de la tâche effectivement livrée
const waiters = new Set(); // vérifications des wait_for_replies en cours
// Langue de la conversation de chaque case qui délègue, déduite des messages qu'elle envoie (PLAN.md §3.15) :
// les réponses des outils et l'en-tête remis à la cible suivent la langue parlée dans le chat.
const languages = new Map(); // case -> 'en' | 'fr'
const langOf = (id) => languages.get(id) ?? appLanguage();

// info(id) : statut de la case (agentStatus), agent(agentId) : { name, hooks } depuis les paramètres,
// emit(linkId, event) : état d'un lien pour l'interface, log(entrée) : journal des échanges (activityLog).
function init(d) {
  deps = d;
}

// Appelé à chaque sauvegarde de workspace.json (déjà validé) : noms des cases et liens en Délégation.
function setWorkspace(workspace) {
  cases = new Map();
  reachable = new Map();
  const add = (from, link) => reachable.set(from, [...(reachable.get(from) ?? []), link]);
  for (const board of workspace.boards) {
    for (const node of board.nodes) {
      if (node.type !== 'terminal') continue;
      const agent = deps.agent(node.data.agentId);
      cases.set(node.id, { name: node.data.label || agent.name, agent, cwd: node.data.worktree ?? node.data.cwd, branch: node.data.branch });
    }
    for (const edge of board.edges) {
      if (edge.data.mode !== 'delegate') continue;
      const { maxTurns, enabled } = edge.data;
      add(edge.source, { key: edge.id, id: edge.id, target: edge.target, maxTurns, enabled });
      if (edge.data.bidirectional) add(edge.target, { key: `${edge.id}:r`, id: edge.id, target: edge.source, maxTurns, enabled });
    }
  }
  for (const task of tasks.values()) {
    if (!task.staged && task.reply === null && !task.error && !linksOf(task.from).some((link) => link.key === task.key && link.target === task.target)) {
      task.error = tIn(langOf(task.from), 'link.cancelled');
    }
  }
  checkWaiters();
}

const linksOf = (caller) => (reachable.get(caller) ?? []).filter((l) => l.enabled && cases.has(l.target));
const normalize = (name) => String(name ?? '').trim().toLowerCase();
const findLink = (caller, name) => linksOf(caller).find((l) => normalize(cases.get(l.target).name) === normalize(name));
const nameOf = (id) => cases.get(id)?.name ?? '?';
const result = (text, isError = false) => ({ text, isError });

function unknownAgent(caller, name) {
  const lang = langOf(caller);
  const names = linksOf(caller).map((l) => cases.get(l.target).name);
  return result(
    names.length ? tIn(lang, 'delegate.unknownAgent', { name, names: names.join(', ') }) : tIn(lang, 'delegate.noneReachable'),
    true,
  );
}

function listAgents(caller) {
  const lang = langOf(caller);
  const links = linksOf(caller);
  const me = tIn(lang, 'delegate.youAre', { name: nameOf(caller) });
  if (!links.length) return result(`${me} ${tIn(lang, 'delegate.noneReachable')}`);
  const lines = links.map((l) => {
    const c = cases.get(l.target);
    const status = deps.info(l.target)?.status;
    const parts = [tIn(lang, 'delegate.agent', { value: c.agent.name }), tIn(lang, 'delegate.folder', { value: c.cwd ?? '?' })];
    if (c.branch) parts.push(tIn(lang, 'delegate.branch', { value: c.branch }));
    parts.push(tIn(lang, 'delegate.statusLabel', { value: tIn(lang, status ? `delegate.status.${status}` : 'delegate.notRunningStatus') }));
    if (!c.agent.hooks) parts.push(tIn(lang, 'delegate.unsupported'));
    return `- ${c.name} (${parts.join(' · ')})`;
  });
  return result(`${me} ${tIn(lang, 'delegate.reachable')}\n${lines.join('\n')}`);
}

function sendToAgent(caller, { name, message } = {}) {
  const detected = detectLanguage(message);
  if (detected) languages.set(caller, detected);
  const lang = langOf(caller);
  if (typeof message !== 'string' || !message.trim()) return result(tIn(lang, 'delegate.emptyMessage'), true);
  if (message.length > MAX_MESSAGE) return result(tIn(lang, 'delegate.tooLong', { max: MAX_MESSAGE }), true);
  const link = findLink(caller, name);
  if (!link) return unknownAgent(caller, name);
  const target = cases.get(link.target);
  const refuse = (text) => {
    deps.log({ kind: 'refused', linkId: link.id, from: caller, to: link.target, text });
    return result(text, true);
  };
  if (!target.agent.hooks) return refuse(tIn(lang, 'delegate.noHooks', { name: target.name }));
  const info = deps.info(link.target);
  if (!info) return refuse(tIn(lang, 'delegate.notRunning', { name: target.name }));
  if (tasks.size >= 500) return refuse(tIn(lang, 'delegate.queueFull'));

  // Limite de tours de la chaîne en cours (PLAN.md §3.5) : pas de boucle sans fin entre agents.
  const chain = chainOf(caller);
  const used = chain.counts.get(link.key) ?? 0;
  if (used >= link.maxTurns) {
    deps.emit(link.id, { state: 'limit', turns: used, maxTurns: link.maxTurns });
    return refuse(tIn(lang, 'delegate.limit', { max: link.maxTurns, name: target.name }));
  }
  chain.counts.set(link.key, used + 1);
  const taskId = randomUUID();
  const expect = { taskId, target: link.target, targetName: target.name, from: caller, key: link.key, id: link.id, turns: used + 1, maxTurns: link.maxTurns, delivered: false, reply: null, error: null };
  tasks.set(taskId, expect);
  deps.log({ kind: 'delegate', taskId, linkId: link.id, from: caller, to: link.target, text: message.trim() });
  enqueue(link.target, {
    key: link.key,
    id: link.id,
    // En-tête dans la langue du message lui-même : la cible reçoit un message cohérent.
    text: `${tIn(lang, 'delegate.header', { name: nameOf(caller) })}\n\n${message.trim()}\n\n${tIn(lang, 'delegate.footer')}`,
    chain,
    turns: used + 1,
    maxTurns: link.maxTurns,
    onStaged: () => { expect.staged = true; },
    stillValid: () => tasks.has(taskId) && !expect.error && linksOf(caller).some((l) => l.key === link.key),
    onDelivered: () => {
      expect.delivered = true;
      active.set(link.target, taskId);
    },
    onFailed: (message) => {
      if (expect.reply === null) expect.error = message;
      if (active.get(link.target) === taskId) active.delete(link.target);
      checkWaiters();
    },
  });

  return result(
    `${tIn(lang, 'delegate.queued', { name: target.name })} ${tIn(lang, 'delegate.taskId', { id: taskId })} ${tIn(lang, 'delegate.getReply')}`,
  );
}

function checkWaiters() {
  for (const check of waiters) check();
}

// Une case qui avait reçu un message délégué a fini : sa réponse est gardée pour wait_for_replies,
// et le lien s'anime dans l'autre sens.
function onStop(id, payload) {
  const taskId = active.get(id);
  const expect = tasks.get(taskId);
  if (!expect || !expect.delivered || expect.reply !== null || expect.stopping) return;
  expect.stopping = true;
  setTimeout(() => {
    if (tasks.get(taskId) !== expect || expect.error) return;
    expect.reply = lastReply(payload) || tIn(langOf(expect.from), 'delegate.emptyReply');
    if (active.get(id) === taskId) active.delete(id);
    deps.log({ kind: 'reply', taskId, linkId: expect.id, from: id, to: expect.from, text: expect.reply });
    deps.emit(expect.id, { state: 'sent', to: expect.from, turns: expect.turns, maxTurns: expect.maxTurns });
    checkWaiters();
  }, READ_DELAY);
}

function onStatus(id, info) {
  if (info) return;
  active.delete(id);
  for (const [taskId, task] of tasks) {
    if (task.from === id) tasks.delete(taskId);
    else if (task.target === id && task.reply === null) task.error = tIn(langOf(task.from), 'delegate.closed');
  }
  checkWaiters();
}

// Nouvelle consigne de l'utilisateur : les compteurs affichés sur les liens en Délégation repartent à zéro.
function resetCounters(id) {
  for (const link of reachable.get(id) ?? []) deps.emit(link.id, { state: 'ready', turns: 0, maxTurns: link.maxTurns });
}

async function waitForReplies(caller, { names, task_ids: taskIds, timeout_seconds: timeout } = {}, signal) {
  const pending = [...tasks.values()].filter((task) => task.from === caller);
  let targets = pending;
  if (Array.isArray(taskIds) && taskIds.length) {
    targets = [];
    for (const id of new Set(taskIds)) {
      const task = tasks.get(id);
      if (!task || task.from !== caller) return result(tIn(langOf(caller), 'delegate.unknownTask'), true);
      targets.push(task);
    }
  }
  if (Array.isArray(names) && names.length) {
    const allowed = new Set();
    for (const name of names) {
      const link = findLink(caller, name);
      const target = link?.target ?? pending.find((task) => normalize(task.targetName) === normalize(name))?.target;
      if (!target) return unknownAgent(caller, name);
      allowed.add(target);
    }
    targets = targets.filter((task) => allowed.has(task.target));
  }
  const lang = langOf(caller);
  if (!targets.length) return result(tIn(lang, 'delegate.nothingPending'));

  const waiting = (task) => tasks.has(task.taskId) && task.reply === null && !task.error;
  const seconds = Math.min(MAX_WAIT, Math.max(10, Number.isFinite(timeout) ? Math.round(timeout) : DEFAULT_WAIT));
  await new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      waiters.delete(check);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const check = () => {
      if (!targets.some(waiting)) done();
    };
    timer = setTimeout(done, seconds * 1000);
    waiters.add(check);
    signal?.addEventListener('abort', done); // Claude interrompu : on arrête d'attendre
    if (signal?.aborted) done();
    check();
  });

  const parts = targets.map((task) => {
    const title = `### ${task.targetName} · ${task.taskId}`;
    if (!tasks.has(task.taskId)) return `${title}\n${tIn(lang, 'delegate.notSent')}`;
    if (task.reply !== null || task.error) {
      tasks.delete(task.taskId);
      return `${title}\n${task.error || task.reply}`;
    }
    return `${title}\n${tIn(lang, 'delegate.stillWorking', { seconds })}`;
  });
  return result(parts.join('\n\n'));
}

// Appel d'un outil par la case caller. Renvoie { text, isError }.
async function callTool(caller, name, args, signal) {
  if (!deps.info(caller)) return result(tIn(langOf(caller), 'delegate.callerNotRunning'), true);
  switch (name) {
    case 'list_agents': return listAgents(caller);
    case 'send_to_agent': return sendToAgent(caller, args);
    case 'wait_for_replies': return waitForReplies(caller, args, signal);
    default: return result(tIn(langOf(caller), 'delegate.unknownTool', { name }), true);
  }
}

module.exports = { init, setWorkspace, callTool, onStop, onStatus, resetCounters };
