const { t } = require('./i18n.cjs');
const { BLANK_URL, BROWSER_PARTITION, PREFERENCE_COOKIE_NAMES, browserTitle, browserUrl, isBrowserId, isPreferenceCookieValue } = require('./browserModel.mjs');

const GET_STATE = 'orchestra_browser_get_state';
const NAVIGATE = 'orchestra_browser_navigate';
const RELOAD = 'orchestra_browser_reload';
const isTool = (name) => [GET_STATE, NAVIGATE, RELOAD].includes(name);
const ok = (value) => ({ text: JSON.stringify(value), isError: false });
const error = (key) => ({ text: t(`browser.mcp.${key}`), isError: true });
const PREFERENCE_COOKIE_LIFETIME = 365 * 24 * 60 * 60; // seconds

function canEditPreference(cookie, page) {
  return PREFERENCE_COOKIE_NAMES.includes(cookie.name) && cookie.hostOnly === true && cookie.domain === page.hostname
    && !cookie.httpOnly && (!cookie.secure || page.protocol === 'https:');
}

function originOf(value) {
  const url = browserUrl(value);
  return url && url !== BLANK_URL ? new URL(url).origin : null;
}

function route(value) {
  const url = browserUrl(value);
  if (!url || url === BLANK_URL) return url;
  const { origin, pathname } = new URL(url);
  return (origin + pathname).slice(0, 600);
}

function configureGuest(event, preferences, params) {
  if (params.partition !== BROWSER_PARTITION || !browserUrl(params.src)) {
    event.preventDefault();
    return;
  }
  delete preferences.preload;
  delete preferences.enableBlinkFeatures;
  Object.assign(preferences, {
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    webviewTag: false,
  });
}

function linkedBrowsers(workspace, caller) {
  const boards = workspace.boards.filter((board) => board.nodes.some((node) =>
    node.id === caller && node.type === 'terminal' && node.data.agentId !== 'shell'));
  if (boards.length !== 1) return null;
  const { id, nodes, edges } = boards[0];
  const targets = new Set(edges.filter((edge) =>
    edge.source === caller && edge.data.mode === 'browser' && edge.data.enabled !== false).map((edge) => edge.target));
  return { boardId: id, ids: new Set(nodes.filter((node) => node.type === 'interactiveBrowser' && targets.has(node.id)).map((node) => node.id)) };
}

