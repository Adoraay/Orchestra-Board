const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tasks', {
  list: () => ipcRenderer.invoke('tasks:list'),
  create: (input) => ipcRenderer.invoke('tasks:create', input),
  update: (id, patch) => ipcRenderer.invoke('tasks:update', id, patch),
  start: (id) => ipcRenderer.invoke('tasks:start', id),
  action: (id, action) => ipcRenderer.invoke('tasks:action', id, action),
  remove: (id) => ipcRenderer.invoke('tasks:remove', id),
  changes: (id) => ipcRenderer.invoke('tasks:changes', id),
  diff: (id, file) => ipcRenderer.invoke('tasks:diff', id, file),
  onChanged: (cb) => {
    const listener = (_e, value) => cb(value);
    ipcRenderer.on('tasks:changed', listener);
    return () => ipcRenderer.removeListener('tasks:changed', listener);
  },
});

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
  models: (agentId) => ipcRenderer.invoke('agents:models', agentId),
});

let workspaceGeneration;
contextBridge.exposeInMainWorld('workspace', {
  get: () => ipcRenderer.invoke('workspace:get'),
  startup: async () => {
    const result = await ipcRenderer.invoke('workspace:startup');
    workspaceGeneration = result.generation;
    return result;
  },
  backups: () => ipcRenderer.invoke('workspace:backups'),
  restore: (id) => ipcRenderer.invoke('workspace:restore', id),
  onSaveError: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('workspace:saveError', listener);
    return () => ipcRenderer.removeListener('workspace:saveError', listener);
  },
  set: (workspace) => ipcRenderer.invoke('workspace:set', workspace, workspaceGeneration),
  saveSync: (workspace) => ipcRenderer.sendSync('workspace:saveSync', workspace, workspaceGeneration),
});

contextBridge.exposeInMainWorld('git', {
  isRepo: (cwd) => ipcRenderer.invoke('git:isRepo', cwd),
  listBranches: (cwd, fetch) => ipcRenderer.invoke('git:listBranches', cwd, fetch),
  ensureWorktree: (cwd, branch) => ipcRenderer.invoke('git:ensureWorktree', cwd, branch),
  changes: (cwd, caller) => ipcRenderer.invoke('git:changes', cwd, caller),
  diff: (cwd, file) => ipcRenderer.invoke('git:diff', cwd, file),
  untracked: (cwd, folder, limit) => ipcRenderer.invoke('git:untracked', cwd, folder, limit),
  openInEditor: (cwd, file) => ipcRenderer.invoke('git:openInEditor', cwd, file),
});

contextBridge.exposeInMainWorld('teams', {
  list: () => ipcRenderer.invoke('teams:list'),
  save: (name, board) => ipcRenderer.invoke('teams:save', name, board),
  remove: (id) => ipcRenderer.invoke('teams:remove', id),
  create: (id, cwd, replacements) => ipcRenderer.invoke('teams:create', id, cwd, replacements),
});

contextBridge.exposeInMainWorld('blockers', {
  get: () => ipcRenderer.invoke('blockers:get'),
  clearResolved: () => ipcRenderer.invoke('blockers:clearResolved'),
  onChange: (cb) => {
    const listener = (_e, entries) => cb(entries);
    ipcRenderer.on('blockers:change', listener);
    return () => ipcRenderer.removeListener('blockers:change', listener);
  },
});

contextBridge.exposeInMainWorld('roles', {
  get: (id) => ipcRenderer.invoke('roles:get', id),
  set: (id, role) => ipcRenderer.invoke('roles:set', id, role),
  onChange: (id, cb) => {
    const listener = (_e, changedId, state) => { if (changedId === id) cb(state); };
    ipcRenderer.on('roles:change', listener);
    return () => ipcRenderer.removeListener('roles:change', listener);
  },
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

// Messages des liens à valider (brouillons) ou en file d'attente : envoyer, abandonner, annuler.
contextBridge.exposeInMainWorld('relay', {
  pending: () => ipcRenderer.invoke('relay:pending'),
  approve: (qid, text) => ipcRenderer.invoke('relay:approve', qid, text),
  discard: (qid) => ipcRenderer.invoke('relay:discard', qid),
  cancel: (qid) => ipcRenderer.invoke('relay:cancel', qid),
  onPending: (cb) => {
    const listener = (_e, list) => cb(list);
    ipcRenderer.on('relay:pending', listener);
    return () => ipcRenderer.removeListener('relay:pending', listener);
  },
});

// Diagnostic des intégrations : commande trouvée, version, dernier hook de chaque case lancée.
contextBridge.exposeInMainWorld('diagnostics', {
  agents: () => ipcRenderer.invoke('diag:agents'),
  tiles: () => ipcRenderer.invoke('diag:tiles'),
});

// Post-it réécrit par un agent relié (lien Note).
contextBridge.exposeInMainWorld('notes', {
  onWrite: (cb) => {
    const listener = (_e, id, text) => cb(id, text);
    ipcRenderer.on('note:write', listener);
    return () => ipcRenderer.removeListener('note:write', listener);
  },
});

// Journal des échanges entre agents (PLAN.md §3.18).
contextBridge.exposeInMainWorld('activityLog', {
  export: (filter) => ipcRenderer.invoke('log:export', filter),
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

// Mises à jour : dernière release GitHub, téléchargement vérifié du fichier d'installation.
contextBridge.exposeInMainWorld('updates', {
  check: (force) => ipcRenderer.invoke('update:check', force === true),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  openRelease: () => ipcRenderer.send('update:openRelease'),
  onProgress: (cb) => {
    const listener = (_e, progress) => cb(progress);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  onAvailable: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },
});

contextBridge.exposeInMainWorld('appWindow', {
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
