const fs = require('fs');
const path = require('path');

const ID = /^[\w-]{1,128}$/;
const ACTIONS = new Set(['click', 'fill', 'visible', 'text']);
const MAX_STEPS = 12;
const MAX_NETWORK_ENTRIES = 35;
const MAX_ERRORS = 12;
const MAX_EVIDENCE = 256 * 1024;
const LIMIT_MS = 60000;
const STEP_TIMEOUT_MS = 5000;
const running = new Map();

const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const httpStatus = (value) => Number.isInteger(value) && value >= 100 && value <= 599;
const asArray = (value) => Array.isArray(value) ? value : [];

// Navigateur du test. Playwright cherche Google Chrome à son emplacement habituel (/opt/google/chrome sous Linux).
// Sous Linux sans Google Chrome, on prend le Chrome ou le Chromium trouvé dans le PATH (paquets chromium, chromium-browser…).
const LINUX_BROWSERS = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'];
function browserOptions({ platform = process.platform, envPath = process.env.PATH, exists = fs.existsSync } = {}) {
  if (platform !== 'linux' || exists('/opt/google/chrome/chrome')) return { channel: 'chrome' };
  for (const name of LINUX_BROWSERS) {
    for (const dir of (envPath || '').split(path.delimiter)) {
      const file = dir && path.join(dir, name);
      if (file && exists(file)) return { executablePath: file };
    }
  }
  return { channel: 'chrome' }; // rien trouvé : l'erreur habituelle « Chrome introuvable »
}

function configuration(data) {
  return {
    url: text(data?.url, 2048),
    expectedStatus: httpStatus(data?.expectedStatus) ? data.expectedStatus : 200,
    failOnConsole: data?.failOnConsole !== false,
    steps: asArray(data?.steps).slice(0, MAX_STEPS).map((step) => ({
      id: typeof step?.id === 'string' && ID.test(step.id) ? step.id : '',
      action: ACTIONS.has(step?.action) ? step.action : 'visible',
      target: text(step?.target, 512),
      value: text(step?.value, 1000),
    })),
  };
}

function sanitizeResult(result) {
  if (!result || !Number.isInteger(result.finishedAt) || result.finishedAt <= 0 || result.finishedAt > 8.64e15) return null;
  const screenshot = text(result.screenshot, MAX_EVIDENCE + 1);
  return {
    finishedAt: result.finishedAt,
    url: text(result.url, 600),
    expectedStatus: httpStatus(result.expectedStatus) ? result.expectedStatus : 200,
    status: httpStatus(result.status) ? result.status : null,
    duration: Number.isFinite(result.duration) ? Math.max(0, Math.min(result.duration, LIMIT_MS + 10000)) : 0,
    failure: text(result.failure, 32),
    detail: text(result.detail, 500),
    failedStep: Number.isInteger(result.failedStep) && result.failedStep > 0 && result.failedStep <= MAX_STEPS ? result.failedStep : null,
    errors: asArray(result.errors).slice(0, MAX_ERRORS).map((error) => text(error, 500)).filter(Boolean),
    network: asArray(result.network).slice(0, MAX_NETWORK_ENTRIES).filter((entry) => entry && typeof entry.url === 'string').map((entry) => ({
      url: text(entry.url, 500), method: text(entry.method, 12),
      status: httpStatus(entry.status) ? entry.status : null, failure: text(entry.failure, 160),
    })),
    ...(screenshot.length <= MAX_EVIDENCE && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(screenshot) && { screenshot }),
  };
}

function parseUrl(value) {
  const url = URL.parse(value);
  return url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
}

function displayUrl(value) {
  const url = URL.parse(value);
  return url ? `${url.origin}${url.pathname}` : '';
}

function locator(page, target) {
  if (target.startsWith('label:')) return page.getByLabel(target.slice(6).trim(), { exact: true });
  if (target.startsWith('role:')) {
    const [, role, name] = /^role:([a-z]+)(?::(.+))?$/i.exec(target) ?? [];
    if (!role) throw new Error('Use role:button:Accessible name, role:heading, label:Field name, or CSS.');
    return page.getByRole(role.toLowerCase(), name ? { name: name.trim(), exact: true } : {});
  }
  return page.locator(`css=${target}`);
}

async function executeStep(page, step) {
  const element = locator(page, step.target.trim());
  if (step.action === 'click') await element.click();
  else if (step.action === 'fill') await element.fill(step.value);
  else if (step.action === 'text') await element.filter({ hasText: step.value }).waitFor({ state: 'visible' });
  else await element.waitFor({ state: 'visible' });
}

