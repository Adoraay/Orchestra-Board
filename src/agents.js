// Catalogue côté interface : ce qui s'affiche dans le dock.
// L'id doit correspondre à une entrée de electron/agents.cjs.
// Logo : déposer src/assets/agents/<id>.svg (ou .png). Sans fichier, on affiche les initiales.
const logos = Object.fromEntries(
  Object.entries(
    import.meta.glob('./assets/agents/*.{svg,png}', { eager: true, import: 'default' }),
  ).map(([path, url]) => [path.split('/').pop().replace(/\.\w+$/, ''), url]),
);

export const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', initials: 'CC', color: '#d97757' },
  { id: 'codex', name: 'Codex', initials: 'CX', color: '#10a37f' },
  { id: 'gemini', name: 'Gemini CLI', initials: 'GE', color: '#4285f4' },
  { id: 'shell', name: 'Terminal', initials: '>_', color: '#8b93a7' },
].map((agent) => ({ ...agent, logo: logos[agent.id] }));

export const agentById = (id) => AGENTS.find((a) => a.id === id);

// Type MIME maison pour le drag & drop depuis le dock.
export const DRAG_TYPE = 'application/agent-board';
