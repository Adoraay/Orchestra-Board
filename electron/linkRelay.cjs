const fs = require('fs');
const { t } = require('./i18n.cjs');
const path = require('path');
const { randomUUID } = require('crypto');

// Liens entre agents (PLAN.md §3.5) : quand A a fini (hook Stop de Claude Code), sa dernière réponse
// est envoyée dans le terminal de B avec la consigne du lien.
// Limite de tours : une « chaîne » démarre quand l'utilisateur tape lui-même une consigne (Entrée) ;
// elle suit les messages d'agent en agent et chaque lien ne peut y servir que maxTurns fois.
const READ_DELAY = 400; // ms : au moment du hook Stop, le transcript n'est pas toujours fini d'écrire
const ENTER_DELAY = 250; // ms entre le collage et Entrée, sinon Entrée peut finir dans le collage
// Codex sous Windows reçoit le collage comme une rafale de touches : s'il la lit encore quand Entrée
// arrive, Entrée devient un saut de ligne. Sans passage à « travaille », on renvoie Entrée.
const ENTER_RETRY_DELAY = 1500; // ms
const ENTER_RETRIES = 3;
const TRANSCRIPT_TAIL = 2 * 1024 * 1024; // octets lus en fin de transcript
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const MAX_MESSAGE = 20000;

let deps = { write: () => {}, status: () => null, arm: () => {}, emit: () => {}, log: () => {}, nameOf: (id) => id, pending: () => {} };
// Un lien « dans les deux sens » donne deux entrées (key = id, puis id:r), chacune avec son compteur.
let links = new Map(); // source -> [{ key, id, source, target, prompt, maxTurns, enabled }]
const chains = new Map(); // case -> { counts: Map(key -> envois) }
const queues = new Map(); // case cible -> [{ key, text, chain, turns }]
const deliveries = new Map(); // réservation de la cible, du collage jusqu'au Stop correspondant
// Liens « Valider avant l'envoi » : message préparé, modifiable, qui attend l'accord de l'utilisateur.
const drafts = new Map(); // qid -> { qid, key, id, source, target, text, chain, maxTurns, at }

const newChain = () => ({ counts: new Map() });

// write(id, data), status(id) -> statut ou null si pas lancé, arm(id) : la sortie qui suit = travaille,
// emit(linkId, event) : état d'un lien pour l'interface, log(entrée) : journal des échanges (activityLog),
// nameOf(id) : nom d'une case, pending(liste) : messages à valider ou en file, pour l'interface.
function init(d) {
  deps = { ...deps, ...d };
}

// Brouillons, messages en file et message en cours de collage (pas encore remis), pour l'interface.
function pendingList() {
  const row = (item, target, state) => ({
    qid: item.qid, kind: item.kind ?? 'relay', state, linkId: item.id, taskId: item.taskId ?? item.qid,
    from: item.from ?? null, to: target, fromName: item.from ? deps.nameOf(item.from) : null, toName: deps.nameOf(target),
    text: item.preview ?? item.text, at: item.at,
  });
  const list = [...drafts.values()].map((d) => row({ ...d, from: d.source }, d.target, 'draft'));
  for (const [target, delivery] of deliveries) if (!delivery.submitted) list.push(row(delivery.item, target, delivery.pasted ? 'delivering' : 'queued'));
  for (const [target, queue] of queues) for (const item of queue) list.push(row(item, target, 'queued'));
  return list.sort((a, b) => a.at - b.at);
}

const notify = () => deps.pending(pendingList());

