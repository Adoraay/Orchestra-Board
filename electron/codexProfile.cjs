const fs = require('fs');
const os = require('os');
const path = require('path');
const { mcpServerPath } = require('./claudeHooks.cjs');
const { hookUrl, toolUrl } = require('./hookServer.cjs');

// Codex dans Orchestra (PLAN.md §3.11) : un profil fixe, $CODEX_HOME/orchestra.config.toml, que Codex
// superpose à la config de l'utilisateur avec `codex -p orchestra` (config.toml n'est jamais modifié).
// Il déclare le serveur MCP « orchestra » et les hooks de statut. Ce qui change d'une case à l'autre
// (adresse et jeton d'Orchestra) passe par l'environnement du terminal : le contenu du profil ne change
// pas, et Codex ne demande d'approuver ses hooks qu'une seule fois (/hooks).
const PROFILE = 'orchestra';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PermissionRequest', 'Stop'];

const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const profilePath = () => path.join(codexHome(), `${PROFILE}.config.toml`);

// Codex lance la commande d'un hook sans shell : cmd (ou sh) lit l'adresse de la case dans l'environnement.
const HOOK_COMMAND =
  process.platform === 'win32'
    ? 'cmd /d /s /c "curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- "%ORCHESTRA_HOOK_URL%""'
    : 'sh -c \'curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- "$ORCHESTRA_HOOK_URL"\'';

const toml = (value) => JSON.stringify(value); // chaîne TOML (mêmes échappements que JSON)

function content() {
  const lines = [
    '# Écrit par Orchestra : serveur MCP et hooks des cases Codex lancées depuis Orchestra (codex -p orchestra).',
    '# Ne pas modifier à la main, il est réécrit au démarrage de l\'app.',
    '',
    '[mcp_servers.orchestra]',
    `command = ${toml(process.execPath)}`,
    `args = [${toml(mcpServerPath())}]`,
    'env = { ELECTRON_RUN_AS_NODE = "1" }',
    'env_vars = ["ORCHESTRA_URL"]',
    'default_tools_approval_mode = "approve"',
    'tool_timeout_sec = 330', // wait_for_replies peut attendre 5 min
  ];
  for (const event of EVENTS) {
    lines.push('', `[[hooks.${event}]]`, `[[hooks.${event}.hooks]]`, 'type = "command"', `command = ${toml(HOOK_COMMAND)}`, 'timeout = 5');
  }
  return lines.join('\n') + '\n';
}

// Au démarrage : profil écrit s'il manque ou s'il a changé (autre dossier d'installation, nouvelle version).
function ensure() {
  try {
    const next = content();
    const current = fs.existsSync(profilePath()) ? fs.readFileSync(profilePath(), 'utf8') : null;
    if (current === next) return;
    fs.mkdirSync(codexHome(), { recursive: true });
    fs.writeFileSync(profilePath(), next);
  } catch (err) {
    console.error('[orchestra] profil Codex non écrit :', err.message);
  }
}

// Variables d'environnement du terminal d'une case Codex.
const env = (id) => ({ ORCHESTRA_HOOK_URL: hookUrl(id), ORCHESTRA_URL: toolUrl(id) });

module.exports = { PROFILE, ensure, env };
