const os = require('os');
const { execFile } = require('child_process');

// macOS : une app ouverte depuis le Finder ou le Dock reçoit un PATH minimal (/usr/bin:/bin…), sans Homebrew,
// npm ni nvm : claude, codex et le bouton « Tester » ne trouveraient rien. On reprend au démarrage le PATH du
// shell de connexion de l'utilisateur. Sans effet sous Windows.
const MARK = '__ORCHESTRA_PATH__';

function loadLoginPath() {
  if (process.platform !== 'darwin') return Promise.resolve();
  if (!process.env.SHELL) process.env.SHELL = os.userInfo().shell || '/bin/zsh';
  return new Promise((resolve) => {
    execFile(process.env.SHELL, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 5000 }, (_error, stdout) => {
      const found = typeof stdout === 'string' ? stdout.split(MARK)[1] : null;
      if (found) process.env.PATH = found;
      resolve();
    });
  });
}

module.exports = { loadLoginPath };
