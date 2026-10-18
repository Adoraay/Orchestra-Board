const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const ptyManager = require('./ptyManager.cjs');
const fsHandlers = require('./fsHandlers.cjs');
const settingsStore = require('./settingsStore.cjs');
const agentsHandlers = require('./agentsHandlers.cjs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1f1e1d', // = --bg de src/theme.css, évite un flash avant le chargement du CSS
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// L'interface envoie seulement l'id de l'agent : la commande à lancer vient des paramètres.
ipcMain.handle('pty:create', (_e, { id, agentId, cwd, cols, rows }) => {
  const settings = settingsStore.load();
  const agent = settings.agents.find((a) => a.id === agentId);
  if (typeof id !== 'string' || !agent) return;
  ptyManager.create(
    { id, command: agent.command, shell: settings.general.shell, cwd, cols, rows },
    (id, data) => send(`pty:data:${id}`, data),
    (id, code) => send(`pty:exit:${id}`, code),
  );
});
ipcMain.on('pty:write', (_e, id, data) => ptyManager.write(id, data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptyManager.resize(id, cols, rows));
ipcMain.on('pty:kill', (_e, id) => ptyManager.kill(id));

fsHandlers.register(() => win);
settingsStore.register();
agentsHandlers.register(() => win);

app.whenReady().then(createWindow);

// Pas de processus orphelins : on tue tous les agents en quittant.
app.on('before-quit', () => ptyManager.killAll());
app.on('window-all-closed', () => app.quit());