async function capture(page) {
  for (const quality of [75, 30]) {
    const bytes = await page.screenshot({ type: 'jpeg', quality, animations: 'disabled', timeout: 3500 });
    const image = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    if (image.length <= MAX_EVIDENCE) return image;
  }
  return '';
}

async function run(config, url, controller) {
  const started = Date.now();
  const result = { url: displayUrl(url.href), expectedStatus: config.expectedStatus, errors: [], network: [] };
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort('timeout'), LIMIT_MS);
  let browser;
  let page;
  let phase = 'launch';
  const close = () => browser?.close().catch(() => {});
  signal.addEventListener('abort', close, { once: true });

  const trackError = (message) => {
    const summary = text(message, 500);
    if (result.errors.length < MAX_ERRORS && summary && !result.errors.includes(summary)) result.errors.push(summary);
  };
  const trackNetwork = (entry) => {
    if (!entry.url) return;
    if (result.network.length === MAX_NETWORK_ENTRIES) {
      const firstSuccess = result.network.findIndex((item) => item.status < 400 && !item.failure);
      if (firstSuccess < 0 && entry.status < 400 && !entry.failure) return;
      result.network.splice(Math.max(firstSuccess, 0), 1);
    }
    result.network.push(entry);
  };

  try {
    const { chromium } = require('playwright-core');
    browser = await chromium.launch({ ...browserOptions(), chromiumSandbox: true, timeout: 12000 });
    signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, acceptDownloads: false });
    page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    page.on('popup', (popup) => popup.close().catch(() => {}));
    page.on('pageerror', (error) => trackError(error.message));
    page.on('console', (item) => { if (item.type() === 'error') trackError(item.text()); });
    page.on('response', (response) => trackNetwork({
      url: displayUrl(response.url()), method: response.request().method(), status: response.status(),
    }));
    page.on('requestfailed', (request) => trackNetwork({
      url: displayUrl(request.url()), method: request.method(), failure: request.failure()?.errorText,
    }));

    phase = 'navigation';
    const response = await page.goto(url.href, { waitUntil: 'load', timeout: 12000 });
    result.status = response?.status();
    if (result.status !== config.expectedStatus) {
      result.failure = 'status';
    } else {
      phase = 'step';
      for (const [index, step] of config.steps.entries()) {
        result.failedStep = index + 1;
        await executeStep(page, step);
        result.failedStep = null;
      }
    }
  } catch (error) {
    result.failure = signal.reason === 'timeout' ? 'timeout' : phase;
    result.detail = text(error?.message?.split('\n')[0], 500);
  } finally {
    try {
      if (page && !signal.aborted) result.screenshot = await capture(page);
    } catch { /* A closed or unresponsive page can still provide diagnostics. */ }
    clearTimeout(timer);
    await close();
  }

  if (signal.reason === 'cancelled') return null;
  if (!result.failure && config.failOnConsole && result.errors.length) result.failure = 'console';
  return sanitizeResult({ ...result, duration: Date.now() - started, finishedAt: Date.now() });
}

function start(id, data, onDone) {
  if (typeof id !== 'string' || !ID.test(id)) return { error: 'unavailable' };
  if (running.has(id)) return { running: true };
  if (running.size >= 3) return { error: 'busy' };
  const config = configuration(data);
  const url = parseUrl(config.url.trim());
  if (!url) return { error: 'invalidUrl' };
  if (data?.expectedStatus != null && !httpStatus(data.expectedStatus)) return { error: 'invalidStatus' };
  if (config.steps.some((step) => !step.target.trim() || (step.action === 'text' && !step.value.trim()))) return { error: 'invalidSteps' };

  const controller = new AbortController();
  running.set(id, controller);
  const finish = (result) => { running.delete(id); onDone(id, result); };
  run(config, url, controller).then(finish, () => finish(sanitizeResult({
    url: displayUrl(url.href), expectedStatus: config.expectedStatus, failure: 'unavailable', finishedAt: Date.now(),
  })));
  return { running: true };
}

function cancel(id) { running.get(id)?.abort('cancelled'); }
function dispose() { for (const id of running.keys()) cancel(id); }

module.exports = { browserOptions, configuration, sanitizeResult, start, isRunning: (id) => running.has(id), cancel, dispose };
