const { contextBridge, ipcRenderer } = require('electron');

// Seule porte entre l'interface (React) et le système.
contextBridge.exposeInMainWorld('fs', {
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  homeDir: () => ipcRenderer.invoke('fs:homeDir'),
  pickFolder: (defaultPath) => ipcRenderer.invoke('dialog:pickFolder', defaultPath),
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
});

contextBridge.exposeInMainWorld('workspace', {
  get: () => ipcRenderer.invoke('workspace:get'),
  set: (workspace) => ipcRenderer.invoke('workspace:set', workspace),
  saveSync: (workspace) => ipcRenderer.sendSync('workspace:saveSync', workspace),
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

contextBridge.exposeInMainWorld('pty', {
  create: (opts) => ipcRenderer.invoke('pty:create', opts),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  ack: (id) => ipcRenderer.send('pty:ack', id),
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
