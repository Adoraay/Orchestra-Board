const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');

module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const server = http.createServer((request, response) => {
    const errorPage = request.url === '/error';
    response.writeHead(errorPage ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><body><h1>Ready</h1><button>Start test</button><script>
      document.querySelector('button').onclick = async () => {
        await fetch('/data');
        document.querySelector('h1').textContent = 'Completed';
      };
      ${errorPage ? "console.error('fixture browser error');" : ''}
    </script></body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const set = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  })()`);
  const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards
    .flatMap((board) => board.nodes).find((node) => node.type === 'visualTest');

  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    await until("!!document.querySelector('[data-tool=visualTest]') && !document.querySelector('.splash')");
    await click('[data-tool=visualTest]');
    await evaluate("document.querySelector('.react-flow__pane').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 570, clientY: 375 }))");
    await until("!!document.querySelector('.visual-test-node')");
    await set('.visual-test-node input[type=url]', url);
    // Une nouvelle case a déjà une étape d'exemple : elle devient le clic.
    await set('.visual-test-step select', 'click');
    await set('.visual-test-step input', 'role:button:Start test');
    await click('.visual-test-node fieldset > button');
    await set('.visual-test-steps li:last-child select', 'text');
    await set('.visual-test-steps li:last-child .visual-test-step input', 'role:heading');
    await set('.visual-test-value', 'Completed');

    await click('.visual-test-node button[type=submit]');
    await until("!!document.querySelector('.visual-test-header [role=status]')");
    await click('.tab-add');
    await until("!document.querySelector('.visual-test-node')");
    await evaluate("document.querySelector('.board-tab.rename').blur()");
    for (let attempt = 0; attempt < 120 && !saved()?.data.lastResult; attempt++) await sleep(100);
    const successful = saved().data.lastResult;
    assert.equal(successful.failure, '');
    assert.equal(successful.status, 200);
    assert.ok(successful.network.some((entry) => entry.status === 200 && entry.url.endsWith('/data')));
    assert.ok(successful.screenshot.startsWith('data:image/jpeg;base64,'));

    await evaluate("[...document.querySelectorAll('.board-tabs [role=tab]')].find((tab) => tab.textContent.includes('Original')).click()");
    await until("document.querySelector('.visual-test-result')?.textContent.includes('Passed')");
    await until("document.querySelector('.visual-test-evidence img')?.naturalWidth > 0");
    await win.webContents.capturePage(undefined, { stayHidden: true });
    await sleep(250);
    const screenshot = await win.webContents.capturePage(undefined, { stayHidden: true });
    fs.writeFileSync(path.join(data, 'visual-test-on-map.png'), screenshot.toPNG());

    await click('.visual-test-setup > summary');
    await set('.visual-test-node input[type=url]', `${url}/error`);
    await click('.visual-test-node button[type=submit]');
    await until("document.querySelector('.visual-test-result')?.textContent.includes('received 500')");
    assert.match(await evaluate("document.querySelector('.visual-test-result').textContent"), /fixture browser error/);
    for (let attempt = 0; attempt < 30 && saved()?.data.lastResult?.status !== 500; attempt++) await sleep(100);
    const runner = saved();
    assert.equal(runner?.data.lastResult?.status, 500);

    // Exercise the same token-checked endpoint the QA card's stdio MCP process calls.
    const workspace = await evaluate('window.workspace.get()');
    const active = workspace.boards.find((board) => board.id === workspace.activeBoardId);
    const qaId = 'fixture-qa';
    active.nodes.push({ id: qaId, type: 'terminal', position: { x: 0, y: 0 }, data: { agentId: 'codex' } });
    active.edges.push({ id: 'fixture-visual-link', source: qaId, target: runner.id, data: { mode: 'visual' } });
    await evaluate(`window.workspace.set(${JSON.stringify(workspace)})`);
    const agentStatus = require('../electron/agentStatus.cjs');
    const { hookUrl, toolUrl } = require('../electron/hookServer.cjs');
    const endpointToken = (url) => new URL(url).searchParams.get('t');
    assert.notEqual(endpointToken(toolUrl(qaId)), endpointToken(toolUrl('fixture-other')));
    assert.notEqual(endpointToken(toolUrl(qaId)), endpointToken(hookUrl(qaId)));
    const readRun = async () => (await fetch(toolUrl(qaId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'read_visual_test' }),
    })).json();
    assert.equal((await readRun()).isError, true);
    agentStatus.register(qaId, 'hooks');
    try {
      const response = await readRun();
      assert.equal(response.isError, false);
      const { last_run: run } = JSON.parse(response.text);
      assert.equal(run.status, 500);
      assert.equal(run.passed, false);
      assert.equal(run.screenshot_on_board, true);
      assert.doesNotMatch(response.text, /base64|fixture browser error/);
    } finally {
      agentStatus.unregister(qaId);
    }
    assert.deepEqual(errors, []);
  } finally {
    server.closeAllConnections();
    server.close();
  }
};
