const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { load, i18n } = require('./helpers.cjs');
const {
  BROWSER_DRAG_TYPE, BROWSER_PARTITION, BROWSER_SIZE, BROWSER_DRAG_HANDLE, BLANK_URL,
  addressUrl, browserDropPosition, createBrowserNode, isPreferenceCookieValue, newBrowserTab, sanitizeBrowserData,
} = require('../electron/browserModel.mjs');
const { createInteractiveBrowser } = load('interactiveBrowser.cjs', { './i18n.cjs': i18n });
const { sanitizeContent } = load('workspaceStore.cjs', {
  electron: {}, './settingsStore.cjs': { MODEL: /^\w+$/ }, './i18n.cjs': i18n,
});

test('browser cards are centered and start with one tab; new tabs use the configured URL', () => {
  const node = createBrowserNode({ x: 500, y: 300 }, 'browser');
  assert.equal(node.type, 'interactiveBrowser');
  assert.equal(node.dragHandle, BROWSER_DRAG_HANDLE);
  assert.deepEqual(node.position, { x: 500 - BROWSER_SIZE.width / 2, y: 300 - BROWSER_SIZE.height / 2 });
  assert.equal(node.data.tabs[0].id, node.data.activeTabId);
  assert.equal(node.data.tabs[0].url, BLANK_URL);
  assert.deepEqual(newBrowserTab('https://example.test/start', 'new'), { id: 'new', url: 'https://example.test/start', title: '' });
  assert.equal(addressUrl('example.test:4300/home'), 'https://example.test:4300/home');
  assert.equal(addressUrl(' javascript:alert(1) '), null);
  assert.equal(addressUrl('https://name:password@example.test'), null);
});

test('the Dock accepts its own browser drag payload and transforms the mouse position once', () => {
  const position = ({ x, y }) => ({ x: x / 2 - 10, y: y / 2 - 20 });
  const event = { clientX: 240, clientY: 180, dataTransfer: { getData: (type) => type === BROWSER_DRAG_TYPE ? 'browser' : '' } };
  const center = browserDropPosition(event, position);
  assert.deepEqual(center, { x: 110, y: 70 });
  assert.deepEqual(createBrowserNode(center).position, { x: 110 - BROWSER_SIZE.width / 2, y: 70 - BROWSER_SIZE.height / 2 });
  assert.equal(browserDropPosition({ ...event, dataTransfer: { getData: () => 'terminal' } }, assert.fail), null);
});

test('workspace sanitization preserves tab order, URLs, titles and selection without runtime or cookie data', () => {
  const node = createBrowserNode({ x: 0, y: 0 }, 'browser');
  node.data = {
    tabs: [
      { id: 'a', url: 'https://example.test/docs?q=browser#intro', title: 'Docs\u0000', isLoading: true, canGoBack: true, cookies: ['secret'] },
      { id: 'a', url: 'https://duplicate.test' },
      { id: 'b', url: 'file:///private.html', title: 'Hidden' },
      { id: { toString: () => 'object' }, url: 'https://example.test' },
    ],
    activeTabId: 'b', newTabUrl: 'https://example.test/', partition: 'persist:other', consoleErrors: ['secret'],
  };
  const saved = sanitizeContent({ nodes: [node] }).nodes[0];
  assert.deepEqual(saved.data, {
    tabs: [
      { id: 'a', url: 'https://example.test/docs?q=browser#intro', title: 'Docs' },
      { id: 'b', url: BLANK_URL, title: '' },
    ], activeTabId: 'b', newTabUrl: 'https://example.test/',
  });
  assert.deepEqual(sanitizeBrowserData(null), { tabs: [{ id: 'initial', url: BLANK_URL, title: '' }], activeTabId: 'initial', newTabUrl: BLANK_URL });
});

function fixture() {
  const controller = createInteractiveBrowser();
  const host = new EventEmitter();
  const session = {
    setPermissionCheckHandler(fn) { this.check = fn; },
    setPermissionRequestHandler(fn) { this.permission = fn; },
  };
  controller.attach(host, session);
  return { controller, host, session };
}