// Appelé à chaque sauvegarde de workspace.json (déjà validé), tous tableaux confondus.
// Seuls les liens en Transmission envoient tout seuls ; la Délégation passe par les outils MCP.
function setLinks(workspace) {
  links = new Map();
  const add = (link) => links.set(link.source, [...(links.get(link.source) ?? []), link]);
  for (const board of workspace.boards) {
    for (const edge of board.edges) {
      if (edge.data.mode !== 'relay') continue;
      add({ ...edge.data, key: edge.id, id: edge.id, source: edge.source, target: edge.target });
      if (edge.data.bidirectional) add({ ...edge.data, key: `${edge.id}:r`, id: edge.id, source: edge.target, target: edge.source });
    }
  }
  // Brouillon d'un lien supprimé, retourné ou passé en Délégation : abandonné.
  let dropped = false;
  for (const [qid, draft] of drafts) {
    const link = findLink(draft.key);
    if (link && link.source === draft.source && link.target === draft.target) continue;
    drafts.delete(qid);
    dropped = true;
    deps.log({ kind: 'cancelled', taskId: qid, linkId: draft.id, from: draft.source, to: draft.target, text: t('link.cancelled') });
  }
  if (dropped) notify();
}

const findLink = (key) => [...links.values()].flat().find((l) => l.key === key);

function readTail(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TRANSCRIPT_TAIL);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// Dernier message de Claude : fourni par le hook dans les versions récentes, sinon lu dans le transcript
// (JSONL, un bloc de contenu par ligne, les blocs d'un même message partagent message.id).
function lastReply(payload) {
  if (typeof payload.last_assistant_message === 'string' && payload.last_assistant_message.trim()) {
    return payload.last_assistant_message.trim();
  }
  const file = payload.transcript_path;
  if (typeof file !== 'string' || !path.isAbsolute(file) || !file.endsWith('.jsonl')) return '';

  let lines;
  try {
    lines = readTail(file).split('\n');
  } catch {
    return '';
  }
  const entries = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant' && !entry.isSidechain && Array.isArray(entry.message?.content)) entries.push(entry);
    } catch {} // première ligne coupée par la lecture de la fin du fichier
  }
  const texts = (entry) => entry.message.content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text);
  const last = entries.findLast((entry) => texts(entry).length);
  if (!last) return '';
  const messageId = last.message.id;
  return entries
    .filter((entry) => (messageId ? entry.message.id === messageId : entry === last))
    .flatMap(texts)
    .join('\n\n')
    .trim();
}

function buildText(prompt, reply) {
  const template = typeof prompt === 'string' ? prompt : '';
  // {reponse} (français) ou {response} (anglais) : la consigne s'écrit dans la langue de l'interface.
  const token = ['{reponse}', '{response}'].find((t) => template.includes(t));
  return token ? template.replaceAll(token, reply) : `${template}\n\n${reply}`.trim();
}

// Collage entre crochets (le CLI le reçoit comme un collage, pas comme une frappe), puis Entrée à part.
// item : { key, id, text, chain, turns, maxTurns, stillValid(), onDelivered() } (les deux derniers facultatifs).
function deliver(target, item) {
  const delivery = { item, submitted: false, pasted: false, working: false, stopping: false };
  deliveries.set(target, delivery);
  if (deps.beforeDeliver) {
    deps.emit(item.id, { state: 'queued', to: target, turns: item.turns, maxTurns: item.maxTurns });
    Promise.resolve().then(() => deps.beforeDeliver(item.taskId ?? item.qid)).then(() => {
      if (deliveries.get(target) !== delivery) return;
      if (!deps.status(target)) { failTarget(target, t('link.targetGone')); return; }
      if (item.stillValid && !item.stillValid()) { dropPrepared(target, delivery, t('link.cancelled')); return; }
      if (['working', 'waiting'].includes(deps.status(target))) {
        deliveries.delete(target);
        deps.deferred?.(item.taskId ?? item.qid);
        queues.set(target, [item, ...(queues.get(target) ?? [])]);
        flush(target);
        notify();
        return;
      }
      paste(target, item, delivery);
    }).catch((error) => { if (deliveries.get(target) === delivery) dropPrepared(target, delivery, error.message || t('link.cancelled'), 'refused'); });
    notify();
    return;
  }
  paste(target, item, delivery);
}