function createInteractiveBrowser() {
  const guests = new Map();

  function attach(host, session) {
    session.setPermissionCheckHandler(() => false);
    session.setPermissionRequestHandler((_guest, _permission, respond) => respond(false));
    host.on('will-attach-webview', configureGuest);
    host.on('did-attach-webview', (_event, guest) => {
      const entry = { host, guest, consoleErrors: [] };
      const guestId = guest.id;
      guests.set(guestId, entry);
      guest.once('destroyed', () => guests.delete(guestId));
      guest.setWindowOpenHandler(() => ({ action: 'deny' }));
      const checkNavigation = (details) => {
        const agentOrigin = entry.agentNavigation?.origin;
        if (!browserUrl(details.url) || (details.isMainFrame && agentOrigin && originOf(details.url) !== agentOrigin)) {
          details.preventDefault();
        }
      };
      guest.on('will-frame-navigate', checkNavigation);
      guest.on('will-redirect', checkNavigation);
      guest.on('did-start-navigation', (details) => {
        if (details.isMainFrame && !details.isSameDocument) entry.consoleErrors = [];
      });
      guest.on('did-stop-loading', () => { entry.agentNavigation = null; });
      guest.on('will-prevent-unload', () => { entry.agentNavigation = null; });
      guest.on('console-message', (details) => {
        if (details.level !== 'error') return;
        // Log locations and error types are sufficient for triage. Raw messages stay in DevTools.
        const type = /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|SecurityError|NetworkError)\b/.exec(details.message)?.[0] ?? 'Error';
        entry.consoleErrors.push({ type, source: route(details.sourceId), line: details.lineNumber });
        if (entry.consoleErrors.length > 25) entry.consoleErrors.shift();
      });
      guest.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || input.key !== 'F12') return;
        event.preventDefault();
        guest.openDevTools({ mode: 'detach' });
      });
    });
  }

  function register(host, guestId, boardId, browserId, tabId) {
    const entry = guests.get(guestId);
    if (entry?.host !== host || ![boardId, browserId, tabId].every(isBrowserId)) return false;
    Object.assign(entry, { boardId, browserId, tabId: `${browserId}:${tabId}` });
    return true;
  }

  function cookiePage(host, guestId, expectedUrl) {
    const entry = guests.get(guestId);
    if (!entry || entry.host !== host || entry.guest.isDestroyed()) return null;
    const url = browserUrl(entry.guest.getURL());
    return url && url !== BLANK_URL && url === expectedUrl ? new URL(url) : null;
  }

  async function cookies(host, guestId, expectedUrl, remove = false) {
    const page = cookiePage(host, guestId, expectedUrl);
    if (!page) return null;
    const { origin, href: url } = page;
    const store = guests.get(guestId).guest.session.cookies;
    const list = await store.get({ url });
    if (!cookiePage(host, guestId, url)) return null;
    if (remove) {
      await Promise.all([...new Set(list.map(({ name }) => name))].map((name) => store.remove(url, name)));
      return { origin, cookies: [] };
    }
    return { origin, cookies: list.map((cookie) => {
      const { name, domain, path, secure, httpOnly, value } = cookie;
      return { name, domain, path, secure, httpOnly,
        ...(canEditPreference(cookie, page) && { editableValue: isPreferenceCookieValue(name, value) ? value : '' }),
      };
    }) };
  }

  async function savePreferenceCookie(host, guestId, expectedUrl, preference) {
    const page = cookiePage(host, guestId, expectedUrl);
    const { name, value, domain, path = '/' } = preference ?? {};
    if (!page || domain !== page.hostname || !isPreferenceCookieValue(name, value)) return null;
    const store = guests.get(guestId).guest.session.cookies;
    // Include Secure cookies when checking for an existing preference, even from an HTTP tab.
    const scope = new URL(page);
    scope.protocol = 'https:';
    const list = await store.get({ url: scope.href, name });
    const [existing, duplicate] = list.filter((cookie) => cookie.path === path);
    if (duplicate || (existing ? !canEditPreference(existing, page) : path !== '/')) return null;
    if (!cookiePage(host, guestId, expectedUrl)) return null;
    // Omit domain so Chromium sets a host-only cookie. Preserve attributes on edits.
    const expirationDate = existing ? existing.expirationDate : Math.floor(Date.now() / 1000) + PREFERENCE_COOKIE_LIFETIME;
    await store.set({
      url: page.origin, name, value, path,
      secure: existing?.secure ?? (page.protocol === 'https:'),
      sameSite: existing?.sameSite ?? 'lax',
      ...(expirationDate !== undefined && { expirationDate }),
    });
    return cookies(host, guestId, expectedUrl);
  }

  function callTool(workspace, caller, name, args) {
    const allowed = linkedBrowsers(workspace, caller);
    const tabs = [...guests.values()].filter((entry) => entry.boardId === allowed?.boardId && allowed?.ids.has(entry.browserId));
    if (name === GET_STATE) return ok({ tabs: tabs.map(({ guest, browserId, tabId, consoleErrors }) => ({
      browserId, tabId, url: route(guest.getURL()), title: browserTitle(guest.getTitle()),
      isLoading: guest.isLoading(), canGoBack: guest.navigationHistory.canGoBack(),
      canGoForward: guest.navigationHistory.canGoForward(), consoleErrors,
    })) });
    const entry = tabs.find((tab) => tab.tabId === args?.tabId);
    if (!entry) return error('unknownTab');
    const { guest } = entry;
    if (entry.agentNavigation || guest.isLoading()) return error('busy');
    // Onglet vide : l'agent peut y ouvrir un site http(s). Ensuite, il reste dans l'origine de la page affichée.
    const current = originOf(guest.getURL());
    const origin = name === NAVIGATE ? originOf(args?.url) : current;
    if (!origin) return error(current ? 'origin' : 'blank');
    if (current && origin !== current) return error('origin');
    const navigation = { origin };
    entry.agentNavigation = navigation;
    if (name === RELOAD) guest.reload();
    else {
      const finish = () => { if (entry.agentNavigation === navigation) entry.agentNavigation = null; };
      guest.loadURL(browserUrl(args.url)).then(finish, finish);
    }
    return ok({ tabId: entry.tabId, started: true });
  }

  return { attach, register, cookies, savePreferenceCookie, callTool };
}

module.exports = { createInteractiveBrowser, isTool };
