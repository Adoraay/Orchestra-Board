// Catalogue côté interface : ce qui s'affiche dans la barre de droite.
// L'id doit correspondre à une entrée de electron/agents.cjs.
// Remplace `initials` par un vrai logo (<img>) quand tu en as.
export const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', initials: 'CC', color: '#d97757' },
  { id: 'codex', name: 'Codex', initials: 'CX', color: '#10a37f' },
  { id: 'gemini', name: 'Gemini CLI', initials: 'GE', color: '#4285f4' },
  { id: 'shell', name: 'Terminal', initials: '>_', color: '#8b93a7' },
];

export const agentById = (id) => AGENTS.find((a) => a.id === id);

// Type MIME maison pour le drag & drop depuis la barre.
export const DRAG_TYPE = 'application/agent-board';
