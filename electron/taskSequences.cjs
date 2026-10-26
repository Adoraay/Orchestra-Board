const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const ID = /^[\w-]{1,128}$/;
const ACTIVE = new Set(['running', 'paused', 'approval']);
const STATES = new Set([...ACTIVE, 'completed', 'stopped', 'failed', 'interrupted']);
const PHASES = new Set(['trigger', 'ready', 'queued', 'submitting', 'working', 'collecting']);
const MAX_TASKS = 50;
const MAX_STEPS = 50;
const MAX_TEXT = 20000;
const MAX_FILE = 32 * 1024 * 1024;
const copy = (value) => JSON.parse(JSON.stringify(value));

// Les modèles et le dernier lancement restent locaux. Aucun lancement ne reprend au démarrage.
function createTaskSequences(directory, deps) {
  const file = path.join(directory, 'task-sequences.json');
  let tasks = new Map();
  let storageError = '';
  let disposed = false;
  const timers = new Set();
  const message = (key) => deps.t(`sequences.${key}`);
  const error = (key) => { throw new Error(message(key)); };
  const later = (fn, delay = 0) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed && !storageError) fn(); }, delay);
    timers.add(timer);
  };

  function clean(input) {
    if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) error('invalid');
    if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > MAX_STEPS) error('invalid');
    if (input.afterAgent && (typeof input.afterAgent !== 'string' || !ID.test(input.afterAgent))) error('invalid');
    return {
      title: input.title.trim(), afterAgent: input.afterAgent || null,
      steps: input.steps.map((step) => {
        if (!step || typeof step.target !== 'string' || !ID.test(step.target) || typeof step.prompt !== 'string' || !step.prompt.trim() || step.prompt.length > MAX_TEXT || /[\x00-\x08\x0b-\x1f\x7f]/.test(step.prompt)) error('invalid');
        return { target: step.target, prompt: step.prompt.trim(), includePrevious: step.includePrevious === true, approval: step.approval === true };
      }),
    };
  }

  try {
    if (fs.statSync(file).size > MAX_FILE) error('storage');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (input.version !== 1 || !Array.isArray(input.tasks) || input.tasks.length > MAX_TASKS) error('storage');
    for (const raw of input.tasks) {
      if (!raw || !ID.test(raw.id) || tasks.has(raw.id)) error('storage');
      const task = { id: raw.id, ...clean(raw), run: null };
      if (raw.run) {
        const run = raw.run;
        if (!ID.test(run.id) || !STATES.has(run.state) || !PHASES.has(run.phase) || !Number.isInteger(run.index) || run.index < 0 || run.index > task.steps.length || !Array.isArray(run.results) || run.results.length !== run.index || run.results.some((r) => typeof r !== 'string' || r.length > MAX_TEXT)) error('storage');
        task.run = { ...run, results: run.results.slice(), error: typeof run.error === 'string' ? run.error.slice(0, 2000) : '' };
        if (ACTIVE.has(run.state)) task.run.state = 'interrupted';
      }
      tasks.set(task.id, task);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') { tasks = new Map(); storageError = message('storage'); }
  }

  function list() { return { tasks: copy([...tasks.values()]), error: storageError || null }; }
  function emit() { deps.emit?.(list()); }
  function persist() {
    if (storageError || disposed) return false;
    try {
      const json = JSON.stringify({ version: 1, tasks: [...tasks.values()] });
      if (Buffer.byteLength(json) > MAX_FILE) throw new Error('size');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(file + '.tmp', json, { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
    } catch {
      storageError = message('storage');
      for (const task of tasks.values()) if (ACTIVE.has(task.run?.state)) {
        task.run.state = 'interrupted';
        deps.cancel(task.run.id);
      }
    }
    emit();
    return !storageError;
  }
  function writable() { if (storageError || disposed) error('storage'); }
  function find(id) { writable(); const task = tasks.get(id); if (!task) error('missing'); return task; }
  function configured(id) { return deps.agents().some((agent) => agent.id === id); }
  function validateTargets(task) {
    for (const id of new Set([...task.steps.map((step) => step.target), task.afterAgent].filter(Boolean))) {
      if (!configured(id)) error('agentMissing');
      if (!deps.info(id)) error('agentClosed');
    }
  }
  function save(input, id = null) {
    writable();
    const previous = id ? find(id) : null;
    if (ACTIVE.has(previous?.run?.state)) error('active');
    if (!previous && tasks.size >= MAX_TASKS) error('limit');
    const template = clean(input);
    const task = { id: previous?.id || randomUUID(), ...template, run: null };
    tasks.set(task.id, task);
    if (!persist()) error('storage');
    return copy(task);
  }
  function remove(id) {
    const task = find(id);
    if (ACTIVE.has(task.run?.state)) error('active');
    tasks.delete(id);
    if (!persist()) error('storage');
  }
  const current = (task, run) => !disposed && !storageError && task.run === run && ACTIVE.has(run.state);
  function fail(task, run, key) {
    if (!current(task, run)) return;
    run.state = 'failed'; run.error = message(key);
    deps.cancel(run.id);
    persist();
  }
  function collect(task, run, payload, trigger = false) {
    if (!current(task, run)) return;
    run.phase = 'collecting';
    if (!persist()) return;
    later(() => {
      if (!current(task, run)) return;
      const reply = deps.lastReply(payload).slice(0, MAX_TEXT);
      if (trigger) { run.triggerReply = reply; run.triggerDone = true; }
      else { run.results[run.index] = reply; run.index++; }
      run.phase = 'ready';
      if (!trigger && run.index === task.steps.length) run.state = 'completed';
      if (persist()) advance(task, run);
    }, deps.readDelay ?? 400);
  }
  function advance(task, run) {
    if (!current(task, run) || run.state !== 'running' || run.phase !== 'ready') return;
    if (run.index >= task.steps.length) { run.state = 'completed'; persist(); return; }
    const step = task.steps[run.index];
    if (!configured(step.target)) return fail(task, run, 'agentMissing');
    if (!deps.info(step.target)) return fail(task, run, 'agentClosed');
    if (step.approval && run.approved !== run.index) { run.state = 'approval'; persist(); return; }
    const previous = run.index ? run.results[run.index - 1] : run.triggerReply;
    if (step.includePrevious && !previous) return fail(task, run, 'replyMissing');
    const text = step.prompt + (step.includePrevious ? `\n\n${message('previousReply')}\n${previous}` : '');
    run.phase = 'queued';
    if (!persist()) return;
    deps.enqueue(step.target, {
      id: run.id, key: run.id, owner: 'sequence', text,
      chain: { counts: new Map() }, turns: run.index + 1, maxTurns: task.steps.length,
      stillValid: () => current(task, run) && run.state === 'running' && run.phase === 'queued',
      onSending: () => { run.phase = 'submitting'; return persist(); },
      onDelivered: () => {},
      onStarted: () => { if (current(task, run)) { run.phase = 'working'; persist(); } },
      onCompleted: (payload) => collect(task, run, payload),
      onError: (reason) => fail(task, run, ['unconfirmed', 'sessionChanged', 'interrupted'].includes(reason) ? reason : 'agentClosed'),
    });
  }
  function start(id) {
    const task = find(id);
    if (ACTIVE.has(task.run?.state)) error('active');
    validateTargets(task);
    const trigger = task.afterAgent && deps.info(task.afterAgent);
    const run = {
      id: randomUUID(), state: 'running', phase: task.afterAgent ? 'trigger' : 'ready', index: 0,
      results: [], error: '', approved: -1, triggerDone: !task.afterAgent,
      triggerSubmitted: Boolean(trigger && ['working', 'waiting'].includes(trigger.status)),
      triggerSession: trigger?.sessionId || null, triggerTurn: trigger?.turnId || null,
    };
    task.run = run;
    if (!persist()) error('storage');
    advance(task, run);
    return copy(task);
  }
  function action(id, name) {
    const task = find(id);
    const run = task.run;
    if (!run) error('invalid');
    if (name === 'stop' && (ACTIVE.has(run.state) || run.state === 'interrupted')) {
      run.state = 'stopped'; deps.cancel(run.id);
    } else if (name === 'pause' && run.state === 'running') {
      run.state = 'paused';
      if (run.phase === 'queued') { deps.cancel(run.id); run.phase = 'ready'; }
    } else if (name === 'resume' && run.state === 'paused') {
      validateTargets(task); run.state = 'running';
    } else if (name === 'approve' && run.state === 'approval') {
      validateTargets(task); run.approved = run.index; run.state = 'running';
    } else error('invalid');
    if (!persist()) error('storage');
    advance(task, run);
    return copy(task);
  }
  function onHook(id, payload) {
    if (disposed || storageError) return;
    for (const task of tasks.values()) {
      const run = task.run;
      if (!run || !current(task, run)) continue;
      if (payload.hook_event_name === 'SessionStart' && task.steps[run.index]?.target === id && ['submitting', 'working'].includes(run.phase)) { fail(task, run, 'sessionChanged'); continue; }
      if (task.afterAgent !== id || run.phase !== 'trigger') continue;
      if (payload.hook_event_name === 'UserPromptSubmit') {
        run.triggerSubmitted = true; run.triggerSession = payload.session_id || null; run.triggerTurn = payload.turn_id || null; persist();
      }
      if (payload.hook_event_name === 'SessionStart') { run.triggerSubmitted = false; persist(); }
      if (payload.hook_event_name === 'Stop' && run.triggerSubmitted && !(run.triggerSession && payload.session_id && run.triggerSession !== payload.session_id) && !(run.triggerTurn && payload.turn_id && run.triggerTurn !== payload.turn_id)) collect(task, run, payload, true);
    }
  }
  function onStatus(id, info) {
    if (info || disposed || storageError) return;
    for (const task of tasks.values()) {
      const run = task.run;
      if (!run || !current(task, run)) continue;
      if ((run.phase === 'trigger' && task.afterAgent === id) || task.steps.slice(run.index).some((step) => step.target === id)) fail(task, run, 'agentClosed');
    }
  }
  function dispose() { disposed = true; for (const timer of timers) clearTimeout(timer); for (const task of tasks.values()) if (task.run) deps.cancel(task.run.id); }
  return { list, save, remove, start, action, onHook, onStatus, dispose };
}

module.exports = { createTaskSequences };
