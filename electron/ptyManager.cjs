const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('node-pty');

// Un PTY par nœud de la map, indexé par l'id du nœud.
const terminals = new Map();

// Shell choisi dans les paramètres (Général).
function resolveShell(name) {
  const win = process.platform === 'win32';
  switch (name) {
    case 'powershell': return 'powershell.exe';
    case 'pwsh': return win ? 'pwsh.exe' : 'pwsh';
    case 'cmd': return 'cmd.exe';
    case 'bash': {
      // Sous Windows on préfère Git Bash : « bash.exe » tout court lance souvent WSL.
      const gitBash = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
      if (win) return fs.existsSync(gitBash) ? gitBash : 'bash.exe';
      return '/bin/bash';
    }
    default:
      return win ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
  }
}

// Le dossier vient de l'interface : on vérifie qu'il existe, sinon dossier personnel.
function safeCwd(cwd) {
  try {
    if (typeof cwd === 'string' && path.isAbsolute(cwd) && fs.statSync(cwd).isDirectory()) return cwd;
  } catch {}
  return os.homedir();
}

// command et shell viennent des paramètres, lus côté Node (jamais envoyés par l'interface).
function create({ id, command, shell, cwd, cols = 100, rows = 30 }, onData, onExit) {
  if (terminals.has(id)) return; // déjà lancé (ex : React StrictMode monte deux fois)

  const term = pty.spawn(resolveShell(shell), [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: safeCwd(cwd),
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
