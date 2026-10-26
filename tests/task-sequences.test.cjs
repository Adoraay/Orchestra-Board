const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

function clock() {
  let now = 0;
  let next = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay = 0) { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    tick(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        const ready = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!ready) break;
        if (++count > 10000) throw new Error('timer loop');
        now = ready[1].at; timers.delete(ready[0]); ready[1].fn();
      }
      now = end;
    },
  };
}
function load(name, time) {
  const file = path.join(__dirname, '..', 'electron', name);
  const requireFrom = createRequire(file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, Buffer, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    require: (id) => id === './i18n.cjs' ? { t: (key) => key } : requireFrom(id),
  }, { filename: file });
  return module.exports;
}

function harness(t, directory) {
  const time = clock();
  const dir = directory || fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-sequences-test-'));
  const relay = load('linkRelay.cjs', time);
  const status = new Map(['a', 'b', 'c'].map((id) => [id, { status: 'idle', ready: true, sessionId: `session-${id}`, mode: 'hooks' }]));
  const writes = [];
  const events = [];
  let engine;
  relay.init({
    write: (id, text) => writes.push({ id, text }), arm: () => {},
    status: (id) => status.get(id)?.status || null, ready: (id) => status.get(id)?.ready !== false,
    emit: (...args) => events.push(args), log: () => {},
  });
  const deps = {
    t: (key) => key, agents: () => [...status.keys()].map((id) => ({ id })), info: (id) => status.get(id),
    enqueue: relay.enqueue, cancel: relay.cancelSequence, lastReply: (payload) => payload.last_assistant_message || '', readDelay: 400,
  };
  engine = load('taskSequences.cjs', time).createTaskSequences(dir, deps);
  const hook = (id, name, extra = {}) => {
    const payload = { hook_event_name: name, session_id: `session-${id}`, ...extra };
    relay.onHook(id, payload); engine.onHook(id, payload);
    const info = status.get(id);
    if (info) {
      if (name === 'UserPromptSubmit') { info.status = 'working'; info.turnId = extra.turn_id || null; }
      if (name === 'Stop') info.status = 'done';
      if (name === 'SessionStart') { info.status = 'idle'; info.ready = true; }
      if (name === 'PermissionRequest') info.status = 'waiting';
    }
    relay.onStatus(id, info); engine.onStatus(id, info);
    return payload;
  };
  const task = (steps, extra = {}) => engine.save({ title: 'Example', steps, ...extra });
  const step = (target = 'a', prompt = 'Do the work', extra = {}) => ({ target, prompt, ...extra });
  const state = (id) => engine.list().tasks.find((value) => value.id === id).run;
  const pastes = () => writes.filter((value) => value.text.startsWith('\x1b[200~'));
  const finish = (id, text = 'Result', turn = 'turn-1') => { hook(id, 'UserPromptSubmit', { turn_id: turn }); hook(id, 'Stop', { turn_id: turn, last_assistant_message: text }); time.tick(410); };
  t.after(() => {
    engine.dispose(); relay.dispose();
    if (!directory) {
      const absolute = path.resolve(dir);
      assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
      assert.match(path.basename(absolute), /^orchestra-sequences-test-/);
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  });
  return { engine, relay, time, dir, status, writes, events, hook, task, step, state, pastes, finish, deps };
}

test('two prompts to the same agent wait for the matching submitted turn', (t) => {
  const h = harness(t);
  const task = h.task([h.step('a', 'First'), h.step('a', 'Second')]);
  h.engine.start(task.id);
  assert.equal(h.pastes().length, 1);
  h.hook('a', 'Stop', { last_assistant_message: 'Older response' }); h.time.tick(100);
  assert.equal(h.state(task.id).index, 0);
  h.time.tick(150); h.hook('a', 'UserPromptSubmit', { turn_id: 'new' });
  h.hook('a', 'Stop', { turn_id: 'old' }); h.time.tick(410);
  assert.equal(h.pastes().length, 1);
  h.hook('a', 'Stop', { turn_id: 'new', last_assistant_message: 'First result' });
  h.time.tick(399); assert.equal(h.pastes().length, 1);
  h.time.tick(11); assert.equal(h.pastes().length, 2);
  assert.match(h.pastes()[1].text, /Second/);
  h.time.tick(250); h.finish('a', 'Second result', 'second');
  assert.equal(h.state(task.id).state, 'completed');
  assert.deepEqual(Array.from(h.state(task.id).results), ['First result', 'Second result']);
});

test('different agents receive the previous response only when requested', (t) => {
  const h = harness(t);
  const task = h.task([h.step('a', 'Develop'), h.step('b', 'Review', { includePrevious: true })]);
  h.engine.start(task.id); h.time.tick(250); h.finish('a', 'Files changed: login.js');
  assert.equal(h.pastes()[1].id, 'b');
  assert.match(h.pastes()[1].text, /Review.*Files changed: login.js/s);
});

test('a busy agent and a permission request never receive a pasted prompt', (t) => {
  const h = harness(t); h.status.get('a').status = 'waiting';
  const task = h.task([h.step()]); h.engine.start(task.id);
  h.time.tick(2000); assert.equal(h.pastes().length, 0);
  h.hook('a', 'Stop', { last_assistant_message: 'Old work' }); h.time.tick(0);
  assert.equal(h.pastes().length, 1); assert.equal(h.state(task.id).index, 0);
  h.time.tick(250); h.hook('a', 'UserPromptSubmit', { turn_id: 'own' }); h.hook('a', 'PermissionRequest');
  h.time.tick(2000); assert.equal(h.state(task.id).index, 0);
  h.hook('a', 'Stop', { turn_id: 'own', last_assistant_message: 'Done' }); h.time.tick(410);
  assert.equal(h.state(task.id).state, 'completed');
});

test('two sequences and a relay share one reservation through the paste and reply read', (t) => {
  const h = harness(t);
  const one = h.task([h.step('a', 'One')]); const two = h.task([h.step('a', 'Two')]);
  h.engine.start(one.id); h.engine.start(two.id);
  h.relay.enqueue('a', { id: 'link', key: 'link', text: 'Relay', chain: { counts: new Map() } });
  assert.equal(h.pastes().length, 1);
  h.time.tick(250); h.finish('a', 'One result', 'one');
  assert.equal(h.state(one.id).state, 'completed'); assert.equal(h.state(two.id).index, 0);
  assert.equal(h.pastes().length, 2); assert.match(h.pastes()[1].text, /Two/);
  h.time.tick(250); h.finish('a', 'Two result', 'two');
  assert.equal(h.state(two.id).state, 'completed'); assert.equal(h.pastes().length, 3);
  assert.match(h.pastes()[2].text, /Relay/);
});

test('pause cancels a queued delivery and resume sends it once', (t) => {
  const h = harness(t); h.status.get('a').status = 'working';
  const task = h.task([h.step()]); h.engine.start(task.id); h.engine.action(task.id, 'pause');
  h.hook('a', 'Stop'); h.time.tick(500); assert.equal(h.pastes().length, 0);
  h.engine.action(task.id, 'resume'); assert.equal(h.pastes().length, 1);
});

test('pause during a turn records its reply without starting the next step', (t) => {
  const h = harness(t); const task = h.task([h.step(), h.step('b')]);
  h.engine.start(task.id); h.time.tick(250); h.hook('a', 'UserPromptSubmit'); h.engine.action(task.id, 'pause');
  h.hook('a', 'Stop', { last_assistant_message: 'First' }); h.time.tick(410);
  assert.equal(h.state(task.id).state, 'paused'); assert.equal(h.state(task.id).index, 1); assert.equal(h.pastes().length, 1);
  h.engine.action(task.id, 'resume'); assert.equal(h.pastes().length, 2);
});

test('stop before delivery removes queued work; stopping during paste completes Enter only', (t) => {
  const h = harness(t); h.status.get('a').status = 'working';
  const queued = h.task([h.step()]); h.engine.start(queued.id); h.engine.action(queued.id, 'stop');
  h.hook('a', 'Stop'); h.time.tick(0); assert.equal(h.pastes().length, 0);
  const task = h.task([h.step(), h.step('b')]); h.engine.start(task.id); h.engine.action(task.id, 'stop');
  h.time.tick(250); assert.equal(h.writes.filter((value) => value.text === '\r').length, 1);
  h.finish('a'); assert.equal(h.state(task.id).state, 'stopped'); assert.equal(h.pastes().length, 1);
});

test('optional approval is required before the selected step', (t) => {
  const h = harness(t); const task = h.task([h.step('a', 'Review me', { approval: true })]);
  h.engine.start(task.id); assert.equal(h.state(task.id).state, 'approval'); assert.equal(h.pastes().length, 0);
  h.engine.action(task.id, 'approve'); assert.equal(h.pastes().length, 1);
});

test('one-shot trigger waits for a submitted turn and can attach its answer', (t) => {
  const h = harness(t); const task = h.task([h.step('b', 'Continue', { includePrevious: true })], { afterAgent: 'a' });
  h.engine.start(task.id); h.hook('a', 'Stop'); h.time.tick(410); assert.equal(h.pastes().length, 0);
  h.hook('a', 'UserPromptSubmit', { turn_id: 'trigger' });
  h.hook('a', 'Stop', { turn_id: 'stale' }); h.time.tick(410); assert.equal(h.pastes().length, 0);
  h.hook('a', 'Stop', { turn_id: 'trigger', last_assistant_message: 'Trigger result' }); h.time.tick(410);
  assert.equal(h.pastes().length, 1); assert.match(h.pastes()[0].text, /Trigger result/);
  h.hook('a', 'Stop'); h.time.tick(410); assert.equal(h.pastes().length, 1);
});

test('missing text blocks an attachment instead of sending an invented result', (t) => {
  const h = harness(t); const task = h.task([h.step(), h.step('b', 'Review', { includePrevious: true })]);
  h.engine.start(task.id); h.time.tick(250); h.finish('a', '');
  assert.equal(h.state(task.id).state, 'failed'); assert.match(h.state(task.id).error, /replyMissing/); assert.equal(h.pastes().length, 1);
});

test('closing an agent cancels future steps and delayed Enter retries', (t) => {
  const h = harness(t); const task = h.task([h.step(), h.step('b')]); h.engine.start(task.id);
  h.status.delete('a'); h.relay.onStatus('a', null); h.engine.onStatus('a', null); h.time.tick(35000);
  assert.equal(h.state(task.id).state, 'failed'); assert.equal(h.writes.length, 1);
});

test('startup waits for SessionStart before any automatic delivery', (t) => {
  const h = harness(t); h.status.get('a').ready = false;
  const task = h.task([h.step()]); h.engine.start(task.id); h.time.tick(1000); assert.equal(h.pastes().length, 0);
  h.hook('a', 'SessionStart'); h.time.tick(0); assert.equal(h.pastes().length, 1);
});

test('submission without confirmation fails and never mixes a following prompt into the terminal', (t) => {
  const h = harness(t); const one = h.task([h.step('a', 'One')]); const two = h.task([h.step('a', 'Two')]);
  h.engine.start(one.id); h.engine.start(two.id); h.time.tick(35000);
  assert.equal(h.state(one.id).state, 'failed'); assert.match(h.state(one.id).error, /unconfirmed/);
  assert.equal(h.pastes().length, 1); assert.equal(h.state(two.id).phase, 'queued');
});

test('tool activity without UserPromptSubmit neither confirms the step nor leaves it waiting forever', (t) => {
  const h = harness(t); const task = h.task([h.step()]);
  h.engine.start(task.id); h.time.tick(250);
  h.status.get('a').status = 'working'; h.time.tick(35000);
  assert.equal(h.state(task.id).state, 'failed'); assert.match(h.state(task.id).error, /unconfirmed/);
  assert.equal(h.writes.filter((value) => value.text === '\r').length, 1);
});

test('a different session or a new manual prompt stops a sequence', (t) => {
  const h = harness(t); const task = h.task([h.step(), h.step('b')]);
  h.engine.start(task.id); h.time.tick(250); h.hook('a', 'UserPromptSubmit', { turn_id: 'first' });
  h.hook('a', 'UserPromptSubmit', { turn_id: 'first' }); assert.equal(h.state(task.id).state, 'running');
  h.hook('a', 'UserPromptSubmit', { turn_id: 'manual' }); assert.equal(h.state(task.id).state, 'failed');
  assert.match(h.state(task.id).error, /interrupted/);
});

test('saved tasks persist and active runs are interrupted with no automatic replay', (t) => {
  const h = harness(t); const task = h.task([h.step()]); h.engine.start(task.id);
  h.engine.dispose(); h.relay.dispose();
  const restored = load('taskSequences.cjs', h.time).createTaskSequences(h.dir, h.deps);
  t.after(() => restored.dispose());
  assert.equal(restored.list().tasks[0].run.state, 'interrupted');
  assert.equal(restored.list().tasks[0].steps[0].prompt, 'Do the work');
  h.time.tick(35000); assert.equal(h.pastes().length, 1);
});

test('corrupt task storage is preserved and blocks all writes', (t) => {
  const h = harness(t); h.engine.dispose();
  const file = path.join(h.dir, 'task-sequences.json'); fs.writeFileSync(file, '{broken');
  const restored = load('taskSequences.cjs', h.time).createTaskSequences(h.dir, h.deps); t.after(() => restored.dispose());
  assert.match(restored.list().error, /storage/);
  assert.throws(() => restored.save({ title: 'No', steps: [h.step()] }), /storage/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('invalid templates, unsupported targets and edits to active tasks are rejected', (t) => {
  const h = harness(t);
  assert.throws(() => h.task([]), /invalid/);
  assert.throws(() => h.task([h.step('a', '\x1b[201~danger')] ), /invalid/);
  const missing = h.task([h.step('unknown')]); assert.throws(() => h.engine.start(missing.id), /agentMissing/);
  const task = h.task([h.step()]); h.engine.start(task.id);
  assert.throws(() => h.engine.save(task, task.id), /active/); assert.throws(() => h.engine.remove(task.id), /active/);
});

test('a storage write failure interrupts execution before a prompt is pasted', (t) => {
  const h = harness(t); const task = h.task([h.step()]);
  fs.mkdirSync(path.join(h.dir, 'task-sequences.json.tmp'));
  assert.throws(() => h.engine.start(task.id), /storage/);
  assert.equal(h.pastes().length, 0); assert.match(h.engine.list().error, /storage/);
  const disk = JSON.parse(fs.readFileSync(path.join(h.dir, 'task-sequences.json'), 'utf8'));
  assert.equal(disk.tasks[0].run, null);
});

test('manual input during transcript collection cancels the sequence and its future steps', (t) => {
  const h = harness(t); const task = h.task([h.step(), h.step('b')]);
  h.engine.start(task.id); h.time.tick(250);
  h.hook('a', 'UserPromptSubmit', { turn_id: 'first' });
  h.hook('a', 'Stop', { turn_id: 'first', last_assistant_message: 'Old response' });
  h.hook('a', 'UserPromptSubmit', { turn_id: 'manual' }); h.time.tick(1000);
  assert.equal(h.state(task.id).state, 'failed'); assert.equal(h.pastes().length, 1);
});

test('activity-based relay targets still release the shared queue after their work', (t) => {
  const h = harness(t);
  h.status.get('a').mode = 'activity';
  h.relay.enqueue('a', { id: 'one', key: 'one', text: 'First relay', chain: { counts: new Map() } });
  h.relay.enqueue('a', { id: 'two', key: 'two', text: 'Second relay', chain: { counts: new Map() } });
  assert.equal(h.pastes().length, 1); h.time.tick(250);
  h.status.get('a').status = 'working'; h.relay.onStatus('a', h.status.get('a'));
  h.status.get('a').status = 'done'; h.relay.onStatus('a', h.status.get('a')); h.time.tick(0);
  assert.equal(h.pastes().length, 2); assert.match(h.pastes()[1].text, /Second relay/);
});
