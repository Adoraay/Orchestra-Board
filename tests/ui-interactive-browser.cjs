const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { session, webContents } = require('electron');
const { BROWSER_PARTITION, BROWSER_DRAG_TYPE } = require('../electron/browserModel.mjs');
const { toolUrl } = require('../electron/hookServer.cjs');
const status = require('../electron/agentStatus.cjs');

module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const requests = [];
  const fixtureCookieValue = 'fixture-value-private';
  const server = http.createServer((request, response) => {
    requests.push({ url: request.url, cookies: request.headers.cookie });
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/first') response.setHeader('Set-Cookie', `fixture_pref=${fixtureCookieValue}; Path=/; HttpOnly; Max-Age=3600`);
    const title = request.url === '/first' ? 'First fixture' : 'Second fixture';
    response.end(`<title>${title}</title><input id="retained"><a href="/second">Continue</a><script>console.error(new TypeError('fixture diagnostic'))</script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = `${base}/first`;
  const second = `${base}/second`;
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const active = '.browser-webview:not([style*="display: none"])';
  const address = '.browser-navigation input';
  const waitForUrl = (url) => until(`document.querySelector('${address}')?.value === ${JSON.stringify(url)} && !document.querySelector('.browser-loading')`);
  const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards[0].nodes.filter((node) => node.type === 'interactiveBrowser');
  async function fill(selector, value) {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  async function navigate(url) {
    await fill(address, url);
    await evaluate(`document.querySelector('.browser-navigation').requestSubmit()`);
    await waitForUrl(url);
  }

  try {
    await until("!!document.querySelector('.dock-browser') && !document.querySelector('.splash')");
    await click('.dock-browser');
    await until("!document.querySelector('[aria-label=Reload]')?.disabled && !!document.querySelector('.browser-webview')");
    await click('.dock-browser');
    assert.equal(await evaluate("document.querySelectorAll('.interactive-browser-node').length"), 1);
    await navigate(first);
    await until("document.querySelector('.browser-tabs [role=tab][aria-selected=true]')?.textContent === 'First fixture'");
    const firstGuestId = await evaluate(`document.querySelector('${active}').getWebContentsId()`);
    const firstGuest = webContents.fromId(firstGuestId);
    assert.equal(firstGuest.session, session.fromPartition(BROWSER_PARTITION));
    assert.notEqual(firstGuest.session, win.webContents.session);
    assert.equal(await firstGuest.executeJavaScript("typeof require + ':' + typeof window.workspace"), 'undefined:undefined');
    await firstGuest.executeJavaScript("document.querySelector('#retained').value = 'keep me'");

    await click('[aria-label="New tab URL"]');
    await fill('.browser-popover input', second);
    await click('.browser-popover button[type=submit]');
    await click('[aria-label="New tab"]');
    await waitForUrl(second);
    await until("document.querySelector('.browser-tabs [role=tab][aria-selected=true]')?.textContent === 'Second fixture'");
    assert.equal(await evaluate("document.querySelectorAll('webview').length"), 2);
    assert.equal(requests.find((request) => request.url === '/second').cookies, `fixture_pref=${fixtureCookieValue}`);
    await click('.browser-tabs [role=tab]');
    await waitForUrl(first);
    assert.equal(await evaluate(`document.querySelector('${active}').getWebContentsId()`), firstGuestId);
    assert.equal(await firstGuest.executeJavaScript("document.querySelector('#retained').value"), 'keep me');

    await navigate(second);
    await until("!document.querySelector('[aria-label=Back]').disabled");
    await click('[aria-label=Back]');
    await waitForUrl(first);
    await until("!document.querySelector('[aria-label=Forward]').disabled");
    await click('[aria-label=Forward]');
    await waitForUrl(second);
    const beforeReload = requests.length;
    await click('[aria-label=Reload]');
    for (let i = 0; i < 50 && requests.length === beforeReload; i++) await sleep(40);
    assert.ok(requests.length > beforeReload);
    await waitForUrl(second);

    await click('[aria-label=Cookies]');
    await until("document.querySelector('.browser-cookie-list')?.textContent.includes('fixture_pref')");
    assert.equal(await evaluate(`document.querySelector('.browser-popover').textContent.includes(${JSON.stringify(fixtureCookieValue)})`), false);
    assert.equal(await evaluate("document.querySelector('.browser-cookie-form input[readonly]').value"), '127.0.0.1');
    const cookieValue = '.browser-cookie-form input:not([readonly])';
    const saveCookie = '.browser-cookie-form button[type=submit]';
    const cookieSaved = "document.querySelector('.browser-cookie-feedback')?.textContent === 'Preference saved.'";
    await fill(cookieValue, 'dark');
    await click(saveCookie);
    await until(cookieSaved);
    const [theme] = await firstGuest.session.cookies.get({ url: second, name: 'theme' });
    assert.equal(theme.value, 'dark');
    assert.equal(theme.hostOnly, true);
    assert.equal(theme.session, false);

    await click('[aria-label="Edit theme at /"]');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(cookieValue)}).value`), 'dark');
    await fill(cookieValue, 'light');
    await click(saveCookie);
    await until(cookieSaved);
    const [editedTheme] = await firstGuest.session.cookies.get({ url: second, name: 'theme' });
    assert.equal(editedTheme.value, 'light');
    assert.equal(editedTheme.expirationDate, theme.expirationDate);

    await click('.browser-cookie-form button[type=button]');
    await evaluate(`(() => {
      const select = document.querySelector('.browser-cookie-form select');
      select.value = 'locale';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await fill(cookieValue, 'pt-BR');
    await click(saveCookie);
    await until(cookieSaved);
    const [locale] = await firstGuest.session.cookies.get({ url: second, name: 'locale' });
    assert.equal(locale.value, 'pt-BR');
    assert.equal(locale.domain, '127.0.0.1');
    assert.equal(locale.hostOnly, true);

    await firstGuest.session.cookies.set({ url: second, name: 'locale', value: 'en-US', path: '/second', sameSite: 'strict' });
    await click('[aria-label=Cookies]');
    await click('[aria-label=Cookies]');
    await until("!!document.querySelector('[aria-label=\"Edit locale at /second\"]')");
    await click('[aria-label="Edit locale at /second"]');
    await fill(cookieValue, 'fr-CA');
    await click(saveCookie);
    await until(cookieSaved);
    const editedLocales = await firstGuest.session.cookies.get({ url: second, name: 'locale' });
    const pageLocale = editedLocales.find((cookie) => cookie.path === '/second');
    assert.equal(pageLocale.value, 'fr-CA');
    assert.equal(pageLocale.session, true);
    assert.equal(pageLocale.sameSite, 'strict');
    assert.equal(editedLocales.find((cookie) => cookie.path === '/').value, 'pt-BR');

    const rejected = await evaluate(`window.interactiveBrowser.savePreferenceCookie(${firstGuestId}, ${JSON.stringify(second)}, { name: 'theme', value: 'dark', domain: 'example.test' })`);
    assert.equal(rejected, null);
    assert.equal((await firstGuest.session.cookies.get({ url: second, name: 'fixture_pref' }))[0].value, fixtureCookieValue);
    await click('.browser-popover button.danger');
    await click('.browser-popover-actions button.danger');
    await until("document.querySelector('.browser-popover')?.textContent.includes('No cookies match')");
    assert.deepEqual(await firstGuest.session.cookies.get({ url: second }), []);
    await click('[aria-label=Cookies]');
    await click('.browser-tab:nth-child(2) .browser-button');
    await until("document.querySelectorAll('.browser-tab').length === 1");

    const drag = await evaluate(`(() => {
      const dataTransfer = new DataTransfer();
      const board = document.querySelector('.board');
      const rect = board.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, clientX: rect.left + 220, clientY: rect.top + 200, dataTransfer };
      document.querySelector('.dock-browser').dispatchEvent(new DragEvent('dragstart', init));
      const accepted = !board.dispatchEvent(new DragEvent('dragover', init));
      board.dispatchEvent(new DragEvent('drop', init));
      return [accepted, dataTransfer.getData(${JSON.stringify(BROWSER_DRAG_TYPE)})];
    })()`);
    assert.deepEqual(drag, [true, 'browser']);
    await until("document.querySelectorAll('.interactive-browser-node').length === 2");
    for (let i = 0; i < 50 && saved().length !== 2; i++) await sleep(40);
    assert.equal(saved().length, 2);
    assert.deepEqual(saved()[0].data.tabs.map(({ url, title }) => ({ url, title })), [{ url: second, title: 'Second fixture' }]);
    assert.equal(saved()[0].data.newTabUrl, second);

    const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload();
    await reloaded;
    await until("document.querySelectorAll('.interactive-browser-node').length === 2 && document.querySelector('.browser-tabs [role=tab]')?.textContent === 'Second fixture'");
    assert.equal(await evaluate(`document.querySelector('${address}').value`), second);

    await waitForUrl(second);
    await until("!document.querySelector('[aria-label=Reload]').disabled");
    await sleep(650);
    // Register a test caller and store its link without launching an agent executable.
    const workspace = await evaluate('window.workspace.get()');
    const board = workspace.boards[0];
    const browserId = saved()[0].id;
    board.nodes.push({ id: 'qa', type: 'terminal', position: { x: 0, y: 0 }, data: { agentId: 'codex' } });
    board.edges.push({ id: 'browser-link', source: 'qa', target: browserId, data: { mode: 'browser' } });
    await evaluate(`window.workspace.set(${JSON.stringify(workspace)})`);
    status.register('qa', 'hooks');
    async function tool(command, args) {
      const response = await fetch(toolUrl('qa'), { method: 'POST', body: JSON.stringify({ name: `orchestra_browser_${command}`, arguments: args }) });
      return response.json();
    }
    const state = await tool('get_state');
    assert.equal(state.isError, false);
    const [tab] = JSON.parse(state.text).tabs;
    assert.equal(tab.url, second);
    assert.equal(tab.title, 'Second fixture');
    assert.equal(tab.consoleErrors[0].type, 'TypeError');
    assert.equal((await tool('navigate', { tabId: tab.tabId, url: first })).isError, false);
    await waitForUrl(first);
    assert.equal((await tool('reload', { tabId: tab.tabId })).isError, false);
    assert.deepEqual(errors, []);
  } finally {
    status.unregister('qa');
    server.close();
  }
};
