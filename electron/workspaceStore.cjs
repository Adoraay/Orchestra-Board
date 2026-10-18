const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

// Disposition de la map (PLAN.md §3.4), dans userData/workspace.json.
const ID = /^[\w-]{1,128}$/;
const MAX_TEXT = 20000;
const MAX_STROKES = 2000;
const MAX_POINTS = 5000;

const filePath = () => path.join(app.getPath('userData'), 'workspace.json');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const size = (v) => (isNum(v) && v > 0 && v <= 10000 ? v : undefined);
const text = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
const clamp = (v, min, max, fallback) => (isNum(v) ? Math.min(max, Math.max(min, v)) : fallback);

function sanitizeData(type, data = {}) {
  switch (type) {
    case 'terminal':
      return {
        agentId: typeof data.agentId === 'string' ? data.agentId.slice(0, 64) : 'shell',
        cwd: typeof data.cwd === 'string' ? data.cwd.slice(0, 1024) : null,
      };
    case 'note':
      return { text: text(data.text) };
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

function sanitize(input) {
  const nodes = (Array.isArray(input?.nodes) ? input.nodes : []).map(sanitizeNode).filter(Boolean);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(input?.edges) ? input.edges : [])
    .filter((e) => e && ID.test(e.id) && ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ id: e.id, source: e.source, target: e.target, type: 'floating', animated: true }));
  const strokes = (Array.isArray(input?.strokes) ? input.strokes : [])
    .slice(0, MAX_STROKES)
    .filter((s) => s && ID.test(s.id) && Array.isArray(s.points))
    .map((s) => ({ id: s.id, points: s.points.slice(0, MAX_POINTS).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])).map((p) => [p[0], p[1]]) }))
    .filter((s) => s.points.length > 1);
  const v = input?.viewport;
  const viewport = isNum(v?.x) && isNum(v?.y) && isNum(v?.zoom) ? { x: v.x, y: v.y, zoom: clamp(v.zoom, 0.1, 4, 1) } : null;
  return { version: 1, nodes, edges, strokes, viewport };
}

function load() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(filePath(), 'utf8')));
  } catch {
    return sanitize(null); // première ouverture, ou fichier illisible
  }
}

// Écriture dans un fichier temporaire puis renommage : jamais de workspace.json à moitié écrit.
function save(workspace) {
  const tmp = filePath() + '.tmp';
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(sanitize(workspace)));
  fs.renameSync(tmp, filePath());
}

function register() {
  ipcMain.handle('workspace:get', () => load());
  ipcMain.handle('workspace:set', (_e, workspace) => save(workspace));
  // Version synchrone pour la fermeture de la fenêtre : une sauvegarde asynchrone n'aurait pas le temps de finir.
  ipcMain.on('workspace:saveSync', (event, workspace) => {
    try {
      save(workspace);
    } finally {
      event.returnValue = true;
    }
  });
}

module.exports = { register };
