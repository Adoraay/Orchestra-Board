// Statut de chaque case : idle (gris), working (orange), waiting (jaune), done (vert).
// Claude Code : donné par ses hooks. Les autres agents : déduit de l'activité du terminal.
// unseen : l'agent a fini et personne n'a encore regardé (lueur verte, PLAN.md §3.6).
const QUIET_DELAY = 2500; // ms sans sortie après une commande = « a fini »

const entries = new Map(); // id -> { mode, status, unseen, armed, quietTimer, sessionId, transcriptPath, name, cwd }
let emit = () => {};
let onFinish = () => {};

// onChange(id, info) à chaque changement, finished(id, info) quand un agent vient de finir.
function init(onChange, finished) {
  emit = onChange;
  onFinish = finished;
}

function set(id, entry, status) {
  if (entry.status === status) return;
  const justFinished = entry.notify && status === 'done' && (entry.status === 'working' || entry.status === 'waiting');
  entry.status = status;
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
    name: meta.name ?? '',
    cwd: meta.cwd ?? null,
    notify: meta.notify !== false,
  });
}

function unregister(id) {
  clearTimeout(entries.get(id)?.quietTimer);
  entries.delete(id);
}

function info(id) {
  const e = entries.get(id);
  return e
    ? { status: e.status, unseen: e.unseen, sessionId: e.sessionId, transcriptPath: e.transcriptPath, name: e.name, cwd: e.cwd }
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
      return set(id, e, 'idle');
    case 'UserPromptSubmit':
    case 'PostToolUse': // reprise du travail, par exemple après une permission accordée
      return set(id, e, 'working');
    case 'Notification':
      // Pendant le travail = demande de permission. Après la fin, c'est le rappel « en attente », ignoré.
      if (e.status === 'working') set(id, e, 'waiting');
      return;
    case 'Stop':
      return set(id, e, 'done');
  }
}

// Une frappe vaut « vu ». Les séquences qui commencent par Échap sont ignorées : ce sont surtout les
// réponses automatiques de xterm aux programmes (position du curseur, focus), pas l'utilisateur.
// Agents sans hooks : Entrée « arme » la case, la sortie qui suit = travaille, le silence = a fini.
// Sans Entrée avant, la sortie (démarrage, écho des touches, animations) ne change rien.
function onInput(id, data) {
  const e = entries.get(id);
  if (!e || data.startsWith('\x1b')) return;
  acknowledge(id);
  if (e.mode === 'activity' && data.includes('\r')) e.armed = true;
}

// Message envoyé par un lien : comme une Entrée de l'utilisateur, la sortie qui suit = travaille.
function arm(id) {
  const e = entries.get(id);
  if (e?.mode === 'activity') e.armed = true;
}

function onOutput(id) {
  const e = entries.get(id);
  if (!e || e.mode !== 'activity' || (!e.armed && e.status !== 'working')) return;
  e.armed = false;
  set(id, e, 'working');
  clearTimeout(e.quietTimer);
  e.quietTimer = setTimeout(() => set(id, e, 'done'), QUIET_DELAY);
}

module.exports = { init, register, unregister, info, busy, rename, acknowledge, onHook, onInput, onOutput, arm };
