const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('node-pty');
const { app, ipcMain } = require('electron');
const claudeTrust = require('./claudeTrust.cjs');
const { resolveShell } = require('./ptyManager.cjs');
const { t } = require('./i18n.cjs');

// Utilisation des agents (quotas), lue dans les fichiers locaux des CLI :
// - Claude Code range le résultat de /usage dans ~/.claude.json (cachedUsageUtilization) et le
//   rafraîchit tant qu'une session tourne. Trop ancien : on lance un Claude invisible qui tape /usage.
// - Codex écrit ses limites (rate_limits) dans chaque session, à chaque réponse.
// - Gemini CLI n'en garde aucune trace.
const FRESH_FOR = 2 * 60 * 1000; // ms : en dessous, pas besoin de relancer /usage
const PROBE_TIMEOUT = 30 * 1000;
const CODEX_FILES_TO_SCAN = 30;

const claudeConfig = () => path.join(process.env.CLAUDE_CONFIG_DIR || os.homedir(), '.claude.json');
const codexSessions = () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');

const limit = (label, percent, resetsAt) => ({ label, percent: Math.max(0, Math.min(100, Math.round(percent))), resetsAt });

function readClaude() {
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(claudeConfig(), 'utf8')).cachedUsageUtilization;
  } catch {}
  const u = cache?.utilization;
  if (!u) return { fetchedAt: null, limits: [], breakdown: [] };

  const windows = [
    ['five_hour', 'usage.session'],
    ['seven_day', 'usage.weekAll'],
    ['seven_day_opus', 'usage.weekOpus'],
    ['seven_day_sonnet', 'usage.weekSonnet'],
  ];
  const limits = windows
    .filter(([key]) => typeof u[key]?.utilization === 'number')
    .map(([key, label]) => limit(t(label), u[key].utilization, Date.parse(u[key].resets_at) || null));
  const breakdown = (u.seven_day_breakdown?.rows ?? [])
    .filter((row) => typeof row.percent === 'number' && row.percent > 0)
    .map((row) => ({ label: String(row.display_name ?? row.key), percent: row.percent }));
  return { fetchedAt: cache.fetchedAtMs ?? null, limits, breakdown };
}

// Le dernier rate_limits non vide, en partant de la session Codex la plus récente.
function readCodex() {
  const files = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = fs.readdirSync(dir).sort().reverse(); // AAAA / MM / JJ / rollout-<date>… : le plus récent d'abord
    } catch {}
    for (const name of names) {
      if (files.length >= CODEX_FILES_TO_SCAN) return;
      const full = path.join(dir, name);
      if (depth < 3) walk(full, depth + 1);
      else if (name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(codexSessions(), 0);

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').reverse();
    for (const line of lines) {
      if (!line.includes('"rate_limits":{')) continue;
      try {
        const event = JSON.parse(line);
        const r = event.payload?.rate_limits;
        if (!r) continue;
        const limits = [r.primary, r.secondary]
          .filter((w) => typeof w?.used_percent === 'number')
          .map((w) => limit(windowLabel(w.window_minutes), w.used_percent, w.resets_at ? w.resets_at * 1000 : null));
        return { fetchedAt: Date.parse(event.timestamp) || null, limits, plan: r.plan_type ?? null };
      } catch {}
    }
  }
  return { fetchedAt: null, limits: [] };
}

function windowLabel(minutes) {
  if (minutes === 300) return t('usage.session');
  if (minutes === 10080) return t('usage.week');
  if (minutes >= 1440) return t('usage.days', { n: Math.round(minutes / 1440) });
  return t('usage.hours', { n: Math.round(minutes / 60) });
}

const READERS = {
  'claude-code': () => ({ ...readClaude(), refreshable: true }),
  codex: () => ({ ...readCodex(), note: t('usage.codexNote') }),
  gemini: () => ({ unavailable: t('usage.geminiUnavailable') }),
};

// Ce qu'affiche /usage, lu à l'écran si le cache n'est pas réécrit (codes de couleur et de curseur retirés).
function parseUsageScreen(text) {
  const plain = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
  const session = plain.match(/Current session[^%]{0,300}?(\d{1,3})%\s*used/);
  const week = plain.match(/Current week \(all models\)[^%]{0,300}?(\d{1,3})%\s*used/);
  if (!session || !week) return null;
  return [limit(t('usage.session'), Number(session[1]), null), limit(t('usage.weekAll'), Number(week[1]), null)];
}

// Claude invisible : lancé dans son propre dossier (un « claude --continue » dans un projet ne reprendra
// jamais cette session), il tape /usage puis est fermé dès que le résultat est là.
let probe = null;
let probeTerm = null;
function probeClaude() {
  if (probe) return probe;
  probe = new Promise((resolve) => {
    const dir = path.join(app.getPath('userData'), 'usage-probe');
    fs.mkdirSync(dir, { recursive: true });
    claudeTrust.trustFolder(dir);

    const started = Date.now();
    const { file, args } = resolveShell('default');
    const term = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: dir,
      env: process.env,
    });
    probeTerm = term;
    let screen = '';
    let typed = false;
    let quietTimer = null;
    let screenLimits = null;

    const finish = (result) => {
      clearInterval(watch);
      clearTimeout(quietTimer);
      clearTimeout(timeout);
      try {
        term.kill();
      } catch {}
      probe = null;
      probeTerm = null;
      resolve(result);
    };

    // /usage est tapé quand l'invite de Claude est affichée et que l'écran ne bouge plus (0,8 s).
    const typeUsage = () => {
      if (typed) return;
      typed = true;
      term.write('/usage');
      setTimeout(() => term.write('\r'), 300);
    };
    term.onData((data) => {
      screen = (screen + data).slice(-200 * 1024);
      if (typed) {
        screenLimits = screenLimits ?? parseUsageScreen(screen);
        return;
      }
      if (!/❯|for shortcuts|shift\+tab/.test(screen)) return;
      clearTimeout(quietTimer);
      quietTimer = setTimeout(typeUsage, 800);
    });
    setTimeout(() => term.write('claude\r'), 300);
    setTimeout(typeUsage, 12 * 1000); // invite pas reconnue (autre version de Claude) : on tente quand même

    // Le cache réécrit est la meilleure source (il a les heures de remise à zéro) ; à défaut, l'écran.
    let seenScreenAt = null;
    const watch = setInterval(() => {
      const cached = readClaude();
      if (cached.fetchedAt && cached.fetchedAt >= started) return finish(cached);
      if (screenLimits) {
        seenScreenAt = seenScreenAt ?? Date.now();
        if (Date.now() - seenScreenAt > 1500) finish({ ...cached, fetchedAt: Date.now(), limits: screenLimits });
      }
    }, 300);
    const timeout = setTimeout(() => finish({ ...readClaude(), error: t('usage.noAnswer') }), PROBE_TIMEOUT);
  });
  return probe;
}

function register() {
  ipcMain.handle('usage:get', (_e, agentId) => READERS[agentId]?.() ?? { unavailable: t('usage.unknownAgent') });
  ipcMain.handle('usage:refresh', async (_e, agentId, force) => {
    if (agentId !== 'claude-code') return READERS[agentId]?.() ?? null;
    const current = readClaude();
    if (!force && current.fetchedAt && Date.now() - current.fetchedAt < FRESH_FOR) return { ...current, refreshable: true };
    return { ...(await probeClaude()), refreshable: true };
  });
}

// Pas de Claude invisible orphelin en quittant l'app.
function stop() {
  try {
    probeTerm?.kill();
  } catch {}
}

module.exports = { register, stop };
