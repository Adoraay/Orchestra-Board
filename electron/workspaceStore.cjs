const { app, ipcMain } = require('electron');
const { t } = require('./i18n.cjs');
const { MODEL } = require('./settingsStore.cjs');
const { createWorkspaceFiles } = require('./workspaceFiles.cjs');
const { sanitizeSession } = require('./sessionState.cjs');
const { randomUUID } = require('crypto');

// Tableaux et disposition de chaque map (PLAN.md §3.4), dans userData/workspace.json.
const ID = /^[\w-]{1,128}$/;
const MAX_TEXT = 20000;
const MAX_STROKES = 2000;
const MAX_POINTS = 5000;
const MAX_BOARDS = 50;
const MAX_NAME = 40;
const MAX_ROLE = 2000;

const MAX_TURNS = 20;
let onSaved = () => {};
let files;
let current;
let recovery = null;
let restoring = false;
let generation = randomUUID();
const sessions = new Map();
const roleOverrides = new Map();

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const size = (v) => (isNum(v) && v > 0 && v <= 10000 ? v : undefined);
const text = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
const clamp = (v, min, max, fallback) => (isNum(v) ? Math.min(max, Math.max(min, v)) : fallback);

function sanitizeData(type, data = {}) {
  switch (type) {
    case 'terminal': {
      const label = typeof data.label === 'string' ? data.label.trim().slice(0, 40) : '';
      const branch = typeof data.branch === 'string' ? data.branch.slice(0, 255) : '';
      const worktree = typeof data.worktree === 'string' ? data.worktree.slice(0, 1024) : '';
      const role = typeof data.role === 'string' ? data.role.trim().slice(0, MAX_ROLE) : '';
      return {
        agentId: typeof data.agentId === 'string' ? data.agentId.slice(0, 64) : 'shell',
        cwd: typeof data.cwd === 'string' ? data.cwd.slice(0, 1024) : null,
        ...(label && { label }), // nom choisi par double-clic sur le titre
        ...(branch && worktree && { branch, worktree }), // branche Git choisie et dossier où l'agent tourne
        ...(role && { role }), // rôle donné à l'agent (PLAN.md §3.19)
        ...(MODEL.test(data.model ?? '') && { model: data.model }), // modèle choisi dans le dock au dépôt
        ...(sanitizeSession(data.session) && { session: sanitizeSession(data.session) }),
      };
    }
    case 'note': {
      const label = typeof data.label === 'string' ? data.label.trim().slice(0, 40) : '';
      return { text: text(data.text), ...(label && { label }) }; // label : nom donné aux agents par le lien Note
    }
    default:
      return { text: text(data.text), fontSize: Math.round(clamp(data.fontSize, 8, 160, 18)), rotation: clamp(data.rotation, -180, 180, 0) };
  }
}

function sanitizeNode(n) {
  if (!n || !ID.test(n.id) || !['terminal', 'note', 'text'].includes(n.type)) return null;
  if (!isNum(n.position?.x) || !isNum(n.position?.y)) return null;
  const style = {};
  if (size(n.style?.width)) style.width = n.style.width;
  if (size(n.style?.height)) style.height = n.style.height;
  return {
    id: n.id,
    type: n.type,
    position: { x: n.position.x, y: n.position.y },
    width: size(n.width),
    height: size(n.height),
    style,
    data: sanitizeData(n.type, n.data),
  };
}

// Réglages d'un lien (PLAN.md §3.5, §3.11, §3.17) : type (Transmission, Délégation, Terminal ou Note), consigne avec {reponse}, limite de tours, actif ou non,
// dans les deux sens ou non.
function sanitizeLink(data = {}) {
  return {
    mode: ['delegate', 'terminal', 'note'].includes(data.mode) ? data.mode : 'relay',
    bidirectional: data.bidirectional === true,
    prompt: typeof data.prompt === 'string' ? data.prompt.slice(0, MAX_TEXT) : '', // vide = pas encore configuré
    maxTurns: Math.round(clamp(data.maxTurns, 1, MAX_TURNS, 3)),
    enabled: data.enabled !== false,
  };
}

// Contenu d'un tableau : cases, liens, dessins et vue.
function sanitizeContent(input) {
  const nodes = (Array.isArray(input?.nodes) ? input.nodes : []).map(sanitizeNode).filter(Boolean);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(input?.edges) ? input.edges : [])
    .filter((e) => e && ID.test(e.id) && ids.has(e.source) && ids.has(e.target))
    .map((e) => {
      const data = sanitizeLink(e.data);
      return { id: e.id, source: e.source, target: e.target, type: 'floating', data };
    });
  const strokes = (Array.isArray(input?.strokes) ? input.strokes : [])
    .slice(0, MAX_STROKES)
    .filter((s) => s && ID.test(s.id) && Array.isArray(s.points))
    .map((s) => ({ id: s.id, points: s.points.slice(0, MAX_POINTS).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])).map((p) => [p[0], p[1]]) }))
    .filter((s) => s.points.length > 1);
  const v = input?.viewport;
  const viewport = isNum(v?.x) && isNum(v?.y) && isNum(v?.zoom) ? { x: v.x, y: v.y, zoom: clamp(v.zoom, 0.1, 4, 1) } : null;
  return { nodes, edges, strokes, viewport };
}

