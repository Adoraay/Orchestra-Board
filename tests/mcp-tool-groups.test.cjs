const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

// Faux Orchestra : répond aux appels d'outils du serveur MCP avec les groupes donnés.
async function fakeOrchestra(groups) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const { name } = JSON.parse(body);
      const text = name === 'orchestra_tool_groups' ? JSON.stringify(groups) : 'ok';
      res.end(JSON.stringify({ text, isError: false }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function listTools(groups) {
  const server = await fakeOrchestra(groups);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'electron', 'mcpServer.cjs')], {
    env: { ...process.env, ORCHESTRA_URL: `http://127.0.0.1:${server.address().port}/tool/case?t=x` },
  });
  try {
    const answer = new Promise((resolve) => {
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk;
        const line = out.split('\n').find((l) => l.includes('"id":2'));
        if (line) resolve(JSON.parse(line).result.tools.map((tool) => tool.name));
      });
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    return await answer;
  } finally {
    child.kill();
    server.close();
  }
}

test('browser and visual test tools are hidden from tiles without such a link', async () => {
  const names = await listTools([]);
  assert.ok(names.includes('list_agents'));
  assert.ok(!names.some((name) => name.startsWith('orchestra_browser_')));
  assert.ok(!names.includes('list_visual_tests'));
});

test('a browser link shows only the browser tools', async () => {
  const names = await listTools(['browser']);
  assert.ok(names.includes('orchestra_browser_navigate'));
  assert.ok(!names.includes('read_visual_test'));
});

test('a visual test link shows only the visual test tools', async () => {
  const names = await listTools(['visual']);
  assert.ok(names.includes('read_visual_test'));
  assert.ok(!names.includes('orchestra_browser_get_state'));
});