function dropPrepared(target, delivery, message, kind = 'cancelled') {
  const item = delivery.item;
  deliveries.delete(target);
  const used = item.chain.counts.get(item.key) ?? 0;
  if (used > 0) item.chain.counts.set(item.key, used - 1);
  item.onFailed?.(message);
  deps.log({ kind, taskId: item.taskId ?? item.qid, linkId: item.id, from: item.from ?? null, to: target, text: message });
  deps.emit(item.id, kind === 'refused' ? { state: 'error', message } : { state: 'ready', turns: Math.max(0, used - 1), maxTurns: item.maxTurns });
  flush(target);
  notify();
}

function paste(target, item, delivery) {
  delivery.pasted = true;
  chains.set(target, item.chain);
  item.onStaged?.();
  notify();
  deps.write(target, PASTE_START + item.text.replace(/\r?\n/g, '\r') + PASTE_END);
  // Le collage démarre la livraison : ne pas l'abandonner dans l'invite avant un autre message.
  setTimeout(() => {
    if (deliveries.get(target) !== delivery || !deps.status(target)) return;
    delivery.submitted = true;
    deps.arm(target);
    item.onDelivered?.();
    deps.write(target, '\r');
    deps.log({ kind: 'delivered', taskId: item.taskId ?? item.qid, linkId: item.id, from: item.from ?? null, to: target });
    notify();
    confirmSubmit(target, delivery, ENTER_RETRIES);
    deps.emit(item.id, { state: 'sent', to: target, turns: item.turns, maxTurns: item.maxTurns });
  }, ENTER_DELAY);
  delivery.timeout = setTimeout(() => {
    if (deliveries.get(target) !== delivery || delivery.working || delivery.stopping) return;
    // Sans accusé de travail, ne pas envoyer la suite dans une invite au comportement inconnu.
    failTarget(target, t('link.unconfirmed'));
  }, 30000);
}

// Une Entrée en trop sur une invite vide ne fait rien, dans Claude Code comme dans Codex.
function confirmSubmit(target, delivery, retries) {
  if (!retries) return;
  setTimeout(() => {
    if (deliveries.get(target) !== delivery || delivery.stopping) return;
    const status = deps.status(target);
    if (!status || status === 'working' || status === 'waiting') return;
    deps.arm(target);
    deps.write(target, '\r');
    confirmSubmit(target, delivery, retries - 1);
  }, ENTER_RETRY_DELAY);
}

// Message pour une case (Transmission, ou Délégation via delegation.cjs) : envoyé dès qu'elle est libre.
// Chaque message reçoit un identifiant (qid) pour pouvoir l'annuler tant qu'il n'est pas collé.
function enqueue(target, item) {
  const queued = { ...item, qid: item.qid ?? randomUUID(), at: Date.now() };
  queues.set(target, [...(queues.get(target) ?? []), queued]);
  flush(target);
  notify();
  return queued.qid;
}

function failTarget(target, message) {
  const delivery = deliveries.get(target);
  clearTimeout(delivery?.timeout);
  deliveries.delete(target);
  const items = [...(delivery ? [delivery.item] : []), ...(queues.get(target) ?? [])];
  queues.delete(target);
  for (const item of items) {
    item.onFailed?.(message);
    deps.log({ kind: 'refused', taskId: item.taskId ?? item.qid, linkId: item.id, from: item.from ?? null, to: target, text: message });
    deps.emit(item.id, { state: 'error', message });
  }
  if (items.length) notify();
}

function release(target, delivery) {
  if (deliveries.get(target) !== delivery) return;
  clearTimeout(delivery.timeout);
  deliveries.delete(target);
  flush(target);
  notify();
}

// Chaîne en cours d'une case (créée si besoin) : c'est elle qui porte les compteurs de tours.
function chainOf(id) {
  if (!chains.has(id)) chains.set(id, newChain());
  return chains.get(id);
}

