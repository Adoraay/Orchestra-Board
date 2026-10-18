const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, Notification, ipcMain } = require('electron');
const ptyManager = require('./ptyManager.cjs');
const fsHandlers = require('./fsHandlers.cjs');
const settingsStore = require('./settingsStore.cjs');
const agentsHandlers = require('./agentsHandlers.cjs');
const workspaceStore = require('./workspaceStore.cjs');
const hookServer = require('./hookServer.cjs');
const claudeHooks = require('./claudeHooks.cjs');
const agentStatus = require('./agentStatus.cjs');

let win;

// Le projet s'appelait « agent-board » : on reprend une fois ses paramètres, agents et tableaux.
function migrateOldUserData() {
  const current = app.getPath('userData');
  const old = path.join(app.getPath('appData'), 'agent-board');
  if (fs.existsSync(path.join(current, 'settings.json')) || !fs.existsSync(old)) return;
  fs.mkdirSync(current, { recursive: true });
  for (const name of ['settings.json', 'workspace.json', 'logos']) {
    const from = path.join(old, name);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(current, name), { recursive: true });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Orchestra',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'), // barre des tâches (généré par npm run build:icon)
    backgroundColor: '#1f1e1d', // = --bg de src/theme.css, évite un flash avant le chargement du CSS
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Sans menu, plus de raccourci pour les outils de développement : F12 en mode dev.
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// Statut envoyé à la case (pty:status:<id>) et à l'app entière (agent:status), qui gère le son et les
// onglets, y compris pour les cases des tableaux fermés.
function sendStatus(id, info) {
  send(`pty:status:${id}`, info);
  send('agent:status', id, info);
}

// Fenêtre pas au premier plan : notification Windows. Un clic ramène l'app et centre la map sur la case.
function notifyFinished(id, info) {
  if (!settingsStore.load().general.notifyDesktop || !Notification.isSupported()) return;
  if (win && !win.isDestroyed() && win.isFocused()) return;
  const notification = new Notification({
    title: `${info.name} a terminé sa tâche`,
    body: info.cwd ? path.basename(info.cwd) || info.cwd : '',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });
  notification.on('click', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    send('agent:focus', id);
  });
  notification.show();
}

agentStatus.init(sendStatus, notifyFinished);

// Commande à taper dans le shell : celle de l'agent, + reprise de conversation, + hooks pour Claude Code.
function buildCommand(id, agent, resume) {
  if (!agent.command) return null;
  let command = agent.command;
  if (resume && agent.resumeArgs) command += ` ${agent.resumeArgs}`;
  if (agent.hooks === 'claude') command += ` --settings "${claudeHooks.writeSettings(id)}"`;
  return command;
}

// L'interface envoie seulement l'id de l'agent : la commande à lancer vient des paramètres.
// Renvoie { buffer, status } : buffer = dernières sorties si le terminal tournait déjà (case d'un
// autre tableau qu'on rouvre), status = statut actuel de la case.
ipcMain.handle('pty:create', (_e, { id, agentId, cwd, cols, rows, resume }) => {
  const settings = settingsStore.load();
  const agent = settings.agents.find((a) => a.id === agentId);
  if (typeof id !== 'string' || !agent) return null;

  const existing = agentStatus.info(id);
  if (!existing) agentStatus.register(id, agent.hooks === 'claude' ? 'hooks' : 'activity', { name: agent.name, cwd, notify: Boolean(agent.command) });
  const result = ptyManager.create(
    { id, command: existing ? null : buildCommand(id, agent, resume), shell: settings.general.shell, cwd, cols, rows },
    (id, data) => {
      agentStatus.onOutput(id);
      send(`pty:data:${id}`, data);
    },
    (id, code) => {
      agentStatus.unregister(id);
      claudeHooks.removeSettings(id);
      send('agent:status', id, null);
      send(`pty:exit:${id}`, code);
    },
  );
  return { ...result, status: agentStatus.info(id) };
});
ipcMain.on('pty:write', (_e, id, data) => {
  if (typeof data !== 'string') return;
  agentStatus.onInput(id, data);
  ptyManager.write(id, data);
});
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptyManager.resize(id, cols, rows));
ipcMain.on('pty:ack', (_e, id) => agentStatus.acknowledge(id)); // clic sur une case qui a fini
ipcMain.on('pty:kill', (_e, id) => {
  ptyManager.kill(id);
  agentStatus.unregister(id);
  claudeHooks.removeSettings(id);
  send('agent:status', id, null);
});

fsHandlers.register(() => win);
settingsStore.register();
agentsHandlers.register(() => win);
workspaceStore.register();

// Pas de barre de menu File / Edit / View.
Menu.setApplicationMenu(null);
// Identité propre dans la barre des tâches (sinon Windows regroupe la fenêtre sous « Electron »).
app.setAppUserModelId('com.orchestraboard.orchestra');

app.whenReady().then(async () => {
  migrateOldUserData();
  claudeHooks.clearAll();
  await hookServer.start(agentStatus.onHook);
  createWindow();
});

// Pas de processus orphelins : on tue tous les agents en quittant.
app.on('before-quit', () => ptyManager.killAll());
app.on('window-all-closed', () => app.quit());