test('webview attachment requires the dedicated partition and enforces sandboxed guest preferences', () => {
  const { host, session } = fixture();
  assert.equal(session.check(), false);
  session.permission(null, 'camera', (allowed) => assert.equal(allowed, false));
  const event = { preventDefault: assert.fail };
  const preferences = { nodeIntegration: true, preload: 'preload.cjs', webSecurity: false, webviewTag: true };
  host.emit('will-attach-webview', event, preferences, { partition: BROWSER_PARTITION, src: 'http://localhost:8000/' });
  assert.equal(preferences.preload, undefined);
  for (const key of ['nodeIntegration', 'nodeIntegrationInSubFrames', 'nodeIntegrationInWorker', 'webviewTag', 'allowRunningInsecureContent']) assert.equal(preferences[key], false);
  for (const key of ['sandbox', 'contextIsolation', 'webSecurity']) assert.equal(preferences[key], true);
  let rejected = 0;
  for (const params of [{ partition: 'persist:other', src: BLANK_URL }, { partition: BROWSER_PARTITION, src: 'file:///private.html' }]) {
    host.emit('will-attach-webview', { preventDefault: () => rejected++ }, {}, params);
  }
  assert.equal(rejected, 2);
});

test('preference cookie writes are bound to the current host and preserve attributes on eligible edits', async () => {
  const { controller, host } = fixture();
  const domain = 'prefs.fixture.test';
  const url = `https://${domain}/settings/profile`;
  let currentUrl = url;
  let navigateDuringRead = false;
  const cookieList = [
    { name: 'theme', value: 'dark', domain, hostOnly: true, path: '/settings', secure: true, sameSite: 'strict', expirationDate: 1900000000 },
    { name: 'locale', value: 'en-US', domain, hostOnly: true, path: '/settings', httpOnly: true },
    { name: 'theme', value: 'dark', domain: '.fixture.test', path: '/' },
  ];
  const writes = [];
  const guest = Object.assign(new EventEmitter(), {
    id: 1, isDestroyed: () => false, getURL: () => currentUrl, setWindowOpenHandler() {},
    session: { cookies: {
      async get({ name }) {
        if (navigateDuringRead) currentUrl = 'https://changed.fixture.test/';
        return name ? cookieList.filter((cookie) => cookie.name === name) : cookieList;
      },
      async set(details) { writes.push(details); },
    } },
  });
  host.emit('did-attach-webview', {}, guest);
  const save = (preference, page = url, sender = host) => controller.savePreferenceCookie(sender, 1, page, { domain, ...preference });
  const snapshot = await controller.cookies(host, 1, url);
  assert.equal(snapshot.cookies[0].editableValue, 'dark');
  assert.equal(snapshot.cookies[1].editableValue, undefined);
  assert.equal(snapshot.cookies[2].editableValue, undefined);

  const theme = { name: 'theme', value: 'light', path: '/settings' };
  for (const preference of [
    { ...theme, name: 'session' }, { ...theme, value: 'dark; secure' }, { ...theme, domain: 'fixture.test' },
    { ...theme, domain: `.${domain}` }, { ...theme, path: '/other' }, { ...theme, path: '/' },
    { ...theme, name: 'locale', value: 'pt-BR' },
  ]) assert.equal(await save(preference), null);
  assert.equal(await save(theme, 'https://changed.fixture.test/'), null);
  assert.equal(await save(theme, url, new EventEmitter()), null);
  assert.deepEqual(writes, []);

  assert.ok(await save(theme));
  assert.deepEqual(writes[0], { url: `https://${domain}`, ...theme, secure: true, sameSite: 'strict', expirationDate: 1900000000 });
  assert.ok(await save({ name: 'locale', value: 'pt-BR' }));
  assert.equal(writes[1].path, '/');
  assert.equal(writes[1].secure, true);
  assert.equal(writes[1].sameSite, 'lax');
  assert.ok(writes[1].expirationDate > Date.now() / 1000);
  assert.equal(Object.hasOwn(writes[1], 'domain'), false);
  assert.equal(isPreferenceCookieValue('locale', 'zh-Hant-TW'), true);
  assert.equal(isPreferenceCookieValue('locale', 'ca-ES-valencia'), true);
  assert.equal(isPreferenceCookieValue('locale', 'en-US-x-opaque'), false);

  navigateDuringRead = true;
  assert.equal(await save(theme), null);
  assert.equal(writes.length, 2);
});

