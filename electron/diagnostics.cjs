const { execFile } = require('child_process');

// Diagnostic minimal des intégrations (PLAN.md §7, 3.5) : commande trouvée, version si elle se lit sans
// risque, et dernier hook reçu par case. Aucune requête au modèle ; seuls le nom et l'heure de l'événement
// sont gardés, jamais son contenu.
const VERSION_TIMEOUT = 10000; // ms : Gemini CLI met déjà ~3 s à démarrer
// `--version` n'est lancé que pour ces agents, dont l'option est connue pour seulement afficher la version.
const VERSION_SAFE = ['claude-code', 'codex', 'gemini', 'aider', 'qwen', 'opencode', 'copilot', 'cursor', 'goose', 'amp', 'kimi'];
const VERSION = /\d+\.\d+(?:\.\d+)?(?:[-+.][0-9A-Za-z.-]+)?/;

const launches = new Map(); // case -> heure de lancement de son processus
const hooks = new Map(); // case -> { event, at } : dernier hook reçu depuis ce lancement

function onLaunch(id) {
  launches.set(id, Date.now());
  hooks.delete(id);
}

function onHook(id, event) {
  if (typeof event !== 'string') return;
  hooks.set(id, { event: event.slice(0, 40), at: Date.now() });
}

function forget(id) {
  launches.delete(id);
  hooks.delete(id);
}

// Les .cmd / .bat (npm sous Windows) ont besoin de cmd : une seule ligne, chemin de `where` entre guillemets.
function readVersion(file, run = execFile) {
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(file);
  return new Promise((resolve) => {
    const [command, args] = shell ? [`"${file}" --version`, []] : [file, ['--version']];
    run(command, args, { timeout: VERSION_TIMEOUT, windowsHide: true, shell }, (_error, stdout, stderr) => {
      resolve(`${stdout ?? ''}\n${stderr ?? ''}`.match(VERSION)?.[0]?.slice(0, 40) ?? null);
    });
  });
}

// agents : ceux des paramètres ; test(command) : { ok, message } comme le bouton « Tester ».
async function checkAgents(agents, test, run) {
  return Promise.all(
    agents
      .filter((agent) => agent.command)
      .map(async (agent) => {
        const found = await test(agent.command);
        const base = { id: agent.id, name: agent.name, command: agent.command, hooks: agent.hooks ?? null };
        if (!found.ok) return { ...base, state: 'missing', message: found.message };
        if (!VERSION_SAFE.includes(agent.id)) return { ...base, state: 'found', path: found.message, version: null, versionChecked: false };
        const version = await readVersion(found.message, run);
        return { ...base, state: 'found', path: found.message, version, versionChecked: true };
      }),
  );
}

// Cases lancées : mode de statut, lancement et dernier hook. tiles : [{ id, name, agentId, hooks, boardName }].
function tileStates(tiles) {
  return tiles.map((tile) => ({
    ...tile,
    launchedAt: launches.get(tile.id) ?? null,
    lastHook: tile.hooks ? hooks.get(tile.id) ?? null : null,
  }));
}

module.exports = { onLaunch, onHook, forget, checkAgents, tileStates, readVersion, VERSION_SAFE };
