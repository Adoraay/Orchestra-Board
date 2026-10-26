const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { t } = require('./i18n.cjs');

const ID = /^[\w-]{1,128}$/;
const STATES = ['todo', 'review', 'queued', 'preparing', 'running', 'responded', 'validated', 'failed', 'cancelled', 'interrupted'];
const LIMIT = 500;
const short = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

// Suivi local, sans ordonnanceur : seule une validation humaine satisfait une dépendance.
function createTaskStore(directory, deps = {}) {
  const file = path.join(directory, 'tasks.json');
  let tasks = new Map();
  let blocked = false;
  const starts = new Map();
  try {
    if (fs.statSync(file).size > 64 * 1024 * 1024) throw new Error('size');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(input.tasks) || input.tasks.length > LIMIT) throw new Error('structure');
    for (const task of input.tasks) {
      if (!task || !ID.test(task.id) || tasks.has(task.id) || !STATES.includes(task.state) || typeof task.title !== 'string' || !Array.isArray(task.dependencies)) throw new Error('task');
      const clean = {
        id: task.id, title: short(task.title, 200), owner: ID.test(task.owner ?? '') ? task.owner : null,
        ownerName: short(task.ownerName, 80), boardId: ID.test(task.boardId ?? '') ? task.boardId : null,
        from: ID.test(task.from ?? '') ? task.from : null, fromName: short(task.fromName, 80), prompt: short(task.prompt, 20000),
        source: ['relay', 'delegate'].includes(task.source) ? task.source : 'manual',
        state: ['running', 'preparing', 'queued', 'review'].includes(task.state) ? 'interrupted' : task.state,
        result: short(task.result, 20000), reason: short(task.reason, 2000),
        dependencies: [...new Set(task.dependencies.filter((id) => typeof id === 'string' && ID.test(id)))].slice(0, LIMIT),
        createdAt: Number(task.createdAt) || Date.now(), updatedAt: Number(task.updatedAt) || Date.now(),
        startedAt: Number(task.startedAt) || null,
        baseline: task.baseline && typeof task.baseline === 'object' ? { state: short(task.baseline.state, 40), at: Number(task.baseline.at) || null } : null,
      };
      tasks.set(clean.id, clean);
    }
    for (const task of tasks.values()) validateDependencies(task.id, task.dependencies);
  } catch (error) {
    if (error.code !== 'ENOENT') { blocked = true; tasks = new Map(); }
  }

  function validateDependencies(id, dependencies) {
    if (dependencies.some((value) => !tasks.has(value))) throw new Error(t('task.missingDependency'));
    const visit = (next, seen) => {
      if (next === id) throw new Error(t('task.cycle'));
      if (seen.has(next)) return;
      seen.add(next);
      for (const dependency of tasks.get(next)?.dependencies ?? []) visit(dependency, seen);
    };
    for (const dependency of dependencies) visit(dependency, new Set());
  }

  function list() {
    return { tasks: [...tasks.values()].map((task) => {
      const waitingFor = task.dependencies.filter((id) => tasks.get(id)?.state !== 'validated');
      return { ...task, waitingFor, state: task.state === 'todo' && waitingFor.length ? 'blocked' : task.state };
    }), error: blocked ? t('task.storageFailed') : tasks.size >= LIMIT ? t('task.limit') : null };
  }

  function save() {
    if (blocked) throw new Error(t('task.storageFailed'));
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, tasks: [...tasks.values()] }), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
    } catch {
      blocked = true;
      deps.emit?.(list());
      throw new Error(t('task.storageFailed'));
    }
    deps.emit?.(list());
  }

  function ownerInfo(id) {
    const found = deps.owner?.(id);
    if (id && !found) throw new Error(t('task.ownerMissing'));
    return { owner: id || null, ownerName: found?.name ?? '', boardId: found?.boardId ?? null };
  }

  function create(input = {}) {
    if (blocked) throw new Error(t('task.storageFailed'));
    if (tasks.size >= LIMIT) throw new Error(t('task.limit'));
    const title = short(input.title, 200);
    if (!title) throw new Error(t('task.titleRequired'));
    const dependencies = Array.isArray(input.dependencies) ? [...new Set(input.dependencies)] : [];
    const id = randomUUID();
    validateDependencies(id, dependencies);
    const task = { id, title, ...ownerInfo(input.owner), source: 'manual', state: 'todo', result: '', reason: '', dependencies, createdAt: Date.now(), updatedAt: Date.now(), startedAt: null, baseline: null };
    tasks.set(id, task);
    save();
    return task;
  }

  function update(id, patch = {}) {
    const task = tasks.get(id);
    if (!task) throw new Error(t('task.notFound'));
    const next = { ...task, updatedAt: Date.now() };
    if (Object.hasOwn(patch, 'title')) {
      next.title = short(patch.title, 200);
      if (!next.title) throw new Error(t('task.titleRequired'));
    }
    if (Object.hasOwn(patch, 'owner')) {
      if (task.startedAt || task.source !== 'manual' || task.state !== 'todo') throw new Error(t('task.alreadyStarted'));
      Object.assign(next, ownerInfo(patch.owner));
    }
    if (Object.hasOwn(patch, 'dependencies')) {
      if (task.startedAt || task.source !== 'manual' || task.state !== 'todo' || !Array.isArray(patch.dependencies)) throw new Error(t('task.alreadyStarted'));
      next.dependencies = [...new Set(patch.dependencies)];
      validateDependencies(id, next.dependencies);
    }
    if (Object.hasOwn(patch, 'result')) {
      next.result = short(patch.result, 20000);
      if (task.state === 'validated' && next.result !== task.result) next.state = 'responded';
    }
    if (Object.hasOwn(patch, 'reason')) next.reason = short(patch.reason, 2000);
    tasks.set(id, next);
    save();
    return next;
  }

  async function start(id) {
    if (starts.has(id)) return starts.get(id);
    const task = tasks.get(id);
    if (!task) throw new Error(t('task.notFound'));
    if (task.startedAt || !['todo', 'queued', 'review'].includes(task.state)) throw new Error(t('task.alreadyStarted'));
    if (task.dependencies.some((key) => tasks.get(key)?.state !== 'validated')) throw new Error(t('task.dependenciesPending'));
    if (!task.owner) throw new Error(t('task.ownerMissing'));
    const owner = deps.owner?.(task.owner);
    if (!owner) throw new Error(t('task.ownerMissing'));
    task.state = 'preparing';
    save();
    const operation = (async () => {
      let baseline;
      try { baseline = await deps.capture?.(id, owner.cwd) ?? { state: 'missing' }; }
      catch { baseline = { state: 'unavailable' }; }
      if (task.state !== 'preparing') throw new Error(t('task.cancelled'));
      task.baseline = { state: baseline.state, at: baseline.at ?? null };
      task.startedAt = baseline.at ?? Date.now();
      task.state = 'running';
      task.updatedAt = Date.now();
      save();
      return task;
    })();
    starts.set(id, operation);
    try { return await operation; } finally { starts.delete(id); }
  }

  function action(id, actionName) {
    const task = tasks.get(id);
    if (!task) throw new Error(t('task.notFound'));
    if (!['respond', 'validate', 'fail', 'cancel'].includes(actionName)) throw new Error(t('task.invalidAction'));
    if (actionName === 'validate' && (task.state !== 'responded' || !task.result.trim())) throw new Error(t('task.validationRequired'));
    if (actionName === 'respond' && task.state !== 'running') throw new Error(t('task.invalidAction'));
    if (['validated', 'cancelled'].includes(task.state)) throw new Error(t('task.invalidAction'));
    task.state = { respond: 'responded', validate: 'validated', fail: 'failed', cancel: 'cancelled' }[actionName];
    task.updatedAt = Date.now();
    save();
    return task;
  }

  function onLog(entry) {
    if (blocked || !ID.test(entry.taskId ?? '')) return;
    let task = tasks.get(entry.taskId);
    if (!task && ['draft', 'relay', 'delegate'].includes(entry.kind)) {
      if (tasks.size >= LIMIT) return;
      task = { id: entry.taskId, title: short(entry.text?.split('\n')[0], 200) || t('task.exchange'), owner: entry.to, ownerName: entry.toName ?? '', boardId: entry.boardId, from: entry.from ?? null, fromName: short(entry.fromName, 80), prompt: short(entry.text, 20000), source: entry.kind === 'delegate' ? 'delegate' : 'relay', state: entry.kind === 'draft' ? 'review' : 'queued', result: '', reason: '', dependencies: [], createdAt: entry.at, updatedAt: entry.at, startedAt: null, baseline: null };
      tasks.set(task.id, task);
    }
    if (!task || ['validated', 'cancelled', 'failed', 'interrupted'].includes(task.state)) return;
    if (entry.kind === 'reply') { task.result = short(entry.text, 20000); task.state = 'responded'; }
    if (entry.kind === 'cancelled') task.state = 'cancelled';
    if (entry.kind === 'refused') { task.state = 'failed'; task.reason = short(entry.text, 2000); }
    if (entry.kind === 'delivered') task.state = 'running';
    task.updatedAt = entry.at;
    save();
  }

  async function beforeDeliver(id) {
    const task = tasks.get(id);
    if (!task) return; // historique plein : la livraison reste disponible, sans référence inventée
    await start(id);
  }

  function deferred(id) {
    const task = tasks.get(id);
    if (!task || task.state !== 'running') return;
    task.state = 'queued'; task.startedAt = null; task.baseline = null;
    save();
  }

  function finishOwner(id, result) {
    for (const task of tasks.values()) {
      if (task.owner !== id || task.state !== 'running' || task.source === 'delegate') continue;
      task.state = 'responded'; task.result = short(result, 20000); task.updatedAt = Date.now();
      save();
    }
  }

  function onExit(id) {
    for (const task of tasks.values()) {
      if (task.owner !== id || !['preparing', 'running'].includes(task.state)) continue;
      task.state = 'failed'; task.reason = t('task.ownerClosed'); task.updatedAt = Date.now();
      save();
    }
  }

  function remove(id) {
    const task = tasks.get(id);
    if (!task) throw new Error(t('task.notFound'));
    if ([...tasks.values()].some((row) => row.dependencies.includes(id)) || ['queued', 'review', 'preparing', 'running'].includes(task.state)) throw new Error(t('task.cannotRemove'));
    tasks.delete(id); save();
  }

  return { list, create, update, start, action, onLog, beforeDeliver, deferred, finishOwner, onExit, remove, get: (id) => tasks.get(id) };
}

module.exports = { createTaskStore, ID, LIMIT };
