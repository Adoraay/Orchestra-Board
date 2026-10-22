const { t } = require('./i18n.cjs');

// Lien Note : un agent relié à un post-it de la map peut le lire et le réécrire (plan, phases, statuts…).
// Outils MCP list_notes, read_note, write_note, appelés via le serveur local comme ceux de la Délégation ;
// chaque appel est vérifié contre les liens de la map. L'écriture ne demande pas de permission : elle est
// sans risque et visible tout de suite sur la map.
const MAX_TEXT = 20000; // = workspaceStore.cjs
const PENDING_FOR = 3000; // ms : une sauvegarde de la map partie avant l'écriture ne doit pas l'effacer

let deps = { write: () => {}, emit: () => {}, log: () => {} };
let notes = new Map(); // id d'un post-it -> { name, text }
let reachable = new Map(); // agent -> [{ id (lien), target }]
const pending = new Map(); // post-it -> { text, at } : écrit par un agent, pas encore revenu dans workspace.json

// write(noteId, text) : met à jour le post-it dans l'interface, emit(linkId, event) : animation du lien,
// log(entrée) : journal des échanges (activityLog).
function init(d) {
  deps = d;
}

// Appelé à chaque sauvegarde de workspace.json (déjà validé), tous tableaux confondus.
function setWorkspace(workspace) {
  notes = new Map();
  reachable = new Map();
  for (const board of workspace.boards) {
    for (const node of board.nodes) {
      if (node.type !== 'note') continue;
      const written = pending.get(node.id);
      const fresh = written && Date.now() - written.at < PENDING_FOR && written.text !== node.data.text;
      if (!fresh) pending.delete(node.id);
      notes.set(node.id, { name: node.data.label || t('note.defaultName'), text: fresh ? written.text : node.data.text });
    }
    for (const edge of board.edges) {
      if (edge.data.mode !== 'note' || !notes.has(edge.target)) continue;
      reachable.set(edge.source, [...(reachable.get(edge.source) ?? []), { id: edge.id, target: edge.target }]);
    }
  }
}

const isTool = (name) => ['list_notes', 'read_note', 'write_note'].includes(name);
const result = (text, isError = false) => ({ text, isError });
const linksOf = (caller) => reachable.get(caller) ?? [];
const normalize = (name) => String(name ?? '').trim().toLowerCase();

function findNote(caller, name) {
  const links = linksOf(caller);
  if (!links.length) return { error: result(t('note.none'), true) };
  const link = links.find((l) => normalize(notes.get(l.target).name) === normalize(name));
  if (!link) {
    const names = links.map((l) => notes.get(l.target).name).join(', ');
    return { error: result(t('note.unknown', { name, names }), true) };
  }
  return { link, note: notes.get(link.target) };
}

function listNotes(caller) {
  const links = linksOf(caller);
  if (!links.length) return result(t('note.none'));
  const lines = links.map((l) => {
    const { name, text } = notes.get(l.target);
    return `- ${name} (${text.trim() ? t('note.lines', { n: text.trim().split('\n').length }) : t('note.empty')})`;
  });
  return result(`${t('note.list')}\n${lines.join('\n')}\n\n${t('note.format')}`);
}

function readNote(caller, { name } = {}) {
  const found = findNote(caller, name);
  if (found.error) return found.error;
  return result(found.note.text.trim() ? found.note.text : `(${t('note.empty')})`);
}

function writeNote(caller, { name, text } = {}) {
  const found = findNote(caller, name);
  if (found.error) return found.error;
  if (typeof text !== 'string') return result(t('note.noText'), true);
  if (text.length > MAX_TEXT) return result(t('note.tooLong', { max: MAX_TEXT }), true);
  const { link, note } = found;
  note.text = text;
  pending.set(link.target, { text, at: Date.now() });
  deps.write(link.target, text);
  deps.emit(link.id, { state: 'sent', to: link.target });
  deps.log({ kind: 'note', linkId: link.id, from: caller, to: link.target, text });
  return result(t('note.written', { name: note.name }));
}

function callTool(caller, name, args) {
  switch (name) {
    case 'list_notes': return listNotes(caller);
    case 'read_note': return readNote(caller, args);
    case 'write_note': return writeNote(caller, args);
  }
}

const nameOf = (id) => notes.get(id)?.name ?? null;

module.exports = { init, setWorkspace, isTool, callTool, nameOf };
