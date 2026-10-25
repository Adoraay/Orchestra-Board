const path = require('path');
const { app, ipcMain } = require('electron');
const { execFile } = require('child_process');
const { createTaskStore } = require('./taskStore.cjs');
const { createTaskSnapshots } = require('./taskSnapshots.cjs');
const { sharedWorktrees } = require('./sharedWorktrees.cjs');
const { t } = require('./i18n.cjs');

function register(workspace, send, relay) {
  const snapshots = createTaskSnapshots(path.join(app.getPath('userData'), 'task-snapshots'));
  const owner = (id) => {
    for (const board of workspace().boards) {
      const node = board.nodes.find((n) => n.id === id && n.type === 'terminal');
      if (node) return { name: node.data.label || node.data.agentId, boardId: board.id, cwd: node.data.worktree ?? node.data.cwd };
    }
    return null;
  };
  const store = createTaskStore(app.getPath('userData'), { owner, capture: snapshots.capture, emit: (value) => send('tasks:changed', value) });
  const handle = (name, action) => ipcMain.handle(name, async (_e, ...args) => {
    try { return { value: await action(...args) }; }
    catch (error) { return { error: error.message || t('task.failed') }; }
  });
  handle('tasks:list', store.list);
  handle('tasks:create', store.create);
  handle('tasks:update', store.update);
  handle('tasks:start', (id) => {
    if (store.get(id)?.source !== 'manual') throw new Error(t('task.automaticStart'));
    return store.start(id);
  });
  handle('tasks:action', (id, action) => {
    if (action === 'fail' && relay.pendingList().some((row) => row.taskId === id)) throw new Error(t('task.invalidAction'));
    if (action === 'cancel') {
      const item = relay.pendingList().find((row) => row.taskId === id);
      if (item) {
        const result = item.state === 'draft' ? relay.discard(item.qid) : relay.cancel(item.qid);
        if (result.error) throw new Error(result.error);
        return store.get(id);
      }
    }
    return store.action(id, action);
  });
  handle('tasks:remove', async (id) => { store.remove(id); await snapshots.remove(id); return true; });
  ipcMain.handle('tasks:changes', async (_e, id) => {
    if (!store.get(id)) return { error: t('task.notFound') };
    const result = await snapshots.changes(id);
    if (result.root) {
      result.sharedCases = await sharedWorktrees(workspace(), result.root, store.get(id).owner, (cwd) => new Promise((resolve, reject) => {
        execFile('git', ['rev-parse', '--show-toplevel'], { cwd, windowsHide: true, timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
      })).catch(() => []);
    }
    return result;
  });
  ipcMain.handle('tasks:diff', (_e, id, file) => store.get(id) ? snapshots.diff(id, file) : { error: t('task.notFound') });
  return store;
}

module.exports = { register };
