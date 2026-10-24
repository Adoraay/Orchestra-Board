const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

function load(name, mocks = {}, clock = globalThis) {
  const file = path.resolve(__dirname, '..', 'electron', name);
  const localRequire = createRequire(file);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', fs.readFileSync(file, 'utf8'))(
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id), module, module.exports, clock.setTimeout, clock.clearTimeout,
  );
  return module.exports;
}

function clock() {
  let now = 0;
  let next = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        timers.delete(id);
        now = timer.at;
        timer.fn();
      }
      now = end;
    },
  };
}

const translate = (key, vars = {}) => key + ' ' + Object.values(vars).join(' ');
const i18n = { t: translate, tIn: (_lang, key, vars) => translate(key, vars), appLanguage: () => 'en', detectLanguage: () => null };
module.exports = { load, clock, i18n };
