// Règles des cases et des liens, partagées par l'interface et le chef d'orchestre (sans import : testées
// telles quelles par tests/board-ops.test.cjs et comparées à la copie de electron/conductor.cjs).

// Nom par défaut d'une nouvelle case : « Claude Code 1 », « Claude Code 2 »… (plus petit numéro libre du tableau).
export function numberedName(base, nodes) {
  const used = new Set(nodes.map((n) => n.data?.label));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// Même identifiant que celui donné par addEdge de React Flow (sans poignées) : un lien en double est ignoré.
export const edgeId = (source, target) => `xy-edge__${source}-${target}`;

const TOOL_CARDS = ['visualTest', 'interactiveBrowser'];

// Lien demandé entre deux cases (dans l'ordre du clic) : { source, target, mode, extra } ou null si impossible.
// hasHooks(agentId) : l'agent a-t-il des hooks (Claude Code, Codex, Antigravity) ?
// - Agent à hooks et case Navigateur ou Test visuel : de l'agent vers la case (liens « browser » et « visual »).
// - Agent et post-it : lien Note, toujours de l'agent vers le post-it ; pas de lien entre deux post-it, ni entre
//   un post-it et une case Terminal.
// - Agent → Terminal : lien Terminal (l'agent y lance ses commandes). Terminal → agent : Transmission de sa sortie.
// - Sinon : le type par défaut. Une Transmission depuis une case sans hooks passe par l'écran du terminal et
//   attend toujours une validation (extra : terminalFallback, review).
export function linkRule(a, b, defaultMode, hasHooks = () => false) {
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