// Nom par défaut, dans la langue de l'interface (« Board 1 », « Tableau 1 »).
const defaultName = (index) => t('board.defaultName', { n: index + 1 });

function sanitizeName(name, index) {
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME) : defaultName(index);
}

// Plusieurs tableaux (pages). Un ancien fichier à un seul tableau (version 1) devient le premier tableau.
function sanitize(input) {
  const rawBoards = Array.isArray(input?.boards) ? input.boards : input?.nodes ? [{ id: 'board-1', name: defaultName(0), ...input }] : [];
  const seen = new Set();
  const boards = [];
  for (const raw of rawBoards.slice(0, MAX_BOARDS)) {
    if (!raw || !ID.test(raw.id) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    boards.push({ id: raw.id, name: sanitizeName(raw.name, boards.length), ...sanitizeContent(raw) });
  }
  if (!boards.length) boards.push({ id: 'board-1', name: defaultName(0), ...sanitizeContent(null) });

  const activeBoardId = seen.has(input?.activeBoardId) ? input.activeBoardId : boards[0].id;
  return { version: 2, activeBoardId, boards };
}

function load() {
  if (!current) {
    files = createWorkspaceFiles(app.getPath('userData'));
    const loaded = files.read();
    current = sanitize(loaded.workspace);
    recovery = loaded.recovery;
    for (const board of current.boards) for (const node of board.nodes) {
      if (node.type === 'terminal') sessions.set(node.id, node.data.session ?? null);
    }
  }
  return current;
}

// Écriture dans un fichier temporaire puis renommage : jamais de workspace.json à moitié écrit.
function save(workspace) {
  load();
  if (restoring) return; // beforeunload de l'ancienne interface après restauration
  if (recovery) throw new Error(t('workspace.recoveryRequired'));
  const clean = sanitize(workspace);
  for (const board of clean.boards) for (const node of board.nodes) {
    if (node.type !== 'terminal') continue;
    if (roleOverrides.has(node.id)) {
      delete node.data.role;
      if (roleOverrides.get(node.id)) node.data.role = roleOverrides.get(node.id);
    }
    // Les hooks font autorité : une sauvegarde React retardée ne rétablit pas une ancienne session.
    if (sessions.has(node.id)) {
      delete node.data.session;
      if (sessions.get(node.id)) node.data.session = sessions.get(node.id);
    } else {
      sessions.set(node.id, null);
      delete node.data.session;
    }
  }
  files.write(clean);
  current = clean;
  onSaved(clean);
}

function getSession(id) { load(); return sessions.get(id) ?? null; }

function setSession(id, value) {
  load();
  const session = sanitizeSession(value);
  if (JSON.stringify(sessions.get(id)) === JSON.stringify(session)) return;
  sessions.set(id, session);
  if (!recovery && current.boards.some((b) => b.nodes.some((n) => n.id === id))) save(current);
}

function setRole(id, value) {
  load();
  roleOverrides.set(id, String(value ?? '').trim().slice(0, MAX_ROLE));
  if (!recovery && current.boards.some((b) => b.nodes.some((n) => n.id === id))) save(current);
}

function startup() { restoring = false; return { workspace: load(), recovery, generation }; }

// listener(workspace) : appelé au démarrage puis après chaque sauvegarde (liens pour linkRelay).
function register(listener, beforeRestore = () => {}) {
  onSaved = listener;
  onSaved(load());
  ipcMain.handle('workspace:get', () => load());
  ipcMain.handle('workspace:startup', startup);
  ipcMain.handle('workspace:backups', () => { load(); return files.list(); });
  ipcMain.handle('workspace:restore', (_e, id) => {
    load();
    const previousGeneration = generation;
    try {
      // Vérifier le choix avant de fermer les agents.
      if (id !== null && !files.list().some((entry) => entry.id === id)) throw new Error(t('workspace.invalidBackup'));
      restoring = true;
      generation = randomUUID();
      beforeRestore();
      const restored = sanitize(files.restore(id, sanitize(null)));
      sessions.clear();
      roleOverrides.clear();
      for (const board of restored.boards) for (const node of board.nodes) {
        if (node.type === 'terminal') sessions.set(node.id, node.data.session ?? null);
      }
      current = restored;
      recovery = null;
      onSaved(current);
      return { ok: true };
    } catch (error) { restoring = false; generation = previousGeneration; return { error: error.message }; }
  });
  ipcMain.handle('workspace:set', (_e, workspace, token) => { if (token === generation) save(workspace); });
  // Version synchrone pour la fermeture de la fenêtre : une sauvegarde asynchrone n'aurait pas le temps de finir.
  ipcMain.on('workspace:saveSync', (event, workspace, token) => {
    try {
      if (token === generation) save(workspace);
    } catch (error) {
      console.error('Workspace save failed:', error.message);
    } finally {
      event.returnValue = true;
    }
  });
}

module.exports = { register, getSession, setSession, setRole, get: load, sanitizeContent };
