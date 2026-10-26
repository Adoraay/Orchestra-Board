const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app, ipcMain } = require('electron');
const { sanitizeContent } = require('./workspaceStore.cjs');
const settings = require('./settingsStore.cjs');
const { t } = require('./i18n.cjs');

const MAX_TEMPLATES = 50;
const filePath = () => path.join(app.getPath('userData'), 'team-templates.json');

// La liste blanche exclut sessions, chemins, branches et états d'exécution, y compris les futurs champs.
function templateBoard(input) {
  const board = sanitizeContent(input);
  return {
    ...board,
    nodes: board.nodes.map((node) => node.type !== 'terminal' ? node : {
      ...node, data: {
        agentId: node.data.agentId,
        ...(node.data.label && { label: node.data.label }),
        ...(node.data.role && { role: node.data.role }),
        ...(node.data.model && { model: node.data.model }),
      },
    }),
  };
}

function recipes() {
  const node = (id, agentId, label, x, y, role) => ({ id, type: 'terminal', position: { x, y }, style: { width: 640, height: 400 }, data: { agentId, label, ...(role && { role }) } });
  const link = (id, source, target, mode, prompt = '') => ({ id, source, target, data: { mode, prompt, enabled: true, maxTurns: 3, bidirectional: false } });
  return [
    { id: 'recipe-review', name: t('team.recipe.review'), description: t('team.recipe.review.description'), builtin: true, board: templateBoard({ nodes: [node('dev', 'claude-code', t('team.dev'), 0, 0, t('team.role.dev')), node('review', 'codex', t('team.reviewer'), 760, 0, t('team.role.review'))], edges: [link('review-link', 'dev', 'review', 'relay', t('team.reviewPrompt'))] }) },
    { id: 'recipe-lead', name: t('team.recipe.lead'), description: t('team.recipe.lead.description'), builtin: true, board: templateBoard({ nodes: [node('lead', 'claude-code', t('team.lead'), 380, 0, t('team.role.lead')), node('worker-a', 'codex', t('team.workerA'), 0, 540), node('worker-b', 'claude-code', t('team.workerB'), 760, 540), { id: 'plan', type: 'note', position: { x: 1100, y: 40 }, style: { width: 270, height: 180 }, data: { label: t('team.plan'), text: t('team.planText') } }], edges: [link('lead-a', 'lead', 'worker-a', 'delegate'), link('lead-b', 'lead', 'worker-b', 'delegate'), link('lead-plan', 'lead', 'plan', 'note')] }) },
    { id: 'recipe-terminal', name: t('team.recipe.terminal'), description: t('team.recipe.terminal.description'), builtin: true, board: templateBoard({ nodes: [node('dev', 'claude-code', t('team.dev'), 0, 0, t('team.role.dev')), node('terminal', 'shell', t('team.terminal'), 760, 0)], edges: [link('terminal-link', 'dev', 'terminal', 'terminal')] }) },
  ];
}

function read() {
  try {
    const value = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (!Array.isArray(value)) throw new Error('invalid');
    return value.slice(0, MAX_TEMPLATES).filter((item) => item && /^[\w-]+$/.test(item.id) && typeof item.name === 'string').map((item) => ({ id: item.id, name: item.name.slice(0, 40), builtin: false, board: templateBoard(item.board) }));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(t('team.unreadable'));
  }
}

function write(list) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(list));
  fs.renameSync(file + '.tmp', file);
}

function list() { return [...recipes(), ...read()]; }

function save(name, input) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\r\n\0]/.test(name)) throw new Error(t('team.invalidName'));
  const templates = read();
  if (templates.length >= MAX_TEMPLATES) throw new Error(t('team.limit'));
  if (list().some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) throw new Error(t('team.duplicate'));
  const board = templateBoard(input);
  if (!board.nodes.length) throw new Error(t('team.empty'));
  const item = { id: 'team-' + randomUUID(), name: name.trim(), builtin: false, board };
  write([...templates, item]);
  return item;
}

function instantiate(id, cwd, replacements = {}, agents = settings.load().agents) {
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('invalid');
  } catch { throw new Error(t('team.invalidFolder')); }
  if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)) throw new Error(t('team.missingAgent'));
  const template = list().find((item) => item.id === id);
  if (!template) throw new Error(t('team.missing'));
  const ids = new Map(template.board.nodes.map((node) => [node.id, 'node-' + randomUUID()]));
  const nodes = template.board.nodes.map((node) => {
    const copy = { ...node, id: ids.get(node.id), data: { ...node.data } };
    if (node.type !== 'terminal') return copy;
    const agentId = Object.hasOwn(replacements, node.data.agentId) ? replacements[node.data.agentId] : node.data.agentId;
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) throw new Error(t('team.missingAgent'));
    if (node.data.role && !agent.hooks) throw new Error(t('team.incompatible'));
    copy.data.agentId = agentId;
    copy.data.cwd = cwd;
    if (agentId !== node.data.agentId) delete copy.data.model;
    return copy;
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = template.board.edges.map((edge) => ({ ...edge, id: 'edge-' + randomUUID(), source: ids.get(edge.source), target: ids.get(edge.target), data: { ...edge.data } }));
  // Une substitution ne doit pas produire un lien que le nouvel agent ne peut pas utiliser.
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const sourceAgent = agents.find((agent) => agent.id === source?.data.agentId);
    const targetAgent = agents.find((agent) => agent.id === target?.data.agentId);
    if (['delegate', 'relay', 'note', 'terminal'].includes(edge.data.mode) && !sourceAgent?.hooks) throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'delegate' && !targetAgent?.hooks) throw new Error(t('team.incompatible'));
    if (edge.data.bidirectional && !targetAgent?.hooks) throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'note' && target?.type !== 'note') throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'relay' && target?.type !== 'terminal') throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'terminal' && target?.data.agentId !== 'shell') throw new Error(t('team.incompatible'));
  }
  const groups = template.board.groups.map((group) => ({ ...group, id: 'group-' + randomUUID(), members: group.members.map((id) => ids.get(id)) }));
  return { name: template.name, board: { nodes, edges, groups, strokes: template.board.strokes.map((stroke) => ({ ...stroke, id: 'stroke-' + randomUUID() })), viewport: template.board.viewport } };
}

function register() {
  const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
    try { return { value: await fn(...args) }; } catch (error) { return { error: error.message }; }
  });
  handle('teams:list', list);
  handle('teams:save', save);
  handle('teams:remove', (id) => {
    const templates = read();
    if (!templates.some((item) => item.id === id)) throw new Error(t('team.missing'));
    write(templates.filter((item) => item.id !== id));
    return true;
  });
  handle('teams:create', (id, cwd, replacements) => instantiate(id, cwd, replacements));
}

module.exports = { register, templateBoard, list, save, instantiate };
