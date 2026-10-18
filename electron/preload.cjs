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

contextBridge.exposeInMainWorld('pty', {
  create: (opts) => ipcRenderer.invoke('pty:create', opts),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
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
