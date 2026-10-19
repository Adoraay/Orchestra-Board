// Les agents viennent de settings.json (voir electron/settingsStore.cjs).
// Logos des agents de base et du catalogue : src/assets/agents/<id>.svg (ou .png). Logos ajoutés : userData/logos/.
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

// Logos dessinés en couleur claire (#ECE9E2 ou blanc) : inversés en thème Clair (classe light-ink).
const LIGHT_INK_LOGOS = new Set(['codex', 'opencode', 'copilot', 'cursor', 'goose', 'hermes', 'kimi']);

// Ajoute ce qu'il faut pour l'affichage : initiales et URL du logo.
export function decorateAgent(agent, customLogos) {
  const bundled = agent.builtin || agent.catalog;
  const logo = bundled ? builtinLogos[agent.id] : customLogos[agent.logo];
  return {
    ...agent,
    initials: agent.id === 'shell' ? '>_' : initialsOf(agent.name),
    logo,
    lightInk: bundled && LIGHT_INK_LOGOS.has(agent.id),
  };
}

// Case dont l'agent a été supprimé des paramètres (son nom traduit est ajouté par SettingsContext).
export const MISSING_AGENT = { id: 'missing', initials: '?', command: null };

// Type MIME maison pour le drag & drop depuis le dock.
export const DRAG_TYPE = 'application/orchestra-agent';
export const BRANCH_DRAG_TYPE = 'application/orchestra-branch';
