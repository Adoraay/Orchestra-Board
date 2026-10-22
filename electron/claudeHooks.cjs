const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { hookUrl, toolUrl } = require('./hookServer.cjs');

// Fichiers propres à chaque case Claude Code :
// - <id>.json, passé avec `claude --settings` : hooks qui préviennent Orchestra via curl (fourni avec
//   Windows), qui s'ajoutent à ceux de l'utilisateur, et autorisation des outils d'Orchestra, sauf
//   run_in_terminal : Claude demande la permission avant de lancer une commande (PLAN.md §3.17) ;
// - <id>.mcp.json, passé avec `claude --mcp-config` : le serveur MCP « orchestra » (PLAN.md §3.11).
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop'];
const ORCHESTRA_TOOLS = ['list_agents', 'send_to_agent', 'wait_for_replies', 'list_terminals', 'read_terminal', 'interrupt_terminal', 'list_notes', 'read_note', 'write_note'].map(
  (tool) => `mcp__orchestra__${tool}`,
);

const dir = () => path.join(app.getPath('userData'), 'hooks');
const fileFor = (id) => path.join(dir(), `${id}.json`);
const mcpFileFor = (id) => path.join(dir(), `${id}.mcp.json`);

function writeSettings(id) {
  const command = `curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- "${hookUrl(id)}"`;
  const hook = { hooks: [{ type: 'command', command, timeout: 5 }] };
  const hooks = Object.fromEntries(EVENTS.map((event) => [event, [event === 'PostToolUse' ? { matcher: '*', ...hook } : hook]]));

  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(fileFor(id), JSON.stringify({ hooks, permissions: { allow: ORCHESTRA_TOOLS } }, null, 2));
  return fileFor(id);
}

// Le serveur MCP est lancé avec l'exécutable d'Electron en mode Node : pas besoin de Node installé.
// Dans l'app empaquetée, il est hors de l'archive (app.asar.unpacked) : c'est Claude qui le lance.
const mcpServerPath = () => path.join(__dirname.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked'), 'mcpServer.cjs');

function writeMcpConfig(id) {
  const server = {
    type: 'stdio',
    command: process.execPath,
    args: [mcpServerPath()],
    env: { ELECTRON_RUN_AS_NODE: '1', ORCHESTRA_URL: toolUrl(id) },
  };
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(mcpFileFor(id), JSON.stringify({ mcpServers: { orchestra: server } }, null, 2));
  return mcpFileFor(id);
}

function removeSettings(id) {
  fs.rmSync(fileFor(id), { force: true });
  fs.rmSync(mcpFileFor(id), { force: true });
}

// Au démarrage : les fichiers d'une session précédente contiennent un port et un jeton périmés.
function clearAll() {
  fs.rmSync(dir(), { recursive: true, force: true });
}

module.exports = { writeSettings, writeMcpConfig, removeSettings, clearAll, mcpServerPath };
