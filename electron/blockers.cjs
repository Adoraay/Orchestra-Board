const { randomUUID } = require('crypto');

// Les permissions actives ne sont jamais écartées par le nettoyage des événements résolus.
function createBlockers(emit = () => {}) {
  const entries = new Map();
  let cases = new Map();
  let links = new Map();
  const snapshot = () => [...entries.values()].map((entry) => ({ ...entry, ...(cases.get(entry.caseId) ?? {}), navigable: cases.has(entry.caseId) })).sort((a, b) => b.updatedAt - a.updatedAt);
  const changed = () => {
    const resolved = [...entries.values()].filter((entry) => entry.resolved).sort((a, b) => a.updatedAt - b.updatedAt);
    while (entries.size > 200 && resolved.length) entries.delete(resolved.shift().key);
    emit(snapshot());
  };

  function open(key, kind, caseId, text = '') {
    const previous = entries.get(key);
    if (previous && !previous.resolved && previous.kind === kind && previous.text === text && previous.caseId === caseId) return;
    const at = Date.now();
    entries.set(key, { id: previous?.id ?? randomUUID(), key, kind, caseId, ...(cases.get(caseId) ?? {}), text: String(text).slice(0, 1000), createdAt: previous?.createdAt ?? at, updatedAt: at, resolved: false });
    changed();
  }

  function resolve(key) {
    const entry = entries.get(key);
    if (!entry || entry.resolved) return;
    entry.resolved = true;
    entry.updatedAt = Date.now();
    changed();
  }

  function setWorkspace(workspace) {
    cases = new Map(); links = new Map();
    for (const board of workspace.boards) {
      for (const node of board.nodes) cases.set(node.id, { name: node.data.label || node.data.agentId || node.id, boardId: board.id, boardName: board.name });
      for (const edge of board.edges) links.set(edge.id, edge);
    }
    for (const entry of entries.values()) {
      if (!cases.has(entry.caseId) || (entry.key.startsWith('link:') && !links.has(entry.key.slice(5)))) {
        entry.resolved = true;
      }
    }
    changed();
  }

  function onStatus(id, info) {
    if (info?.status === 'waiting') open(`permission:${id}`, 'permission', id);
    else resolve(`permission:${id}`);
    if (info) resolve(`exit:${id}`);
  }

  function onLink(id, event) {
    const link = links.get(id);
    if (event.state === 'limit' || event.state === 'error') {
      const old = entries.get(`link:${id}`);
      open(`link:${id}`, event.state === 'limit' ? 'limit' : 'refused', link?.source ?? event.to, event.message || old?.text || '');
    } else if (['sent', 'ready'].includes(event.state)) resolve(`link:${id}`);
  }

  function onLog(entry) {
    if (entry.kind !== 'refused') return;
    const key = entry.linkId ? `link:${entry.linkId}` : `refused:${entry.from}:${entry.to}`;
    const kind = entries.get(key)?.kind === 'limit' ? 'limit' : 'refused';
    open(key, kind, entry.from ?? entry.to, entry.text);
  }

  function clearResolved() {
    for (const [key, entry] of entries) if (entry.resolved) entries.delete(key);
    changed();
  }

  return { snapshot, setWorkspace, onStatus, onLink, onLog, clearResolved,
    onExit: (id, code) => open(`exit:${id}`, 'exit', id, String(code)) };
}

module.exports = { createBlockers };
