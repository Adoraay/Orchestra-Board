// Les agents viennent de settings.json (voir electron/settingsStore.cjs).
// Logos des agents de base : src/assets/agents/<id>.svg (ou .png). Logos ajoutés : userData/logos/.
const builtinLogos = Object.fromEntries(
  Object.entries(
    import.meta.glob('./assets/agents/*.{svg,png}', { eager: true, import: 'default' }),
  ).map(([path, url]) => [path.split('/').pop().replace(/\.\w+$/, ''), url]),
);

// « Aider Chat » -> « AC », « aider » -> « AI »
function initialsOf(name) {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

// Ajoute ce qu'il faut pour l'affichage : initiales et URL du logo.
export function decorateAgent(agent, customLogos) {
  const logo = agent.builtin ? builtinLogos[agent.id] : customLogos[agent.logo];
  return { ...agent, initials: agent.id === 'shell' ? '>_' : initialsOf(agent.name), logo };
}

// Case dont l'agent a été supprimé des paramètres.
export const MISSING_AGENT = { id: 'missing', name: 'Agent supprimé', initials: '?', command: null };

// Type MIME maison pour le drag & drop depuis le dock.
export const DRAG_TYPE = 'application/agent-board';