// B travaille ou attend une permission : on garde le message pour quand il aura fini.
// Jamais de collage dans une demande de permission.
function flush(target) {
  const queue = queues.get(target);
  if (!queue?.length) return;
  const status = deps.status(target);
  if (!status) {
    failTarget(target, t('link.targetGone'));
    return;
  }
  if (deliveries.has(target) || status === 'working' || status === 'waiting') {
    for (const item of queue) deps.emit(item.id, { state: 'queued', to: target, turns: item.turns, maxTurns: item.maxTurns });
    return;
  }
  // Un message à la fois : le suivant part quand B aura fini de traiter celui-ci.
  let item;
  while (queue.length) {
    item = queue.shift();
    if (!item.stillValid || item.stillValid()) break;
    item.onFailed?.(t('link.cancelled'));
    deps.log({ kind: 'cancelled', taskId: item.taskId ?? item.qid, linkId: item.id, from: item.from ?? null, to: target, text: t('link.cancelled') });
    item = null;
  }
  if (!queue.length) queues.delete(target);
  if (item) deliver(target, item);
}

function onStop(id, payload) {
  if (!deps.status(id)) return;
  const delivery = deliveries.get(id);
  if (delivery?.submitted && !delivery.stopping) {
    delivery.stopping = true;
    clearTimeout(delivery.timeout);
    setTimeout(() => release(id, delivery), READ_DELAY + 10);
  }
  const outgoing = (links.get(id) ?? []).filter((l) => l.enabled && l.prompt.trim());
  if (!outgoing.length) return;
  const chain = chainOf(id);

  setTimeout(() => {
    if (!deps.status(id)) return;
    const reply = lastReply(payload);
    for (const previous of outgoing) {
      // Le lien et sa validation peuvent avoir changé pendant la lecture du transcript.
      const link = findLink(previous.key);
      if (!link?.enabled || !link.prompt.trim() || link.source !== id || link.target !== previous.target) continue;
      const refuse = (text) => deps.log({ kind: 'refused', linkId: link.id, from: id, to: link.target, text });
      if (!reply) {
        deps.emit(link.id, { state: 'error', message: t('link.noReply') });
        refuse(t('link.noReply'));
        continue;
      }
      const used = chain.counts.get(link.key) ?? 0;
      if (used >= link.maxTurns) {
        deps.emit(link.id, { state: 'limit', turns: used, maxTurns: link.maxTurns });
        refuse(t('link.limitReached', { max: link.maxTurns }));
        continue;
      }
      if (!deps.status(link.target)) {
        deps.emit(link.id, { state: 'error', message: t('link.targetNotRunning') });
        refuse(t('link.targetNotRunning'));
        continue;
      }
      const text = buildText(link.prompt, reply);
      if (link.review) {
        // Rien ne part sans l'utilisateur : le tour ne compte qu'à l'envoi.
        const qid = randomUUID();
        drafts.set(qid, { qid, key: link.key, id: link.id, source: id, target: link.target, text, chain, maxTurns: link.maxTurns, at: Date.now() });
        deps.log({ kind: 'draft', taskId: qid, linkId: link.id, from: id, to: link.target, text });
        deps.emit(link.id, { state: 'review', to: link.target, turns: used, maxTurns: link.maxTurns });
        notify();
        continue;
      }
      chain.counts.set(link.key, used + 1);
      sendRelay(link, id, text, chain, used + 1);
    }
  }, READ_DELAY);
}

function sendRelay(link, source, text, chain, turns, qid = randomUUID()) {
  deps.log({ kind: 'relay', taskId: qid, linkId: link.id, from: source, to: link.target, text });
  enqueue(link.target, {
    qid,
    kind: 'relay',
    key: link.key,
    id: link.id,
    from: source,
    text,
    chain,
    turns,
    maxTurns: link.maxTurns,
    stillValid: () => {
      const current = findLink(link.key);
      return Boolean(current?.enabled && current.prompt.trim() && current.source === link.source && current.target === link.target);
    },
  });
}

