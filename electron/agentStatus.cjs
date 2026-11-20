const { clean, pendingLine, shellPrompt } = require('./terminalText.cjs');

// Statut de chaque case : idle (gris), working (orange), waiting (jaune), done (vert).
// Claude Code : donné par ses hooks. Les autres agents : déduit de l'activité du terminal.
// unseen : l'agent a fini et personne n'a encore regardé (lueur verte, PLAN.md §3.6).
const QUIET_DELAY = 2000;
const PROMPT_DELAY = 150;
const PROMPT_FALLBACK_DELAY = 10_000;
const MAX_CAPTURE = 80_000;
// Antigravity n'envoie aucun hook pour ses demandes d'autorisation (vérifié avec agy 1.5.13) : on les lit à
// l'écran. « 1 » accepte (« Yes, run command »), Échap refuse (« esc to cancel », sans hook Stop ensuite).
const AGY_SCREEN = 8192;
const AGY_PERMISSION = 'Requesting permission for:';

const entries = new Map(); // id -> { mode, status, unseen, armed, quietTimer, sessionId, transcriptPath, name, cwd }
let emit = () => {};
let onFinish = () => {};
let onActivityComplete = () => {};

// onChange(id, info) à chaque changement, finished(id, info) quand un agent vient de finir.
function init(onChange, finished, activityComplete = () => {}) {
  emit = onChange;
  onFinish = finished;
  onActivityComplete = activityComplete;
}

function set(id, entry, status) {
  if (entry.status === status) return;
  const justFinished = entry.notify && status === 'done' && (entry.status === 'working' || entry.status === 'waiting');
  entry.status = status;
  if (status !== 'waiting') entry.permission = null;
  if (status === 'working') entry.unseen = false;
  if (justFinished) entry.unseen = true;
  emit(id, info(id));
  if (justFinished) onFinish(id, info(id));
}

// mode : 'hooks' (Claude Code) ou 'activity' (les autres). meta : { name, cwd } pour les notifications,
// notify : false pour un simple terminal (sa pastille change, mais pas de lueur, de son ni de notification).
function register(id, mode, meta = {}) {
  entries.set(id, {
    mode,
    status: 'idle',
    unseen: false,
    armed: false,
    quietTimer: null,
    sessionId: null,
    transcriptPath: null,
    turnId: null,
    ready: mode !== 'hooks',
    name: meta.name ?? '',
    cwd: meta.cwd ?? null,
    notify: meta.notify !== false,
    isShell: meta.isShell === true,
    prompt: '',
    capture: '',
    promptTail: '',
    kind: meta.kind ?? null,
    permission: null,
    screen: '',
  });
}

function unregister(id) {
  clearTimeout(entries.get(id)?.quietTimer);
  entries.delete(id);
}

function info(id) {
  const e = entries.get(id);
  return e
    ? { status: e.status, unseen: e.unseen, sessionId: e.sessionId, transcriptPath: e.transcriptPath, turnId: e.turnId, ready: e.ready, mode: e.mode, name: e.name, cwd: e.cwd, permission: e.permission }
    : null;
}

// Agents qui travaillent ou attendent une permission (confirmation avant de quitter l'app).
function busy() {
  return [...entries]
    .filter(([, e]) => e.status === 'working' || e.status === 'waiting')
    .map(([id, e]) => ({ id, name: e.name, status: e.status, cwd: e.cwd }));
}

function rename(id, name) {
  const e = entries.get(id);
  if (e) e.name = name;
}

// La fin a été vue : clic sur la case ou saisie dans son terminal.
function acknowledge(id) {
  const e = entries.get(id);
  if (!e?.unseen) return;
  e.unseen = false;
  emit(id, info(id));
}

// Événements des hooks de Claude Code.
function onHook(id, payload) {
  const e = entries.get(id);
  if (!e || e.mode !== 'hooks') return;
  if (typeof payload.session_id === 'string') e.sessionId = payload.session_id;
  if (typeof payload.transcript_path === 'string') e.transcriptPath = payload.transcript_path;

  switch (payload.hook_event_name) {
    case 'SessionStart':
      e.ready = true;
      e.turnId = null;
      if (e.status === 'idle') emit(id, info(id));
      return set(id, e, 'idle');
    case 'UserPromptSubmit':
      e.ready = true;
      e.turnId = typeof payload.turn_id === 'string' ? payload.turn_id : null;
      return set(id, e, 'working');
    case 'PostToolUse': // reprise du travail, par exemple après une permission accordée
      return set(id, e, 'working');
    case 'PermissionRequest': // Claude Code et Codex : arrive avant que la demande s'affiche
      if (e.kind === 'claude') {
        if (e.status !== 'working' && e.status !== 'waiting') return;
        e.status = 'waiting';
        e.permission = permissionOf(payload);
        return emit(id, info(id));
      }
      if (e.status === 'working') set(id, e, 'waiting');
      return;
    case 'Notification': // Claude Code
      // Pendant le travail = demande de permission. Après la fin, c'est le rappel « en attente », ignoré.
      if (e.status === 'working') set(id, e, 'waiting');
      return;
    case 'Stop':
      return set(id, e, 'done');
  }
}

