// Règles des cases et des liens, partagées par l'interface et le chef d'orchestre (sans import : testées
// telles quelles par tests/board-ops.test.cjs).

// Nom par défaut d'une nouvelle case : « Claude Code 1 », « Claude Code 2 »… (plus petit numéro libre du tableau).
export function numberedName(base, nodes) {
  const used = new Set(nodes.map((n) => n.data?.label));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// Même identifiant que celui donné par addEdge de React Flow (sans poignées) : un lien en double est ignoré.
export const edgeId = (source, target) => `xy-edge__${source}-${target}`;

// Lien demandé entre deux cases (dans l'ordre du clic) : { source, target, mode } ou null si impossible.
// Agent et post-it : lien Note, toujours de l'agent vers le post-it ; pas de lien entre deux post-it, ni entre
// un post-it et une case Terminal. Agent et case Terminal : lien Terminal, toujours vers le terminal (PLAN.md §3.17).
// Sinon : le type par défaut des nouveaux liens.
export function linkRule(a, b, defaultMode) {
  if (!a || !b || a.id === b.id) return null;
  const linkable = (n) => n.type === 'terminal' || n.type === 'note';
  if (!linkable(a) || !linkable(b)) return null;
  const isNote = (n) => n.type === 'note';
  if (isNote(a) || isNote(b)) {
    const [agent, note] = isNote(b) ? [a, b] : [b, a];
    if (isNote(agent) || agent.data?.agentId === 'shell') return null;
    return { source: agent.id, target: note.id, mode: 'note' };
  }
  const isShell = (n) => n.data?.agentId === 'shell';
  const terminal = isShell(a) !== isShell(b);
  const [source, target] = terminal && isShell(a) ? [b.id, a.id] : [a.id, b.id];
  return { source, target, mode: terminal ? 'terminal' : defaultMode };
}
