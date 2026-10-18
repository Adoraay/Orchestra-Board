const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { hookUrl } = require('./hookServer.cjs');

// Fichier de réglages propre à chaque case Claude Code, passé avec `claude --settings <fichier>`.
// Ses hooks s'ajoutent à ceux de l'utilisateur et préviennent Orchestra via curl (fourni avec Windows).
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop'];

const dir = () => path.join(app.getPath('userData'), 'hooks');
const fileFor = (id) => path.join(dir(), `${id}.json`);

function writeSettings(id) {
  const command = `curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- "${hookUrl(id)}"`;
  const hook = { hooks: [{ type: 'command', command, timeout: 5 }] };
  const hooks = Object.fromEntries(EVENTS.map((event) => [event, [event === 'PostToolUse' ? { matcher: '*', ...hook } : hook]]));

  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(fileFor(id), JSON.stringify({ hooks }, null, 2));
  return fileFor(id);
}

function removeSettings(id) {
  fs.rmSync(fileFor(id), { force: true });
}

// Au démarrage : les fichiers d'une session précédente contiennent un port et un jeton périmés.
function clearAll() {
  fs.rmSync(dir(), { recursive: true, force: true });
}

module.exports = { writeSettings, removeSettings, clearAll };
