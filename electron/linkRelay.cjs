const fs = require('fs');
const path = require('path');

// Liens entre agents (PLAN.md §3.5) : quand A a fini (hook Stop de Claude Code), sa dernière réponse
// est envoyée dans le terminal de B avec la consigne du lien.
// Limite de tours : une « chaîne » démarre quand l'utilisateur tape lui-même une consigne (Entrée) ;
// elle suit les messages d'agent en agent et chaque lien ne peut y servir que maxTurns fois.
const READ_DELAY = 400; // ms : au moment du hook Stop, le transcript n'est pas toujours fini d'écrire
const ENTER_DELAY = 250; // ms entre le collage et Entrée, sinon Entrée peut finir dans le collage
const TRANSCRIPT_TAIL = 2 * 1024 * 1024; // octets lus en fin de transcript
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

let deps = { write: () => {}, status: () => null, arm: () => {}, emit: () => {} };
let links = new Map(); // source -> [{ id, source, target, prompt, maxTurns, enabled }]
const chains = new Map(); // case -> { counts: Map(linkId -> envois) }
const queues = new Map(); // case cible -> [{ linkId, text, chain, turns }]

const newChain = () => ({ counts: new Map() });

// write(id, data), status(id) -> statut ou null si pas lancé, arm(id) : la sortie qui suit = travaille,
// emit(linkId, event) : état d'un lien pour l'interface.
function init(d) {
  deps = d;
}

// Appelé à chaque sauvegarde de workspace.json (déjà validé), tous tableaux confondus.
function setLinks(workspace) {
  links = new Map();
  for (const board of workspace.boards) {
    for (const edge of board.edges) {
      const list = links.get(edge.source) ?? [];
      list.push({ id: edge.id, source: edge.source, target: edge.target, ...edge.data });
      links.set(edge.source, list);
    }
  }
}

const findLink = (id) => [...links.values()].flat().find((l) => l.id === id);

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
  return template.includes('{reponse}') ? template.replaceAll('{reponse}', reply) : `${template}\n\n${reply}`.trim();
}

// Collage entre crochets (le CLI le reçoit comme un collage, pas comme une frappe), puis Entrée à part.
function deliver(target, item) {
  const link = findLink(item.linkId);
  if (!link || !link.enabled || !link.prompt.trim()) return;
  chains.set(target, item.chain);
  deps.write(target, PASTE_START + item.text.replace(/\r?\n/g, '\r') + PASTE_END);
  setTimeout(() => {
    deps.arm(target);
    deps.write(target, '\r');
  }, ENTER_DELAY);
  deps.emit(link.id, { state: 'sent', turns: item.turns, maxTurns: link.maxTurns });
}

// B travaille ou attend une permission : on garde le message pour quand il aura fini.
// Jamais de collage dans une demande de permission.
function flush(target) {
  const queue = queues.get(target);
  if (!queue?.length) return;
  const status = deps.status(target);
  if (!status) {
    queues.delete(target);
    for (const item of queue) deps.emit(item.linkId, { state: 'error', message: "L'agent cible n'est plus lancé" });
    return;
  }
  if (status === 'working' || status === 'waiting') {
    for (const item of queue) deps.emit(item.linkId, { state: 'queued', turns: item.turns, maxTurns: findLink(item.linkId)?.maxTurns });
    return;
  }
  // Un message à la fois : le suivant part quand B aura fini de traiter celui-ci.
  deliver(target, queue.shift());
  if (!queue.length) queues.delete(target);
}

function onStop(id, payload) {
  if (!deps.status(id)) return;
  const outgoing = (links.get(id) ?? []).filter((l) => l.enabled && l.prompt.trim());
  if (!outgoing.length) return;
  const chain = chains.get(id) ?? newChain();
  chains.set(id, chain);

  setTimeout(() => {
    const reply = lastReply(payload);
    for (const link of outgoing) {
      if (!reply) {
        deps.emit(link.id, { state: 'error', message: 'Réponse introuvable dans le transcript' });
        continue;
      }
      const used = chain.counts.get(link.id) ?? 0;
      if (used >= link.maxTurns) {
        deps.emit(link.id, { state: 'limit', turns: used, maxTurns: link.maxTurns });
        continue;
      }
      if (!deps.status(link.target)) {
        deps.emit(link.id, { state: 'error', message: "L'agent cible n'est pas lancé" });
        continue;
      }
      chain.counts.set(link.id, used + 1);
      const queue = queues.get(link.target) ?? [];
      queue.push({ linkId: link.id, text: buildText(link.prompt, reply), chain, turns: used + 1 });
      queues.set(link.target, queue);
      flush(link.target);
    }
  }, READ_DELAY);
}

// Entrée tapée par l'utilisateur dans une case : nouvelle chaîne, compteurs à zéro (affichés sur ses liens).
function onUserInput(id) {
  const used = chains.get(id)?.counts.size > 0;
  chains.set(id, newChain());
  if (!used) return;
  for (const link of links.get(id) ?? []) deps.emit(link.id, { state: 'ready', turns: 0, maxTurns: link.maxTurns });
}

// Statut d'une case : B a fini, on envoie la suite. null = case fermée ou processus terminé.
function onStatus(id, info) {
  if (!info) chains.delete(id);
  if (!info || info.status === 'idle' || info.status === 'done') flush(id);
}

module.exports = { init, setLinks, onStop, onUserInput, onStatus };
