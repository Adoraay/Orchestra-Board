const fs = require('fs');
const os = require('os');
const path = require('path');
const { mcpServerPath } = require('./claudeHooks.cjs');
const { hookBase, toolUrl } = require('./hookServer.cjs');

// Codex dans Orchestra (PLAN.md §3.16) :
// - profil fixe $CODEX_HOME/orchestra.config.toml (`codex -p orchestra`) avec le serveur MCP « orchestra » ;
//   config.toml de l'utilisateur n'est jamais modifié. Codex enregistre dans ce profil l'approbation des hooks
//   ([hooks.state…]) : on garde tout ce qui suit notre partie ;
// - hooks de statut dans $CODEX_HOME/hooks.json : Codex ne garde pas l'approbation des hooks d'un profil.
//   Chaque commande ne fait rien hors d'Orchestra (garde-fou sur ORCHESTRA_HOOK_URL).
// Ce qui change d'une case à l'autre (adresse et jeton) passe par l'environnement du terminal : les fichiers
// ne changent pas, et l'approbation des hooks dans Codex se fait une seule fois.
const PROFILE = 'orchestra';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PermissionRequest', 'Stop'];
const MARKER = 'ORCHESTRA_HOOK_URL'; // reconnaît les hooks d'Orchestra dans hooks.json

const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const profilePath = () => path.join(codexHome(), `${PROFILE}.config.toml`);
const hooksPath = () => path.join(codexHome(), 'hooks.json');

// Codex lance la commande d'un hook sans shell, après l'avoir découpée comme un shell : cmd (ou sh) lit
// l'adresse de la case dans l'environnement. Aucun guillemet ni & à l'intérieur (ils ne survivent pas au
// découpage). Une commande différente par événement : Codex ne garde qu'un hook quand la même commande revient.
const hookCommand = (event) =>
  process.platform === 'win32'
    ? `cmd /d /s /c "if defined ${MARKER} curl -s -m 3 --data-binary @- %${MARKER}%/${event}"`
    : `sh -c 'if [ -n "$${MARKER}" ]; then curl -s -m 3 --data-binary @- "$${MARKER}/${event}"; fi'`;

const toml = (value) => JSON.stringify(value); // chaîne TOML (mêmes échappements que JSON)

function profileContent() {
  return [
    '# Écrit par Orchestra : serveur MCP des cases Codex lancées depuis Orchestra (codex -p orchestra).',
    '# Ne pas modifier à la main, il est réécrit au démarrage de l\'app.',
    '',
    '[mcp_servers.orchestra]',
    `command = ${toml(process.execPath)}`,
    `args = [${toml(mcpServerPath())}]`,
    'env = { ELECTRON_RUN_AS_NODE = "1" }',
    'env_vars = ["ORCHESTRA_URL"]',
    'default_tools_approval_mode = "approve"',
    'tool_timeout_sec = 330', // wait_for_replies peut attendre 5 min
    '',
    // Codex demande la permission avant de lancer une commande dans un terminal relié (PLAN.md §3.17).
    '[mcp_servers.orchestra.tools.run_in_terminal]',
    'approval_mode = "prompt"',
  ].join('\n') + '\n';
}

function ensureProfile() {
  const current = fs.existsSync(profilePath()) ? fs.readFileSync(profilePath(), 'utf8') : '';
  const kept = current.search(/^\[hooks/m); // approbations des hooks écrites par Codex
  const next = profileContent() + (kept >= 0 ? `\n${current.slice(kept)}` : '');
  if (current === next) return;
  fs.mkdirSync(codexHome(), { recursive: true });
  fs.writeFileSync(profilePath(), next);
}

const isOurs = (handler) => typeof handler?.command === 'string' && handler.command.includes(MARKER);

// hooks.json appartient à l'utilisateur : on ne gère que nos entrées, et on ne réécrit que si elles ont changé
// (une commande identique garde son approbation dans Codex). Fichier illisible : on n'y touche pas.
function ensureHooks() {
  let data = {};
  if (fs.existsSync(hooksPath())) {
    data = JSON.parse(fs.readFileSync(hooksPath(), 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('hooks.json: unexpected format');
  }
  const hooks = data.hooks && typeof data.hooks === 'object' && !Array.isArray(data.hooks) ? data.hooks : {};

  const upToDate = EVENTS.every((event) => {
    const ours = (Array.isArray(hooks[event]) ? hooks[event] : []).flatMap((group) => (group?.hooks ?? []).filter(isOurs));
    return ours.length === 1 && ours[0].command === hookCommand(event);
  }) && Object.keys(hooks).every((event) => EVENTS.includes(event) || !JSON.stringify(hooks[event]).includes(MARKER));
  if (upToDate) return;

  // Nos anciennes entrées retirées partout (groupes et événements vidés supprimés), puis les nouvelles ajoutées.
  const next = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }
    const kept = groups
      .map((group) => (Array.isArray(group?.hooks) ? { ...group, hooks: group.hooks.filter((h) => !isOurs(h)) } : group))
      .filter((group) => !Array.isArray(group?.hooks) || group.hooks.length);
    if (kept.length) next[event] = kept;
  }
  for (const event of EVENTS) {
    next[event] = [...(next[event] ?? []), { hooks: [{ type: 'command', command: hookCommand(event), timeout: 5 }] }];
  }
  fs.mkdirSync(codexHome(), { recursive: true });
  fs.writeFileSync(hooksPath(), JSON.stringify({ ...data, hooks: next }, null, 2) + '\n');
}

// Au démarrage : profil et hooks écrits s'ils manquent ou ont changé (autre dossier d'installation, nouvelle version).
function ensure() {
  for (const [label, write] of [['profil', ensureProfile], ['hooks.json', ensureHooks]]) {
    try {
      write();
    } catch (err) {
      console.error(`[orchestra] Codex ${label} non écrit :`, err.message);
    }
  }
}

// Variables d'environnement du terminal d'une case Codex.
const env = (id) => ({ ORCHESTRA_HOOK_URL: hookBase(id), ORCHESTRA_URL: toolUrl(id) });

module.exports = { PROFILE, ensure, env };
