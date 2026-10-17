const os = require('os');
const pty = require('node-pty');
const agents = require('./agents.cjs');

// Un PTY par nœud de la map, indexé par l'id du nœud.
const terminals = new Map();

function defaultShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

function create({ id, agentId, cwd, cols = 100, rows = 30 }, onData, onExit) {
  if (terminals.has(id)) return; // déjà lancé (ex : React StrictMode monte deux fois)

  const term = pty.spawn(defaultShell(), [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || os.homedir(),
    env: process.env,
  });

  term.onData((data) => onData(id, data));
  term.onExit(({ exitCode }) => {
    terminals.delete(id);
    onExit(id, exitCode);
  });

  terminals.set(id, term);

  // On démarre un shell puis on tape la commande de l'agent :
  // le PATH de l'utilisateur est chargé et le terminal reste ouvert si l'agent quitte.
  const command = agents[agentId]?.command;
  if (command) setTimeout(() => term.write(command + '\r'), 300);
}

function write(id, data) {
  terminals.get(id)?.write(data);
}

function resize(id, cols, rows) {
  const term = terminals.get(id);
  if (term && cols > 0 && rows > 0) term.resize(cols, rows);
}

function kill(id) {
  terminals.get(id)?.kill();
  terminals.delete(id);
}

function killAll() {
  for (const id of [...terminals.keys()]) kill(id);
}

module.exports = { create, write, resize, kill, killAll };
