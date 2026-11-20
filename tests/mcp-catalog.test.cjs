const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createMcpCatalog } = require('../electron/mcpCatalog.cjs');
const { load } = require('./helpers.cjs');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-mcp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, catalog: createMcpCatalog(dir) };
}

test('cards can inherit board MCPs, replace them or explicitly select none', (t) => {
  const { dir, catalog } = setup(t);
  assert.deepEqual(catalog.resolve('first', 'one'), {});
  catalog.save('first', null, { selection: ['linear', 'chrome-devtools', 'linear', 'unknown'] });
  catalog.save('first', 'one', { selection: [] });
  catalog.save('first', 'two', { selection: ['agent-browser'] });
  const restored = createMcpCatalog(dir);
  assert.deepEqual(Object.keys(restored.resolve('first', 'inherited')), ['linear', 'chrome-devtools']);
  assert.deepEqual(Object.keys(restored.resolve('first', 'one')), []);
  assert.deepEqual(Object.keys(restored.resolve('first', 'two')), ['agent-browser']);
  assert.deepEqual(restored.resolve('other', 'two'), {});
  restored.save('first', 'one', { selection: null });
  assert.deepEqual(Object.keys(restored.resolve('first', 'one')), ['linear', 'chrome-devtools']);
});

test('only local registry entries are selectable and removing one clears all assignments', (t) => {
  const { catalog } = setup(t);
  for (const id of ['orchestra', '__proto__', 'constructor', 'linear', 'some.command']) {
    assert.throws(() => catalog.save('board', null, { add: { id, type: 'http', url: 'https://example.com/mcp' } }), /invalidServer/);
  }
  assert.throws(() => catalog.save('board', null, { add: { id: 'm', type: 'http', url: 'https://user:pass@example.com' } }), /invalidUrl/);
  assert.throws(() => catalog.save('board', null, { add: { id: 'm', type: 'http', url: 'file:///somewhere' } }), /invalidUrl/);
  catalog.save('board', null, { add: { id: 'dev', type: 'http', url: 'http://127.0.0.1:3001/mcp' }, selection: ['dev'] });
  catalog.save('board', 'qa', { selection: ['dev'] });
  assert.equal(catalog.resolve('board', 'qa').dev.url, 'http://127.0.0.1:3001/mcp');
  catalog.save('board', 'qa', { remove: 'dev' });
  assert.deepEqual(catalog.resolve('board', 'qa'), {});
  assert.deepEqual(catalog.resolve('board', 'other'), {});
});

test('Claude and Codex receive card-specific servers alongside Orchestra', (t) => {
  const { dir, catalog } = setup(t);
  catalog.save('board', 'first', { selection: ['linear'] });
  catalog.save('board', 'second', { selection: ['agent-browser'] });
  const hooks = { toolUrl: () => 'http://127.0.0.1:1000/tool' };
  const claude = load('claudeHooks.cjs', { electron: { app: { getPath: () => dir } }, './hookServer.cjs': hooks });
  const codex = load('codexProfile.cjs', {
    './claudeHooks.cjs': claude, './hookServer.cjs': hooks, os: { homedir: () => dir },
    fs: {
      ...fs,
      existsSync: (file) => fs.existsSync(path.join(dir, path.basename(file))),
      readFileSync: (file, encoding) => fs.readFileSync(path.join(dir, path.basename(file)), encoding),
      mkdirSync: () => {},
      writeFileSync: (file, data) => fs.writeFileSync(path.join(dir, path.basename(file)), data),
    },
  });
  const first = catalog.resolve('board', 'first');
  const second = catalog.resolve('board', 'second');
  const config = JSON.parse(fs.readFileSync(claude.writeMcpConfig('first', first), 'utf8'));
  assert.deepEqual(Object.keys(config.mcpServers), ['linear', 'orchestra']);
  const a = codex.profileFor('first', first);
  const b = codex.profileFor('second', second);
  assert.notEqual(a, b);
  assert.equal(codex.profileFor('unset', {}), codex.PROFILE);
  const profiles = [a, b].map((name) => fs.readFileSync(path.join(dir, name + '.config.toml'), 'utf8'));
  assert.match(profiles[0], /\[mcp_servers\."linear"\]\nurl = "https:\/\/mcp.linear.app\/mcp"/);
  assert.doesNotMatch(profiles[0], /agent-browser/);
  assert.match(profiles[1], /\[mcp_servers\."agent-browser"\]/);
  assert.doesNotMatch(profiles[1], /linear/);
  for (const profile of profiles) assert.match(profile, /\[mcp_servers.orchestra\]/);
});
