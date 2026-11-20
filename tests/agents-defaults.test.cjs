const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load } = require('./helpers.cjs');

// Agents de base : Antigravity remplace Gemini CLI, qui n'est plus pris en charge, même ajouté à la main.
function store(t, saved) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-agents-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (saved) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(saved));
  return load('settingsStore.cjs', { electron: { app: { getPath: () => dir }, ipcMain: { handle: () => {} } } });
}

test('Antigravity is a default agent and Gemini CLI is gone', (t) => {
  const { agents } = store(t).load();
  assert.deepEqual(agents.map((a) => a.id), ['claude-code', 'codex', 'antigravity', 'shell']);
  const agy = agents.find((a) => a.id === 'antigravity');
  assert.equal(agy.builtin, true);
  assert.equal(agy.command, 'agy');
});

test('Gemini is refused from older settings and from hand-made agents', (t) => {
  const custom = (id, name, command) => ({ id: `custom-${id}`, name, command });
  const { agents } = store(t, {
    agents: [
      { id: 'gemini', hidden: false },
      { id: 'antigravity', catalog: true, hidden: true },
      custom('aaaa1', 'My Gemini', 'node x.js'),
      custom('aaaa2', 'Helper', 'gemini --yolo'),
      custom('aaaa3', 'Helper 2', '"C:\\Program Files\\Google\\gemini.exe" -p'),
      custom('aaaa4', 'Helper 3', 'C:\\tools\\gemini.cmd'),
      custom('aaaa5', 'Helper 4', 'npx @google/gemini-cli'),
      custom('aaaa6', 'Aider', 'aider'),
      custom('aaaa7', 'Gemma', 'geminify'),
    ],
  }).load();
  const ids = agents.map((a) => a.id);
  assert.equal(ids.includes('gemini'), false);
  assert.deepEqual(ids.filter((id) => id.startsWith('custom-')), ['custom-aaaa6', 'custom-aaaa7']);
  // Un Antigravity ajouté depuis l'ancien catalogue devient l'agent de base, réglage « masqué » gardé.
  const agy = agents.find((a) => a.id === 'antigravity');
  assert.equal(agy.builtin, true);
  assert.equal(agy.hidden, true);
});
