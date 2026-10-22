const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, Menu, Notification, ipcMain, shell } = require('electron');
const ptyManager = require('./ptyManager.cjs');
const fsHandlers = require('./fsHandlers.cjs');
const settingsStore = require('./settingsStore.cjs');
const agentsHandlers = require('./agentsHandlers.cjs');
const workspaceStore = require('./workspaceStore.cjs');
const hookServer = require('./hookServer.cjs');
const claudeHooks = require('./claudeHooks.cjs');
const claudeTrust = require('./claudeTrust.cjs');
const codexProfile = require('./codexProfile.cjs');
const agentStatus = require('./agentStatus.cjs');
const gitHandlers = require('./git.cjs');
const linkRelay = require('./linkRelay.cjs');
const delegation = require('./delegation.cjs');
const terminalLink = require('./terminalLink.cjs');
const noteLink = require('./noteLink.cjs');
const activityLog = require('./activityLog.cjs');
const usage = require('./usage.cjs');
const shellEnv = require('./shellEnv.cjs');
const { t } = require('./i18n.cjs');

let win;
let quitConfirmed = false;

// Couleurs de la zone des boutons Windows (réduire, agrandir, fermer) = fond et texte de la barre du haut.
const TITLE_BAR_HEIGHT = 40;
const isMac = process.platform === 'darwin';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Le projet s'appelait « agent-board » : on reprend une fois ses paramètres, agents et tableaux.
// Une seule fois (fichier témoin) : sans settings.json plus tard (fichier supprimé ou renommé), Orchestra
// repart à neuf au lieu de réimporter les anciennes données.
function migrateOldUserData() {
  const current = app.getPath('userData');
  const old = path.join(app.getPath('appData'), 'agent-board');
  const marker = path.join(current, 'agent-board-imported');
  if (fs.existsSync(marker)) return;
  fs.mkdirSync(current, { recursive: true });
  if (!fs.existsSync(path.join(current, 'settings.json')) && fs.existsSync(old)) {
    for (const name of ['settings.json', 'workspace.json', 'logos']) {
      const from = path.join(old, name);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(current, name), { recursive: true });
    }
  }
  fs.writeFileSync(marker, '');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Orchestra',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'), // barre des tâches (généré par npm run build:icon)
    backgroundColor: '#262624', // = fond de l'écran de démarrage (splash.css) : aucun flash au lancement
    show: false, // affichée quand la page est prête, pour ne jamais montrer une fenêtre vide
    // Une seule barre en haut : celle de l'app, avec les boutons Windows dessinés par-dessus à droite,
    // ou les feux tricolores de macOS centrés dans la barre, à gauche (place réservée dans styles.css).
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 14 } }
      : { titleBarOverlay: { color: '#262624', symbolColor: '#ece9e2', height: TITLE_BAR_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Avec titleBarOverlay, ready-to-show n'arrive pas toujours (fenêtre jamais affichée) : on montre aussi la
  // fenêtre quand la page est chargée. Pas de flash : son fond est déjà celui de l'écran de démarrage.
  const showOnce = () => !win.isDestroyed() && !win.isVisible() && win.show();
  win.once('ready-to-show', showOnce);
  win.webContents.once('did-finish-load', showOnce);
  win.on('close', confirmQuit);

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

// Fermer la fenêtre pendant qu'un agent travaille (ou attend une permission) : l'interface demande d'abord
// (app:confirmQuit avec la liste des agents), puis répond par app:quit.
function confirmQuit(event) {
  if (quitConfirmed || !settingsStore.load().general.confirmClose) return;
  const agents = agentStatus.busy();
  if (!agents.length) return;
  event.preventDefault();
  send('app:confirmQuit', agents);
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// Statut envoyé à la case (pty:status:<id>) et à l'app entière (agent:status), qui gère le son et les
// onglets, y compris pour les cases des tableaux fermés.
function sendStatus(id, info) {
  send(`pty:status:${id}`, info);
  send('agent:status', id, info);
  relayStatus(id, info);
}

// Liens entre agents : une case libérée reçoit la suite de sa file, une case fermée n'est plus attendue.
function relayStatus(id, info) {
  linkRelay.onStatus(id, info);
  delegation.onStatus(id, info);
}

// Fenêtre pas au premier plan : notification Windows. Un clic ramène l'app et centre la map sur la case.
function notifyFinished(id, info) {
  if (!settingsStore.load().general.notifyDesktop || !Notification.isSupported()) return;
  if (win && !win.isDestroyed() && win.isFocused()) return;
  const notification = new Notification({
    title: t('notify.finished', { name: info.name }),
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
activityLog.init({
  nameOf: (id) => agentStatus.info(id)?.name || noteLink.nameOf(id) || id,
  emit: (entry) => send('log:entry', entry),
});

linkRelay.init({
  log: activityLog.add,
  write: ptyManager.write,
  status: (id) => agentStatus.info(id)?.status ?? null,
  arm: agentStatus.arm,
  emit: (linkId, event) => send('link:event', linkId, event),
});

delegation.init({
  log: activityLog.add,
  info: agentStatus.info,
  agent: (agentId) => settingsStore.findAgent(settingsStore.load(), agentId) ?? { name: t('agent.missing'), hooks: null },
  emit: (linkId, event) => send('link:event', linkId, event),
});

terminalLink.init({
  log: activityLog.add,
  write: ptyManager.write,
  buffer: ptyManager.buffer,
  info: agentStatus.info,
  arm: agentStatus.arm,
  emit: (linkId, event) => send('link:event', linkId, event),
});

noteLink.init({
  log: activityLog.add,
  write: (id, text) => send('note:write', id, text),
  emit: (linkId, event) => send('link:event', linkId, event),
});

// Outils du serveur MCP d'une case : lien Note, lien Terminal ou Délégation.
function callTool(caller, name, args, signal) {
  if (noteLink.isTool(name)) return noteLink.callTool(caller, name, args);
  if (!terminalLink.isTool(name)) return delegation.callTool(caller, name, args, signal);
  if (!agentStatus.info(caller)) return { text: t('delegate.callerNotRunning'), isError: true };
  return terminalLink.callTool(caller, name, args, signal);
}

// Rôle de chaque case (PLAN.md §3.19), mis à jour à chaque sauvegarde de workspace.json.
let roles = new Map();

// Conversation de chaque case où l'utilisateur a déjà écrit, pendant ce lancement de l'app : une relance
// (après un rôle) reprend celle-ci, pas la dernière du dossier (--continue), et rien si elle est encore vide.
const sessions = new Map(); // case -> session_id
const launched = new Set(); // cases déjà lancées depuis le démarrage de l'app
const SESSION_ID = /^[0-9a-f-]{8,64}$/i;

function trackSession(id, payload) {
  const session = SESSION_ID.test(payload.session_id ?? '') ? payload.session_id : null;
  if (payload.hook_event_name === 'UserPromptSubmit' && session) sessions.set(id, session);
  if (payload.hook_event_name !== 'SessionStart') return;
  if (payload.source === 'resume' && session) sessions.set(id, session);
  else if (payload.source === 'startup' || payload.source === 'clear') sessions.delete(id);
}

// Événements des hooks de Claude Code et Codex : statut de la case, et transmission par ses liens quand il a
// fini (Transmission automatique, ou réponse attendue par un agent qui lui a délégué un message).
// Début de session : la réponse au hook dit à l'agent qu'il tourne dans Orchestra et lui donne son rôle
// (même format pour Claude Code et Codex). Ce contexte n'est pas affiché dans le terminal.
function onHook(id, payload) {
  agentStatus.onHook(id, payload);
  trackSession(id, payload);
  if (payload.hook_event_name === 'SessionStart') {
    const parts = [t('orchestra.context')];
    if (roles.has(id)) parts.push(t('role.context', { role: roles.get(id) }));
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } };
  }
  if (payload.hook_event_name !== 'Stop') return;
  linkRelay.onStop(id, payload);
  delegation.onStop(id, payload);
}

// Nom d'une case choisi dans l'interface (double-clic sur son titre).
const cleanName = (name) => (typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null);

// Reprise : la conversation de la case si on la connaît, sinon la dernière du dossier, mais seulement
// au premier lancement de la case (redémarrage de l'app) : une case relancée sans conversation repart à neuf.
function resumeArgs(id, agent, resume) {
  if (!resume) return '';
  const session = sessions.get(id);
  if (session && agent.hooks === 'claude') return ` --resume ${session}`;
  if (session && agent.hooks === 'codex') return ` resume ${session}`;
  if (launched.has(id) || !agent.resumeArgs) return '';
  return ` ${agent.resumeArgs}`;
}

// Commande à taper dans le shell : celle de l'agent, + profil Orchestra pour Codex, + reprise de conversation, + modèle choisi,
// + hooks et serveur MCP pour Claude Code.
function buildCommand(id, agent, resume, model) {
  if (!agent.command) return null;
  let command = agent.command;
  if (agent.hooks === 'codex') command += ` -p ${codexProfile.PROFILE}`;
  command += resumeArgs(id, agent, resume);
  // Après la reprise : « codex resume » prend aussi -m.
  if (typeof model === 'string' && settingsStore.MODEL.test(model)) {
    if (agent.hooks === 'claude') command += ` --model ${model}`;
    if (agent.hooks === 'codex') command += ` -m ${model}`;
  }
  if (agent.hooks === 'claude') {
    command += ` --settings "${claudeHooks.writeSettings(id)}" --mcp-config "${claudeHooks.writeMcpConfig(id)}"`;
  }
  return command;
}

// L'interface envoie seulement l'id de l'agent : la commande à lancer vient des paramètres.
// Renvoie { buffer, status } : buffer = dernières sorties si le terminal tournait déjà (case d'un
// autre tableau qu'on rouvre), status = statut actuel de la case.
ipcMain.handle('pty:create', (_e, { id, agentId, cwd, label, cols, rows, resume, model }) => {
  const settings = settingsStore.load();
  const agent = settingsStore.findAgent(settings, agentId);
  if (typeof id !== 'string' || !agent) return null;

  const existing = agentStatus.info(id);
  if (!existing && agent.hooks === 'claude' && settings.general.trustFolders) claudeTrust.trustFolder(cwd);
  if (!existing) {
    agentStatus.register(id, agent.hooks ? 'hooks' : 'activity', { name: cleanName(label) ?? agent.name, cwd, notify: Boolean(agent.command) });
    send('agent:status', id, agentStatus.info(id)); // la barre des agents actifs le voit tout de suite
  }
  const result = ptyManager.create(
    {
      id,
      command: existing ? null : buildCommand(id, agent, resume, model),
      shell: settings.general.shell,
      cwd,
      env: agent.hooks === 'codex' ? codexProfile.env(id) : null,
      cols,
      rows,
    },
    (id, data) => {
      agentStatus.onOutput(id);
      terminalLink.onOutput(id, data);
      send(`pty:data:${id}`, data);
    },
    (id, code) => {
      agentStatus.unregister(id);
      claudeHooks.removeSettings(id);
      send('agent:status', id, null);
      send(`pty:exit:${id}`, code);
      relayStatus(id, null);
    },
  );
  launched.add(id);
  return { ...result, status: agentStatus.info(id) };
});
ipcMain.on('pty:write', (_e, id, data) => {
  if (typeof data !== 'string') return;
  agentStatus.onInput(id, data);
  if (!data.startsWith('\x1b') && data.includes('\r')) {
    // Consigne tapée à la main : nouvelle chaîne, compteurs de tours à zéro.
    if (linkRelay.onUserInput(id)) delegation.resetCounters(id);
  }
  ptyManager.write(id, data);
});
ipcMain.on('pty:resize', (_e, id, cols, rows) => ptyManager.resize(id, cols, rows));
ipcMain.on('pty:ack', (_e, id) => agentStatus.acknowledge(id)); // clic sur une case qui a fini
ipcMain.on('pty:rename', (_e, id, name) => {
  const clean = cleanName(name);
  if (!clean || !agentStatus.info(id)) return;
  agentStatus.rename(id, clean); // nom repris par la notification Windows et la barre des agents actifs
  send('agent:status', id, agentStatus.info(id));
});
ipcMain.on('pty:kill', (_e, id) => {
  ptyManager.kill(id);
  agentStatus.unregister(id);
  claudeHooks.removeSettings(id);
  send('agent:status', id, null);
  relayStatus(id, null);
});

// Réponse à app:confirmQuit : « Quitter quand même ».
// Section « À propos » des paramètres : version de l'app et liens du projet. L'interface envoie un nom de
// lien, jamais une adresse : seules ces pages peuvent s'ouvrir dans le navigateur.
const ABOUT_LINKS = {
  author: 'https://github.com/Adoraay',
  repo: 'https://github.com/Adoraay/Orchestra-Board',
  issues: 'https://github.com/Adoraay/Orchestra-Board/issues/new/choose',
};
ipcMain.handle('about:info', () => ({ version: app.getVersion() }));
ipcMain.on('about:open', (_e, key) => {
  if (Object.hasOwn(ABOUT_LINKS, key)) shell.openExternal(ABOUT_LINKS[key]);
});

ipcMain.on('app:quit', () => {
  if (!win || win.isDestroyed()) return;
  quitConfirmed = true;
  win.close();
});
// Thème changé : la zone des boutons Windows reprend les couleurs de la barre du haut.
ipcMain.on('window:titleBarColors', (_e, color, symbolColor) => {
  if (isMac || !win || win.isDestroyed() || !HEX_COLOR.test(color) || !HEX_COLOR.test(symbolColor)) return;
  win.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
});

// Dossiers des cases de la map (tous tableaux) : l'explorateur refuse de les renommer ou supprimer.
let usedFolders = [];
fsHandlers.register(() => win, {
  usedFolders: () => usedFolders,
  root: () => settingsStore.load().general.rootPath ?? os.homedir(),
});
settingsStore.register();
agentsHandlers.register(() => win);
workspaceStore.register((workspace) => {
  usedFolders = workspace.boards.flatMap((b) =>
    b.nodes
      .filter((n) => n.type === 'terminal')
      .flatMap((n) => [n.data.cwd, n.data.worktree].filter(Boolean).map((p) => ({ path: p, name: n.data.label || n.data.agentId }))),
  );
  linkRelay.setLinks(workspace);
  delegation.setWorkspace(workspace);
  roles = new Map(workspace.boards.flatMap((b) => b.nodes.filter((n) => n.data.role).map((n) => [n.id, n.data.role])));
  terminalLink.setWorkspace(workspace, (agentId) => settingsStore.load().agents.find((a) => a.id === agentId)?.name ?? agentId);
  noteLink.setWorkspace(workspace);
});
gitHandlers.register();
usage.register();
activityLog.register();

// Pas de barre de menu File / Edit / View. macOS garde toujours un menu : le strict nécessaire, dont Édition
// pour Cmd+C / Cmd+V / Cmd+A dans les champs et les terminaux, et Cmd+Q / Cmd+H.
Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
// Identité propre dans la barre des tâches (sinon Windows regroupe la fenêtre sous « Electron »).
app.setAppUserModelId('com.orchestraboard.orchestra');

// Une seule instance : un deuxième lancement ramène la fenêtre existante (même cachée) au lieu d'ouvrir
// une app de plus qui réécrirait les mêmes fichiers.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(async () => {
  if (!isFirstInstance) return;
  migrateOldUserData();
  await shellEnv.loadLoginPath();
  claudeHooks.clearAll();
  await hookServer.start(onHook, callTool);
  codexProfile.ensure();
  createWindow();
});

// Pas de processus orphelins : on tue tous les agents en quittant. will-quit et pas before-quit : Cmd+Q sur
// Mac passe par before-quit avant la fenêtre « Quitter Orchestra ? », qui peut encore tout annuler.
app.on('will-quit', () => {
  ptyManager.killAll();
  usage.stop();
});
app.on('window-all-closed', () => app.quit());