// Outils dont la demande n'est pas un simple oui/non (question, sortie du mode plan) : réponse dans le terminal.
const OPEN_ENDED = ['AskUserQuestion', 'ExitPlanMode'];

function permissionOf(payload) {
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name.slice(0, 80) : '';
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const detail = [input.command, input.file_path, input.notebook_path, input.url, input.query, input.description].find((value) => typeof value === 'string' && value.trim()) ?? '';
  return { tool, detail: detail.slice(0, 300), actionable: Boolean(tool) && !OPEN_ENDED.includes(tool) };
}

// Réponse à une demande de permission depuis l'interface : seulement « Oui » (1) ou « Non » (Échap),
// jamais « Oui, ne plus demander ». Un refus n'envoie pas de hook Stop, d'où le retour à idle.
function answerPermission(id, allow) {
  const e = entries.get(id);
  if (!e || e.status !== 'waiting' || !e.permission?.actionable) return null;
  set(id, e, allow ? 'working' : 'idle');
  return allow ? '1' : '\x1b';
}

// Une frappe vaut « vu ». Les séquences qui commencent par Échap sont ignorées : ce sont surtout les
// réponses automatiques de xterm aux programmes (position du curseur, focus), pas l'utilisateur.
// Agents sans hooks : Entrée « arme » la case, la sortie qui suit = travaille, le silence = a fini.
// Sans Entrée avant, la sortie (démarrage, écho des touches, animations) ne change rien.
function onInput(id, data) {
  const e = entries.get(id);
  // Échap seul pendant une demande de permission de Claude ou d'Antigravity = refus tapé dans le terminal.
  if (e?.status === 'waiting' && ['claude', 'antigravity'].includes(e.kind) && data === '\x1b') return set(id, e, 'idle');
  if (!e || data.startsWith('\x1b')) return;
  acknowledge(id);
  if (data.includes('\r')) arm(id);
}

// Message envoyé par un lien : comme une Entrée de l'utilisateur, la sortie qui suit = travaille.
function arm(id) {
  const e = entries.get(id);
  if (e?.mode === 'activity') {
    if (e.status !== 'working') e.capture = '';
    e.armed = true;
  }
}

// Demande d'autorisation d'Antigravity, lue dans sa sortie pendant qu'il travaille : la commande (ou le fichier)
// est la ligne qui suit l'en-tête. Le reste de son statut vient de ses hooks.
function watchAntigravity(id, e, data) {
  if (e.status !== 'working') { e.screen = ''; return; }
  e.screen = (e.screen + data).slice(-AGY_SCREEN);
  const text = clean(e.screen);
  const at = text.lastIndexOf(AGY_PERMISSION);
  if (at < 0) return;
  const lines = text.slice(at + AGY_PERMISSION.length).split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.some((line) => /^>?\s*1\.\s*Yes/.test(line))) return; // le choix n'est pas encore affiché
  e.screen = '';
  e.status = 'waiting';
  e.permission = { tool: /command/i.test(lines.find((line) => line.endsWith('?')) ?? '') ? 'Command' : 'Antigravity', detail: (lines[0] ?? '').slice(0, 300), actionable: true };
  emit(id, info(id));
}

function onOutput(id, data = '') {
  const e = entries.get(id);
  if (e?.kind === 'antigravity') return watchAntigravity(id, e, data);
  if (!e || e.mode !== 'activity') return;
  if (!e.armed && e.status !== 'working') {
    if (e.isShell) {
      e.promptTail = (e.promptTail + data).slice(-4096);
      e.prompt = shellPrompt(e.promptTail) || e.prompt;
    }
    return;
  }
  e.armed = false;
  e.capture = (e.capture + data).slice(-MAX_CAPTURE);
  set(id, e, 'working');
  clearTimeout(e.quietTimer);
  const tail = e.capture.slice(-4096);
  let prompt = e.isShell ? shellPrompt(tail, e.prompt) : '';
  let delay = prompt ? PROMPT_DELAY : QUIET_DELAY;
  // Un prompt connu est plus fiable que le silence (long build). S'il change (venv, cd, ssh, python),
  // on ne conclut qu'après un long silence sur une ligne inachevée : un build silencieux finit ses lignes.
  if (e.prompt && !prompt) {
    prompt = pendingLine(tail);
    if (!prompt) return;
    delay = PROMPT_FALLBACK_DELAY;
  }
  e.quietTimer = setTimeout(() => {
    const output = clean(e.capture);
    const lines = (prompt && output.endsWith(prompt) ? output.slice(0, -prompt.length) : output).split('\n');
    const reply = lines.filter((line) => !e.prompt || !line.trimStart().startsWith(e.prompt)).join('\n').trim().slice(-20_000);
    e.prompt = prompt || e.prompt;
    e.promptTail = '';
    e.capture = '';
    onActivityComplete(id, reply);
    set(id, e, 'done');
  }, delay);
}

module.exports = { init, register, unregister, info, busy, rename, acknowledge, onHook, onInput, onOutput, arm, answerPermission };
