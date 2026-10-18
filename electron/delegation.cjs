const { chainOf, enqueue, lastReply, READ_DELAY } = require('./linkRelay.cjs');

// Délégation (PLAN.md §3.11) : outils MCP qu'un Claude appelle lui-même pour parler aux agents reliés
// à sa case par un lien en Délégation. Appelés par mcpServer.cjs via le serveur local (hookServer.cjs).
const DEFAULT_WAIT = 180; // s
const MAX_WAIT = 300; // s
const MAX_MESSAGE = 20000;
const STATUS_TEXT = { idle: 'libre', working: 'travaille', waiting: 'attend une permission', done: 'a fini' };

let deps = { info: () => null, agent: () => ({ name: '?', hooks: null }), emit: () => {} };
let cases = new Map(); // id -> { name, agent, cwd, branch }
let reachable = new Map(); // appelant -> [{ key, id, target, maxTurns, enabled }]
const expects = new Map(); // cible -> { from, key, id, turns, maxTurns, delivered, reply }
const waiters = new Set(); // vérifications des wait_for_replies en cours

// info(id) : statut de la case (agentStatus), agent(agentId) : { name, hooks } depuis les paramètres,
// emit(linkId, event) : état d'un lien pour l'interface.
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
}

const linksOf = (caller) => (reachable.get(caller) ?? []).filter((l) => l.enabled && cases.has(l.target));
const normalize = (name) => String(name ?? '').trim().toLowerCase();
const findLink = (caller, name) => linksOf(caller).find((l) => normalize(cases.get(l.target).name) === normalize(name));
const nameOf = (id) => cases.get(id)?.name ?? '?';
const result = (text, isError = false) => ({ text, isError });

function unknownAgent(caller, name) {
  const names = linksOf(caller).map((l) => cases.get(l.target).name);
  return result(
    names.length
      ? `Aucun agent joignable ne s'appelle « ${name} ». Agents joignables : ${names.join(', ')}.`
      : "Aucun agent joignable : l'utilisateur doit tracer un lien en Délégation depuis ta case sur la map d'Orchestra.",
    true,
  );
}

function listAgents(caller) {
  const links = linksOf(caller);
  const me = `Tu es « ${nameOf(caller)} » dans Orchestra.`;
  if (!links.length) {
    return result(`${me} Aucun agent joignable : l'utilisateur doit tracer un lien en Délégation depuis ta case sur la map.`);
  }
  const lines = links.map((l) => {
    const c = cases.get(l.target);
    const status = deps.info(l.target)?.status;
    const parts = [`agent : ${c.agent.name}`, `dossier : ${c.cwd ?? '?'}`];
    if (c.branch) parts.push(`branche : ${c.branch}`);
    parts.push(`statut : ${status ? STATUS_TEXT[status] : 'pas lancé'}`);
    if (c.agent.hooks !== 'claude') parts.push('injoignable pour l\'instant (seuls les agents Claude Code sont pris en charge)');
    return `- ${c.name} (${parts.join(' · ')})`;
  });
  return result(`${me} Agents que tu peux joindre avec send_to_agent :\n${lines.join('\n')}`);
}

