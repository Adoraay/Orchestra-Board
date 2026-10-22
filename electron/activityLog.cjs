const { ipcMain } = require('electron');

// Journal des échanges entre agents (PLAN.md §3.18) : messages passés par les liens, réponses, commandes du
// lien Terminal, refus. Gardé en mémoire seulement : aucune conversation n'est écrite sur le disque.
const MAX_ENTRIES = 500;
const MAX_TEXT = 4000;
const KINDS = ['relay', 'delegate', 'reply', 'command', 'output', 'interrupt', 'refused', 'note'];

let entries = [];
let nextId = 1;
let deps = { nameOf: (id) => id, emit: () => {} };

// nameOf(id d'une case) -> nom affiché, emit(entry) : nouvelle entrée pour l'interface.
function init(d) {
  deps = d;
}

// { kind, linkId, from, to, text } : from et to sont des ids de cases (to facultatif pour un refus).
function add({ kind, linkId = null, from = null, to = null, text = '' }) {
  if (!KINDS.includes(kind)) return;
  const body = String(text);
  const entry = {
    id: nextId++,
    at: Date.now(),
    kind,
    linkId,
    from,
    to,
    fromName: from ? deps.nameOf(from) : null,
    toName: to ? deps.nameOf(to) : null,
    text: body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT)}…` : body,
  };
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  deps.emit(entry);
}

function register() {
  ipcMain.handle('log:get', () => entries);
  ipcMain.handle('log:clear', () => {
    entries = [];
    return entries;
  });
}

module.exports = { init, add, register };
