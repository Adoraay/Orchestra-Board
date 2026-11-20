const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

test('startup cleanup removes card profiles of deleted cards only', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-codex-'));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const codex = load('codexProfile.cjs', {
    './claudeHooks.cjs': { mcpServerPath: () => 'mcpServer.cjs' },
    './hookServer.cjs': { hookBase: () => 'http://127.0.0.1/hook', toolUrl: () => 'http://127.0.0.1/tool' },
  });
  const servers = { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } };
  const kept = codex.profileFor('kept-card', servers);
  const removed = codex.profileFor('deleted-card', servers);
  fs.writeFileSync(path.join(home, 'orchestra.config.toml'), '');
  fs.writeFileSync(path.join(home, 'config.toml'), '');

  codex.pruneCardProfiles(['kept-card']);

  const files = fs.readdirSync(home).sort();
  assert.deepEqual(files, ['config.toml', `${kept}.config.toml`, 'orchestra.config.toml'].sort());
  assert.ok(!files.includes(`${removed}.config.toml`));
});
