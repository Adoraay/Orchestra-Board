const assert = require('node:assert/strict');
const { createMcpCatalog } = require('../electron/mcpCatalog.cjs');
const pty = require('../electron/ptyManager.cjs');
const status = require('../electron/agentStatus.cjs');

module.exports = async ({ evaluate, until, sleep, data, errors }) => {
  const button = async (name, selector = 'button') => {
    const expression = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(button => button.textContent.trim() === ${JSON.stringify(name)})`;
    await until(`!!(${expression})`);
    await evaluate(`(${expression}).click()`);
  };
  const checkbox = (name) => `[...document.querySelectorAll('.mcp-settings label')].find(label => label.textContent.trim() === ${JSON.stringify(name)})?.querySelector('input')`;
  const toggle = async (name, checked) => {
    const input = checkbox(name);
    await until(`(${input})?.checked === ${!checked} && !(${input}).matches(':disabled')`);
    await evaluate(`(${input}).click()`);
    await until(`(${input})?.checked === ${checked} && !(${input}).matches(':disabled')`);
  };
  await button('View board');
  await until("!document.querySelector('.splash')");
  await evaluate("document.querySelector('.settings-toggle').click()");
  await button('MCP', '[role=tab]');
  await toggle('Linear', true);
  await evaluate(`(() => {
    const select = document.querySelector('.mcp-settings select');
    select.value = 'role-agent';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await until(`(${checkbox('Linear')})?.checked && (${checkbox('Linear')}).matches(':disabled')`);
  await toggle('Use board defaults', false);
  await toggle('Linear', false);
  await toggle('Chrome DevTools', true);
  const catalog = createMcpCatalog(data);
  assert.deepEqual(catalog.get('roles', 'role-agent').board, ['linear']);
  assert.deepEqual(catalog.get('roles', 'role-agent').card, ['chrome-devtools']);
  await evaluate("document.querySelector('.modal-header button').click()");

  status.register('role-agent', 'hooks', { name: 'Reviewer', notify: false });
  for (let i = 0; i < 100 && !(pty.buffer('smoke-terminal') ?? '').includes('>'); i++) await sleep(100);
  assert.ok(pty.buffer('smoke-terminal')?.includes('>'));
  await evaluate("window.pty.write('smoke-terminal', 'echo relay-output-smoke')");
  await sleep(150);
  await evaluate("window.pty.write('smoke-terminal', '\\r')");
  await until("window.relay.pending().then(list => list.length === 1 && list[0].state === 'draft')");
  const [draft] = await evaluate('window.relay.pending()');
  assert.equal(draft.text, 'Check relay-output-smoke', JSON.stringify(pty.buffer('smoke-terminal')));
  assert.deepEqual(errors, []);
};