function sendToAgent(caller, { name, message } = {}) {
  if (typeof message !== 'string' || !message.trim()) return result('Le message est vide.', true);
  if (message.length > MAX_MESSAGE) return result(`Message trop long (${MAX_MESSAGE} caractères maximum).`, true);
  const link = findLink(caller, name);
  if (!link) return unknownAgent(caller, name);
  const target = cases.get(link.target);
  if (target.agent.hooks !== 'claude') return result(`${target.name} n'est pas un agent Claude Code : la délégation ne le prend pas encore en charge.`, true);
  const info = deps.info(link.target);
  if (!info) return result(`${target.name} n'est pas lancé (case arrêtée ou tableau pas encore ouvert).`, true);

  // Limite de tours de la chaîne en cours (PLAN.md §3.5) : pas de boucle sans fin entre agents.
  const chain = chainOf(caller);
  const used = chain.counts.get(link.key) ?? 0;
  if (used >= link.maxTurns) {
    deps.emit(link.id, { state: 'limit', turns: used, maxTurns: link.maxTurns });
    return result(`Limite de ${link.maxTurns} message(s) vers ${target.name} atteinte pour cette demande. L'utilisateur peut l'augmenter dans le panneau du lien.`, true);
  }
  chain.counts.set(link.key, used + 1);

  const expect = { from: caller, key: link.key, id: link.id, turns: used + 1, maxTurns: link.maxTurns, delivered: false, reply: null };
  expects.set(link.target, expect);
  enqueue(link.target, {
    key: link.key,
    id: link.id,
    text: `Message de « ${nameOf(caller)} » (via Orchestra) :\n\n${message.trim()}\n\n(Ta réponse finale lui sera transmise automatiquement.)`,
    chain,
    turns: used + 1,
    maxTurns: link.maxTurns,
    stillValid: () => expects.get(link.target) === expect && linksOf(caller).some((l) => l.key === link.key),
    onDelivered: () => {
      expect.delivered = true;
    },
  });

  const busy = info.status === 'working' || info.status === 'waiting';
  return result(
    `${busy ? `${target.name} est occupé : le message lui sera remis dès qu'il aura fini.` : `Message remis à ${target.name}.`} ` +
      'Récupère sa réponse avec wait_for_replies.',
  );
}

function checkWaiters() {
  for (const check of waiters) check();
}

// Une case qui avait reçu un message délégué a fini : sa réponse est gardée pour wait_for_replies,
// et le lien s'anime dans l'autre sens.
function onStop(id, payload) {
  const expect = expects.get(id);
  if (!expect || !expect.delivered || expect.reply !== null) return;
  setTimeout(() => {
    if (expects.get(id) !== expect) return;
    expect.reply = lastReply(payload) || '(réponse vide)';
    deps.emit(expect.id, { state: 'sent', to: expect.from, turns: expect.turns, maxTurns: expect.maxTurns });
    checkWaiters();
  }, READ_DELAY);
}

function onStatus(id, info) {
  if (!info) checkWaiters(); // une case fermée ne répondra plus : on n'attend plus pour rien
}

// Nouvelle consigne de l'utilisateur : les compteurs affichés sur les liens en Délégation repartent à zéro.
function resetCounters(id) {
  for (const link of reachable.get(id) ?? []) deps.emit(link.id, { state: 'ready', turns: 0, maxTurns: link.maxTurns });
}

async function waitForReplies(caller, { names, timeout_seconds: timeout } = {}, signal) {
  const pending = [...expects].filter(([, e]) => e.from === caller).map(([target]) => target);
  let targets = pending;
  if (Array.isArray(names) && names.length) {
    targets = [];
    for (const name of names) {
      const link = findLink(caller, name);
      const target = link?.target ?? pending.find((t) => normalize(nameOf(t)) === normalize(name));
      if (!target) return unknownAgent(caller, name);
      targets.push(target);
    }
  }
  if (!targets.length) return result("Aucun message en attente de réponse : envoie d'abord un message avec send_to_agent.");

  const waiting = (t) => {
    const e = expects.get(t);
    return e?.from === caller && e.reply === null && Boolean(deps.info(t));
  };
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
    check();
  });

  const parts = targets.map((t) => {
    const e = expects.get(t);
    if (e?.from !== caller) return `### ${nameOf(t)}\n(aucun message envoyé à cet agent)`;
    if (e.reply !== null) {
      expects.delete(t);
      return `### ${nameOf(t)}\n${e.reply}`;
    }
    if (!deps.info(t)) return `### ${nameOf(t)}\n(pas de réponse : la case a été fermée ou arrêtée)`;
    return `### ${nameOf(t)}\n(travaille encore après ${seconds} s : rappelle wait_for_replies pour attendre sa réponse)`;
  });
  return result(parts.join('\n\n'));
}

// Appel d'un outil par la case caller. Renvoie { text, isError }.
async function callTool(caller, name, args, signal) {
  if (!deps.info(caller)) return result("Cette case n'est pas lancée dans Orchestra.", true);
  switch (name) {
    case 'list_agents': return listAgents(caller);
    case 'send_to_agent': return sendToAgent(caller, args);
    case 'wait_for_replies': return waitForReplies(caller, args, signal);
    default: return result(`Outil inconnu : ${name}`, true);
  }
}

module.exports = { init, setWorkspace, callTool, onStop, onStatus, resetCounters };
