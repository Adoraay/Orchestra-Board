const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./helpers.cjs');

test('login shells and terminal IDs coexist after the macOS merge', () => {
  const spawned = [];
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../electron/ptyManager.cjs'), 'utf8');
  const pty = { spawn(file, args, options) {
    const term = { onData(fn) { this.data = fn; }, onExit(fn) { this.exit = fn; }, kill() { this.exit({ exitCode: 0 }); } };
    spawned.push({ file, args, options, term });
    return term;
  } };
  new Function('require', 'module', 'process', source)(
    (name) => name === 'node-pty' ? pty : require(name), module,
    { platform: 'darwin', env: { SHELL: '/bin/zsh', PATH: '/opt/homebrew/bin:/usr/bin' } },
  );
  const manager = module.exports;
  assert.deepEqual(manager.resolveShell('default'), { file: '/bin/zsh', args: ['-l'] });
  assert.deepEqual(manager.resolveShell('cmd'), { file: '/bin/zsh', args: ['-l'] });
  assert.deepEqual(manager.resolveShell('bash'), { file: '/bin/bash', args: ['-l'] });
  const create = () => manager.create({ id: 'mac-agent', cwd: os.tmpdir(), env: { ORCHESTRA_URL: 'local-test' } }, () => {}, () => {});
  create(); create();
  assert.equal(spawned.length, 1);
  assert.deepEqual(manager.ids(), ['mac-agent']);
  assert.equal(spawned[0].options.env.PATH, '/opt/homebrew/bin:/usr/bin');
  assert.equal(spawned[0].options.env.ORCHESTRA_URL, 'local-test');
  spawned[0].term.data('hello');
  assert.equal(manager.buffer('mac-agent'), 'hello');
  manager.killAll();
  assert.deepEqual(manager.ids(), []);
});

test('Codex orchestration preferences and pinned panels survive together', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-mac-merge-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const handlers = new Map();
  const store = load('settingsStore.cjs', { electron: {
    app: { getPath: () => directory }, ipcMain: { handle: (name, action) => handlers.set(name, action) },
  } });
  store.register();
  const initial = store.load();
  assert.equal(initial.general.codexOrchestration, true);
  assert.equal(initial.general.pinned.log, false);
  const codex = initial.agents.find((agent) => agent.hooks === 'codex');
  assert.ok(codex);
  assert.equal(store.findAgent(initial, codex.id).hooks, 'codex');
  handlers.get('settings:set')(null, { ...initial, general: { ...initial.general, codexOrchestration: false, pinned: { log: true, usage: true } } });
  const saved = store.load();
  assert.equal(saved.general.codexOrchestration, false);
  assert.equal(saved.general.pinned.log, true);
  assert.equal(saved.general.pinned.usage, true);
  assert.equal(store.findAgent(saved, codex.id).hooks, null);
  assert.equal(saved.agents.find((agent) => agent.id === codex.id).hooks, 'codex');
});

test('new search and enlarged-terminal shortcuts use Cmd on Mac and Ctrl on Windows', () => {
  const platformSource = fs.readFileSync(path.join(__dirname, '../src/lib/platform.js'), 'utf8').replaceAll('export ', '');
  const shortcutsSource = fs.readFileSync(path.join(__dirname, '../src/lib/shortcuts.js'), 'utf8').replace(/^import .*;\r?\n/m, '').replaceAll('export ', '');
  const hookSource = fs.readFileSync(path.join(__dirname, '../src/hooks/useAppShortcuts.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default function', 'return function');
  for (const platform of ['darwin', 'win32']) {
    const { isMac, MOD_KEY, hasModifier } = new Function('window', platformSource + '\nreturn { isMac, MOD_KEY, hasModifier };')({ appWindow: { platform } });
    const groups = new Function('isMac', 'MOD_KEY', shortcutsSource + '\nreturn SHORTCUT_GROUPS;')(isMac, MOD_KEY);
    for (const label of ['shortcut.search', 'shortcut.maximize']) {
      assert.equal(groups[0].items.find((item) => item.label === label).keys[0], isMac ? '⌘' : 'Ctrl');
    }
    assert.deepEqual(groups[0].items[0].keys, ['Ctrl', 'Tab']);
    const primary = { metaKey: isMac, ctrlKey: !isMac };
    const other = { metaKey: !isMac, ctrlKey: isMac };
    assert.equal(hasModifier(primary), true);
    assert.equal(hasModifier(other), false);
    let listener;
    let searches = 0;
    let boards = 0;
    const hook = new Function('useEffect', 'useRef', 'hasModifier', 'window', 'document', hookSource)(
      (effect) => effect(), (current) => ({ current }), hasModifier,
      { addEventListener: (_name, fn) => { listener = fn; } }, { querySelector: () => null },
    );
    hook({ toggleSearch: () => searches++, cycleBoard: () => boards++ });
    const event = { key: 'F', code: 'KeyF', shiftKey: true, altKey: false, preventDefault() {}, stopPropagation() {} };
    listener({ ...event, ...primary });
    listener({ ...event, ...other });
    assert.equal(searches, 1);
    listener({ ...event, key: 'Tab', ctrlKey: true, metaKey: false });
    assert.equal(boards, 1);
  }
});