// Brouillon validé, éventuellement modifié : il part comme une Transmission ordinaire (même identifiant).
function approve(qid, text) {
  const draft = drafts.get(qid);
  if (!draft) return { error: t('pending.notFound') };
  if (typeof text !== 'string' || !text.trim()) return { error: t('pending.empty') };
  if (text.length > MAX_MESSAGE) return { error: t('pending.tooLong', { max: MAX_MESSAGE }) };
  const link = findLink(draft.key);
  if (!link?.enabled || !link.prompt.trim() || link.source !== draft.source || link.target !== draft.target) return { error: t('link.cancelled') };
  if (!deps.status(link.target)) return { error: t('link.targetNotRunning') };
  const used = draft.chain.counts.get(link.key) ?? 0;
  if (used >= link.maxTurns) return { error: t('link.limitReached', { max: link.maxTurns }) };
  drafts.delete(qid);
  draft.chain.counts.set(link.key, used + 1);
  sendRelay(link, draft.source, text.trim(), draft.chain, used + 1, qid);
  return { ok: true };
}

function discard(qid) {
  const draft = drafts.get(qid);
  if (!draft) return { error: t('pending.notFound') };
  drafts.delete(qid);
  deps.log({ kind: 'cancelled', taskId: qid, linkId: draft.id, from: draft.source, to: draft.target, text: t('pending.discarded') });
  deps.emit(draft.id, { state: 'ready', turns: draft.chain.counts.get(draft.key) ?? 0, maxTurns: draft.maxTurns });
  notify();
  return { ok: true };
}

// Message en file annulé avant son collage : il ne partira pas, et son tour est rendu.
// Un message déjà collé ou remis ne se rappelle pas.
function cancel(qid) {
  for (const [target, delivery] of deliveries) {
    if (delivery.item.qid !== qid || delivery.pasted) continue;
    dropPrepared(target, delivery, t('pending.cancelledByUser'));
    return { ok: true };
  }
  for (const [target, queue] of queues) {
    const index = queue.findIndex((item) => item.qid === qid);
    if (index < 0) continue;
    const [item] = queue.splice(index, 1);
    if (!queue.length) queues.delete(target);
    const used = item.chain.counts.get(item.key) ?? 0;
    if (used > 0) item.chain.counts.set(item.key, used - 1);
    item.onFailed?.(t('pending.cancelledByUser'));
    deps.log({ kind: 'cancelled', taskId: item.taskId ?? item.qid, linkId: item.id, from: item.from ?? null, to: target, text: t('pending.cancelledByUser') });
    deps.emit(item.id, { state: 'ready', turns: Math.max(0, used - 1), maxTurns: item.maxTurns });
    notify();
    return { ok: true };
  }
  if ([...deliveries.values()].some((d) => d.item.qid === qid)) return { error: t('pending.alreadyDelivering') };
  return { error: t('pending.notFound') };
}

// Entrée tapée par l'utilisateur dans une case : nouvelle chaîne, compteurs à zéro (affichés sur ses liens).
// Renvoie true si l'ancienne chaîne avait servi (les liens en Délégation remettent aussi leur compteur à zéro).
function onUserInput(id) {
  const used = chains.get(id)?.counts.size > 0;
  chains.set(id, newChain());
  if (!used) return false;
  for (const link of links.get(id) ?? []) deps.emit(link.id, { state: 'ready', turns: 0, maxTurns: link.maxTurns });
  return true;
}

// Statut d'une case : B a fini, on envoie la suite. null = case fermée ou processus terminé.
function onStatus(id, info) {
  if (!info) {
    chains.delete(id);
    failTarget(id, t('link.targetGone'));
  }
  const delivery = deliveries.get(id);
  if (delivery && info?.status === 'working') delivery.working = true;
  // Les cibles sans hooks (réception seule) se libèrent sur leur fin d'activité.
  if (delivery?.submitted && delivery.working && info?.status === 'done' && !delivery.stopping && !delivery.item.onDelivered) release(id, delivery);
  if (!info || info.status === 'idle' || info.status === 'done') flush(id);
}

module.exports = { init, setLinks, onStop, onUserInput, onStatus, enqueue, chainOf, lastReply, pendingList, approve, discard, cancel, READ_DELAY };