test('MCP controls linked live tabs on their current origin and returns bounded console diagnostics', async () => {
  const { controller, host } = fixture();
  const url = 'https://fixture.test/start?key=private#hash';
  const removed = [];
  const guest = Object.assign(new EventEmitter(), {
    id: 1, setWindowOpenHandler() {}, getURL: () => url, getTitle: () => 'Fixture', isLoading: () => false, isDestroyed: () => false,
    navigationHistory: { canGoBack: () => false, canGoForward: () => false },
    reload() { this.reloaded = true; },
    async loadURL(target) { this.target = target; },
    session: { cookies: {
      async get(filter) { assert.deepEqual(filter, { url }); return [{ name: 'preference', value: 'private', domain: 'fixture.test', path: '/' }]; },
      async remove(...args) { removed.push(args); },
    } },
  });
  host.emit('did-attach-webview', {}, guest);
  assert.equal(controller.register(new EventEmitter(), 1, 'board', 'browser', 'tab'), false);
  assert.equal(controller.register(host, 1, 'board', 'browser', 'tab'), true);
  guest.emit('console-message', { level: 'error', message: 'TypeError: private', sourceId: url, lineNumber: 7 });
  const agent = { id: 'qa', type: 'terminal', position: { x: 0, y: 0 }, data: { agentId: 'codex' } };
  const edge = { id: 'link', source: 'qa', target: 'browser', data: { mode: 'browser' } };
  const board = { id: 'board', ...sanitizeContent({ nodes: [agent, createBrowserNode({ x: 100, y: 100 }, 'browser')], edges: [edge] }) };
  const workspace = { boards: [board] };
  const state = (caller = 'qa') => JSON.parse(controller.callTool(workspace, caller, 'orchestra_browser_get_state').text);
  assert.deepEqual(state().tabs[0].consoleErrors, [{ type: 'TypeError', source: 'https://fixture.test/start', line: 7 }]);
  assert.equal(state().tabs[0].url, 'https://fixture.test/start');
  assert.deepEqual(state('other'), { tabs: [] });
  const navigate = (url) => controller.callTool(workspace, 'qa', 'orchestra_browser_navigate', { tabId: 'browser:tab', url });
  assert.equal(navigate('https://other.test/start').isError, true);
  assert.equal(navigate('https://fixture.test/next').isError, false);
  assert.equal(guest.target, 'https://fixture.test/next');
  let redirectBlocked = false;
  guest.emit('will-redirect', { url: 'https://other.test/', isMainFrame: true, preventDefault() { redirectBlocked = true; } });
  assert.equal(redirectBlocked, true);
  assert.equal(navigate('https://fixture.test/next').isError, true);
  guest.emit('did-stop-loading');
  assert.equal(controller.callTool(workspace, 'qa', 'orchestra_browser_reload', { tabId: 'browser:tab' }).isError, false);
  assert.equal(guest.reloaded, true);
  assert.equal(await controller.cookies(host, 1, 'https://other.test/'), null);
  assert.equal(Object.hasOwn((await controller.cookies(host, 1, url)).cookies[0], 'value'), false);
  await controller.cookies(host, 1, url, true);
  assert.deepEqual(removed, [[url, 'preference']]);
  board.edges[0].data.enabled = false;
  assert.deepEqual(state(), { tabs: [] });
  board.edges[0].data.enabled = true;
  guest.emit('destroyed');
  assert.deepEqual(state(), { tabs: [] });
});
