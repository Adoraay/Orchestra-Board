const { contextBridge, ipcRenderer } = require('electron');

// Seule porte entre l'interface (React) et le système.
contextBridge.exposeInMainWorld('fs', {
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  homeDir: () => ipcRenderer.invoke('fs:homeDir'),
  pickFolder: (defaultPath) => ipcRenderer.invoke('dialog:pickFolder', defaultPath),
  createFolder: (parent, name) => ipcRenderer.invoke('fs:createFolder', parent, name),
  rename: (target, name) => ipcRenderer.invoke('fs:rename', target, name),
  summary: (target) => ipcRenderer.invoke('fs:summary', target),
  trash: (target) => ipcRenderer.invoke('fs:trash', target),
  reveal: (target) => ipcRenderer.invoke('fs:reveal', target),
});

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (settings) => ipcRenderer.invoke('settings:set', settings),
});

contextBridge.exposeInMainWorld('agents', {
  logos: () => ipcRenderer.invoke('agents:logos'),
  pickLogo: (agentId) => ipcRenderer.invoke('agents:pickLogo', agentId),
  deleteLogo: (file) => ipcRenderer.invoke('agents:deleteLogo', file),
  testCommand: (command) => ipcRenderer.invoke('agents:testCommand', command),
  catalog: () => ipcRenderer.invoke('agents:catalog'),
});

contextBridge.exposeInMainWorld('workspace', {
  get: () => ipcRenderer.invoke('workspace:get'),
  set: (workspace) => ipcRenderer.invoke('workspace:set', workspace),
  saveSync: (workspace) => ipcRenderer.sendSync('workspace:saveSync', workspace),
});

contextBridge.exposeInMainWorld('git', {
  isRepo: (cwd) => ipcRenderer.invoke('git:isRepo', cwd),
  listBranches: (cwd, fetch) => ipcRenderer.invoke('git:listBranches', cwd, fetch),
  ensureWorktree: (cwd, branch) => ipcRenderer.invoke('git:ensureWorktree', cwd, branch),
  changes: (cwd) => ipcRenderer.invoke('git:changes', cwd),
  diff: (cwd, file) => ipcRenderer.invoke('git:diff', cwd, file),
  openInEditor: (cwd, file) => ipcRenderer.invoke('git:openInEditor', cwd, file),
});

// Utilisation (quotas) de Claude Code et Codex. refresh(agentId, force) peut lancer un /usage invisible.
contextBridge.exposeInMainWorld('usage', {
  get: (agentId) => ipcRenderer.invoke('usage:get', agentId),
  refresh: (agentId, force) => ipcRenderer.invoke('usage:refresh', agentId, force === true),
});

// État des liens entre agents : envoyé, en attente, limite atteinte, erreur.
contextBridge.exposeInMainWorld('links', {
  onEvent: (cb) => {
    const listener = (_e, linkId, event) => cb(linkId, event);
    ipcRenderer.on('link:event', listener);
    return () => ipcRenderer.removeListener('link:event', listener);
  },
});

// Journal des échanges entre agents (PLAN.md §3.18).
contextBridge.exposeInMainWorld('activityLog', {
  get: () => ipcRenderer.invoke('log:get'),
  clear: () => ipcRenderer.invoke('log:clear'),
  onEntry: (cb) => {
    const listener = (_e, entry) => cb(entry);
    ipcRenderer.on('log:entry', listener);
    return () => ipcRenderer.removeListener('log:entry', listener);
  },
});

// Événements de toutes les cases : statuts (son, onglets) et clic sur une notification Windows.
contextBridge.exposeInMainWorld('agentEvents', {
  onStatus: (cb) => {
    const listener = (_e, id, info) => cb(id, info);
    ipcRenderer.on('agent:status', listener);
    return () => ipcRenderer.removeListener('agent:status', listener);
  },
  onFocusRequest: (cb) => {
    const listener = (_e, id) => cb(id);
    ipcRenderer.on('agent:focus', listener);
    return () => ipcRenderer.removeListener('agent:focus', listener);
  },
});

// Fenêtre : confirmation avant de quitter (agents qui travaillent) et couleurs des boutons Windows.
// Section « À propos » : version de l'app, liens du projet (author, repo, issues) ouverts dans le navigateur.
contextBridge.exposeInMainWorld('about', {
  info: () => ipcRenderer.invoke('about:info'),
  open: (key) => ipcRenderer.send('about:open', key),
});

contextBridge.exposeInMainWorld('appWindow', {
  platform: process.platform, // 'win32', 'darwin'… : touches et barre de titre propres à macOS
  onConfirmQuit: (cb) => {
    const listener = (_e, agents) => cb(agents);
    ipcRenderer.on('app:confirmQuit', listener);
    return () => ipcRenderer.removeListener('app:confirmQuit', listener);
  },
  quit: () => ipcRenderer.send('app:quit'),
  setTitleBarColors: (color, symbolColor) => ipcRenderer.send('window:titleBarColors', color, symbolColor),
});

contextBridge.exposeInMainWorld('pty', {
  create: (opts) => ipcRenderer.invoke('pty:create', opts),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  ack: (id) => ipcRenderer.send('pty:ack', id),
  rename: (id, name) => ipcRenderer.send('pty:rename', id, name),
  onData: (id, cb) => {
    const channel = `pty:data:${id}`;
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onStatus: (id, cb) => {
    const channel = `pty:status:${id}`;
    const listener = (_e, info) => cb(info);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onExit: (id, cb) => {
    const channel = `pty:exit:${id}`;
    const listener = (_e, code) => cb(code);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
