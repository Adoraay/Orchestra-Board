const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('node-pty');

// Un PTY par nœud de la map, indexé par l'id du nœud.
// Il continue de tourner quand on change de tableau ; ses dernières sorties sont gardées
// pour les réafficher quand la case revient à l'écran.
const terminals = new Map(); // id -> { term, buffer }
const MAX_BUFFER = 256 * 1024; // caractères

// Shell choisi dans les paramètres (Général) : { file, args }.
function resolveShell(name) {
  if (process.platform !== 'win32') {
    // macOS / Linux : shell de connexion, comme Terminal.app (profil chargé : PATH de Homebrew, nvm…).
    // PowerShell Windows et cmd n'existent pas ici : shell par défaut de l'utilisateur.
    const file = { pwsh: 'pwsh', bash: '/bin/bash' }[name] ?? (process.env.SHELL || '/bin/bash');
    return { file, args: ['-l'] };
  }
  switch (name) {
    case 'pwsh': return { file: 'pwsh.exe', args: [] };
    case 'cmd': return { file: 'cmd.exe', args: [] };
    case 'bash': {
      // On préfère Git Bash : « bash.exe » tout court lance souvent WSL.
      const gitBash = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
      return { file: fs.existsSync(gitBash) ? gitBash : 'bash.exe', args: [] };
    }
    default:
      return { file: 'powershell.exe', args: [] };
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
// Renvoie { buffer } : vide pour un nouveau terminal, les dernières sorties s'il tournait déjà.
// env : variables ajoutées à celles de l'app (adresse d'Orchestra pour les hooks de Codex).
function create({ id, command, shell, cwd, env, cols = 100, rows = 30 }, onData, onExit) {
  // Déjà lancé (case d'un tableau qu'on rouvre, ou React StrictMode qui monte deux fois).
  if (terminals.has(id)) return { buffer: terminals.get(id).buffer };

  const { file, args } = resolveShell(shell);
  const term = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: safeCwd(cwd),
    env: env ? { ...process.env, ...env } : process.env,
  });

  const entry = { term, buffer: '' };
  term.onData((data) => {
    entry.buffer = (entry.buffer + data).slice(-MAX_BUFFER);
    onData(id, data);
  });
  term.onExit(({ exitCode }) => {
    // Terminal tué puis relancé sous le même id (changement de branche) : la fin de l'ancien ne compte pas.
    if (terminals.get(id) !== entry) return;
    terminals.delete(id);
    onExit(id, exitCode);
  });

  terminals.set(id, entry);

  // On démarre un shell puis on tape la commande de l'agent :
  // le PATH de l'utilisateur est chargé et le terminal reste ouvert si l'agent quitte.
  if (command) setTimeout(() => term.write(command + '\r'), 300);
  return { buffer: '' };
}

function write(id, data) {
  terminals.get(id)?.term.write(data);
}

// Dernières sorties d'un terminal lancé, ou null (outil read_terminal d'un lien Terminal).
const buffer = (id) => terminals.get(id)?.buffer ?? null;

function resize(id, cols, rows) {
  const term = terminals.get(id)?.term;
  if (term && cols > 0 && rows > 0) term.resize(cols, rows);
}

function kill(id) {
  terminals.get(id)?.term.kill();
  terminals.delete(id);
}

function killAll() {
  for (const id of [...terminals.keys()]) kill(id);
}

module.exports = { create, write, buffer, resize, kill, killAll, resolveShell };
