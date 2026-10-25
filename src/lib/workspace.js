// Passage entre l'état d'un tableau et workspace.json (validé côté Node par electron/workspaceStore.cjs).

export function serializeBoard({ nodes, edges, strokes, groups = [], viewport }) {
  return {
    nodes: nodes.map(({ id, type, position, width, height, style, data }) => ({ id, type, position, width, height, style, data })),
    edges: edges.map(({ id, source, target, data }) => ({ id, source, target, data })),
    strokes,
    groups,
    viewport,
  };
}

// Au chargement, les cases terminal sont marquées « restored » : leur agent est relancé à l'ouverture
// du tableau, et ceux qui savent reprendre une conversation proposent de le faire.
export function deserializeBoard(saved) {
  return {
    nodes: saved.nodes.map((n) =>
      n.type === 'terminal' ? { ...n, dragHandle: '.drag-handle', data: { ...n.data, restored: true } } : n,
    ),
    edges: saved.edges,
    strokes: saved.strokes,
    groups: saved.groups ?? [],
    viewport: saved.viewport,
  };
}

export const EMPTY_BOARD = { nodes: [], edges: [], strokes: [], groups: [], viewport: null };
