// Après npm install (postinstall) : sur macOS, node-pty lance ses terminaux via prebuilds/darwin-*/spawn-helper,
// qui arrive parfois sans le droit d'exécution (« posix_spawnp failed »). Sans effet sous Windows.
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') {
  const prebuilds = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
  for (const dir of fs.existsSync(prebuilds) ? fs.readdirSync(prebuilds) : []) {
    const helper = path.join(prebuilds, dir, 'spawn-helper');
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
}
