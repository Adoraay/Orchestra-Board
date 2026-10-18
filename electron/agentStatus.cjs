// Statut de chaque case : idle (gris), working (orange), waiting (jaune), done (vert).
// Claude Code : donné par ses hooks. Les autres agents : déduit de l'activité du terminal.
const QUIET_DELAY = 2500; // ms sans sortie après une commande = « a fini »

const entries = new Map(); // id -> { mode, status, armed, quietTimer, sessionId, transcriptPath }
let emit = () => {};

function init(onChange) {
  emit = onChange;
}

function set(id, entry, status) {
  if (entry.status === status) return;
  entry.status = status;
  emit(id, info(id));
}

// mode : 'hooks' (Claude Code) ou 'activity' (les autres)
function register(id, mode) {
  entries.set(id, { mode, status: 'idle', armed: false, quietTimer: null, sessionId: null, transcriptPath: null });
}

function unregister(id) {
  clearTimeout(entries.get(id)?.quietTimer);
  entries.delete(id);
}

function info(id) {
  const e = entries.get(id);
  return e ? { status: e.status, sessionId: e.sessionId, transcriptPath: e.transcriptPath } : null;
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

// Agents sans hooks : Entrée « arme » la case, la sortie qui suit = travaille, le silence = a fini.
// Sans Entrée avant, la sortie (démarrage, écho des touches, animations) ne change rien.
function onInput(id, data) {
  const e = entries.get(id);
  if (e?.mode === 'activity' && data.includes('\r')) e.armed = true;
}

function onOutput(id) {
  const e = entries.get(id);
  if (!e || e.mode !== 'activity' || (!e.armed && e.status !== 'working')) return;
  e.armed = false;
  set(id, e, 'working');
  clearTimeout(e.quietTimer);
  e.quietTimer = setTimeout(() => set(id, e, 'done'), QUIET_DELAY);
}

module.exports = { init, register, unregister, info, onHook, onInput, onOutput };
