export const BROWSER_PARTITION = 'persist:orchestra-browser';
export const BROWSER_DRAG_TYPE = 'application/x-orchestra-browser';
export const BROWSER_SIZE = { width: 800, height: 540 };
export const BROWSER_DRAG_HANDLE = '.interactive-browser-header';
export const BLANK_URL = 'about:blank';
export const MAX_BROWSER_TABS = 20;
export const MAX_BROWSER_URL = 4096;
export const PREFERENCE_COOKIE_NAMES = ['theme', 'locale'];
export const PREFERENCE_COOKIE_MAX_VALUE = 32;
const ID = /^[\w-]{1,128}$/;
const LOCALE_TAG = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$/i;

export function isPreferenceCookieValue(name, value) {
  if (typeof value !== 'string' || value.length > PREFERENCE_COOKIE_MAX_VALUE) return false;
  if (name === 'theme') return ['light', 'dark', 'system', 'auto'].includes(value);
  if (name !== 'locale' || !LOCALE_TAG.test(value)) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export function isBrowserId(value) {
  return typeof value === 'string' && ID.test(value);
}

export function browserUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_BROWSER_URL || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value === BLANK_URL) return value;
  const url = URL.parse(value);
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > MAX_BROWSER_URL) return null;
  return url.href;
}

export function addressUrl(value) {
  const address = value.trim();
  if (!address || address === BLANK_URL) return BLANK_URL;
  return browserUrl(address) ?? (/^[\w.-]+(?::\d+)?(?:[/?#]|$)/.test(address) ? browserUrl(`https://${address}`) : null);
}

export function browserTitle(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 256) : '';
}

export function newBrowserTab(url = BLANK_URL, id = globalThis.crypto.randomUUID()) {
  return { id, url: browserUrl(url) ?? BLANK_URL, title: '' };
}

export function createBrowserNode(center, id = globalThis.crypto.randomUUID()) {
  const tab = newBrowserTab();
  return {
    id, type: 'interactiveBrowser', dragHandle: BROWSER_DRAG_HANDLE, selected: true,
    position: { x: center.x - BROWSER_SIZE.width / 2, y: center.y - BROWSER_SIZE.height / 2 },
    style: { ...BROWSER_SIZE },
    data: { tabs: [tab], activeTabId: tab.id, newTabUrl: BLANK_URL },
  };
}

export function browserDropPosition(event, screenToFlowPosition) {
  if (event.dataTransfer.getData(BROWSER_DRAG_TYPE) !== 'browser') return null;
  return screenToFlowPosition({ x: event.clientX, y: event.clientY });
}

export function sanitizeBrowserData(data) {
  const ids = new Set();
  const tabs = (Array.isArray(data?.tabs) ? data.tabs : []).slice(0, MAX_BROWSER_TABS).flatMap((tab) => {
    if (!isBrowserId(tab?.id) || ids.has(tab.id)) return [];
    ids.add(tab.id);
    const url = browserUrl(tab.url);
    return [{ id: tab.id, url: url ?? BLANK_URL, title: url && url !== BLANK_URL ? browserTitle(tab.title) : '' }];
  });
  if (!tabs.length) tabs.push(newBrowserTab(BLANK_URL, 'initial'));
  return {
    tabs,
    activeTabId: ids.has(data?.activeTabId) ? data.activeTabId : tabs[0].id,
    newTabUrl: browserUrl(data?.newTabUrl) ?? BLANK_URL,
  };
}
