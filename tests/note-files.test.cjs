const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { setTimeout: wait } = require('node:timers/promises');
const { createNoteFiles } = require('../electron/noteFiles.cjs');

const workspace = { boards: [{ nodes: [{ id: 'note', type: 'note' }] }] };

function setup(t, contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-note-'));
  const profile = path.join(root, 'profile');
  const file = path.join(root, 'BACKLOG.md');
  fs.writeFileSync(file, contents);
  const events = [];
  const service = createNoteFiles(profile, (id, state) => events.push({ id, state }));
  t.after(() => {
    service.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });
  service.setWorkspace(workspace);
  return { service, file, profile, events };
}

test('cycles task markers while preserving BOM, UTF-8, CRLF and non-task content', (t) => {
  const contents = '\uFEFF# Etapas da revisão\r\n    1. [ ] Fazer revisão\r\n```md\r\n- [ ] Exemplo\r\n```\r\n';
  const { service, file } = setup(t, contents);
  let state = service.link('note', file);
  assert.equal(state.text.startsWith('# Etapas'), true);
  assert.deepEqual(state.tasks, [{ line: 1, marker: ' ', label: 'Fazer revisão' }]);
  for (const marker of ['~', 'x', ' ']) {
    state = service.toggle('note', 1, state.revision);
    assert.equal(state.tasks[0].marker, marker);
    assert.equal(fs.readFileSync(file, 'utf8'), contents.replace('1. [ ]', `1. [${marker}]`));
  }
  assert.throws(() => service.toggle('note', 3, state.revision), { noteKey: 'note.fileConflict' });
});

test('notifies on external replacements and rejects stale checkboxes', async (t) => {
  const { service, file, events } = setup(t, '- [ ] Before\n');
  const { revision } = service.link('note', file);
  const replace = (contents) => {
    fs.writeFileSync(`${file}.tmp`, contents);
    fs.renameSync(`${file}.tmp`, file);
  };
  replace('- [~] Renamed by editor\n');
  for (let i = 0; i < 40 && !events.at(-1)?.state.text.includes('Renamed'); i++) await wait(50);
  assert.equal(events.at(-1).state.text, '- [~] Renamed by editor\n');
  replace('- [x] Latest version\n');
  assert.throws(() => service.toggle('note', 0, revision), { noteKey: 'note.fileConflict' });
  assert.equal(fs.readFileSync(file, 'utf8'), '- [x] Latest version\n');
  assert.equal(service.get('note').text, '- [x] Latest version\n');
});

test('restores links across launches, stops removed note watches, and unlinks without modifying the file', (t) => {
  const { service, file, profile } = setup(t, '- [ ] Backlog\n');
  service.link('note', file);
  service.setWorkspace({ boards: [] });
  assert.equal(service.get('note'), null);
  service.dispose();

  const restored = createNoteFiles(profile, () => {});
  t.after(restored.dispose);
  restored.setWorkspace(workspace);
  assert.equal(restored.get('note').text, '- [ ] Backlog\n');
  restored.unlink('note');
  restored.setWorkspace(workspace);
  assert.equal(restored.get('note'), null);
  assert.equal(fs.readFileSync(file, 'utf8'), '- [ ] Backlog\n');
});

test('binding requires local UTF-8 Markdown and rejects directories', (t) => {
  const { service, file } = setup(t, Buffer.from([0xff, 0xfe, 0x00]));
  assert.throws(() => service.link('note', file), { noteKey: 'note.fileEncoding' });
  assert.throws(() => service.link('note', 'BACKLOG.md'), { noteKey: 'note.fileInvalid' });
  const directory = path.join(path.dirname(file), 'directory.md');
  fs.mkdirSync(directory);
  assert.throws(() => service.link('note', directory), { noteKey: 'note.fileUnavailable' });
  assert.equal(service.get('note'), null);
});
