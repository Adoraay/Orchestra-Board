const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { app, ipcMain } = require('electron');
const { sanitizeContent } = require('./workspaceStore.cjs');
const settings = require('./settingsStore.cjs');
const { t } = require('./i18n.cjs');
const { createMcpCatalog, sanitizePreset } = require('./mcpCatalog.cjs');

const MAX_TEMPLATES = 50;
const filePath = () => path.join(app.getPath('userData'), 'team-templates.json');
const terminals = (board) => board.nodes.filter((node) => node.type === 'terminal').map((node) => node.id);

// La liste blanche exclut sessions, chemins, branches et états d'exécution, y compris les futurs champs.
function templateBoard(input) {
  const board = sanitizeContent(input);
  return {
    ...board,
    nodes: board.nodes.map((node) => {
      if (node.type === 'visualTest') {
        const { lastResult, ...data } = node.data;
        return { ...node, data };
      }
      if (node.type !== 'terminal') return node;
      return {
        ...node, data: {
          agentId: node.data.agentId,
          ...(node.data.label && { label: node.data.label }),
          ...(node.data.role && { role: node.data.role }),
          ...(node.data.model && { model: node.data.model }),
        },
      };
    }),
  };
}

function recipes() {
  const node = (id, agentId, label, x, y, role) => ({ id, type: 'terminal', position: { x, y }, style: { width: 640, height: 400 }, data: { agentId, label, ...(role && { role }) } });
  const link = (id, source, target, mode, data = {}) => ({ id, source, target, data: { mode, enabled: true, maxTurns: 3, ...data } });
  const backlog = (x, y) => ({ id: 'plan', type: 'note', position: { x, y }, style: { width: 320, height: 230 }, data: { label: t('team.backlog'), text: t('team.maintenancePlan') } });
  const runner = (x, y) => ({ id: 'visual', type: 'visualTest', position: { x, y }, style: { width: 490, height: 450 }, data: { expectedStatus: 200 } });
  const mcp = { board: [], cards: { lead: ['linear'], qa: ['chrome-devtools'] } };
  const maintenance = {
    id: 'recipe-maintenance',
    name: t('team.recipe.maintenance'),
    description: t('team.recipe.maintenance.description'),
    builtin: true,
    mcp,
    backlog: 'plan',
    board: templateBoard({
      nodes: [
        node('lead', 'claude-code', t('team.lead'), 0, 0, t('team.guide.linear')),
        node('dev', 'codex', t('team.dev'), 760, 0, t('team.guide.developer')),
        node('qa', 'codex', 'QA', 760, 520, t('team.guide.chrome')),
        backlog(0, 520),
        runner(1520, 520),
      ],
      edges: [
        link('lead-dev', 'lead', 'dev', 'delegate'),
        link('lead-qa', 'lead', 'qa', 'delegate'),
        link('lead-plan', 'lead', 'plan', 'note'),
        link('dev-qa', 'dev', 'qa', 'delegate', { bidirectional: true }),
        link('qa-visual', 'qa', 'visual', 'visual'),
      ],
    }),
  };
  const enterprise = {
    id: 'recipe-enterprise-squad',
    name: t('team.recipe.enterprise'),
    description: t('team.recipe.enterprise.description'),
    builtin: true,
    mcp,
    backlog: 'plan',
    board: templateBoard({
      nodes: [
        node('architect', 'antigravity', t('team.architect'), 0, 0, t('team.guide.architect')),
        node('lead', 'claude-code', t('team.techLead'), 760, 0, t('team.guide.linear')),
        node('backend', 'codex', t('team.backend'), 760, 520, `${t('team.guide.backend')}\n\n${t('team.guide.developer')}`),
        node('frontend', 'claude-code', t('team.frontend'), 1520, 0, `${t('team.guide.frontend')}\n\n${t('team.guide.developer')}`),
        node('qa', 'codex', t('team.auditor'), 1520, 520, t('team.guide.chrome')),
        node('msbuild', 'shell', t('team.msbuildTerminal'), 760, 1040),
        node('npm', 'shell', t('team.npmTerminal'), 2280, 0),
        backlog(0, 520),
        runner(2280, 520),
      ],
      edges: [
        link('architect-lead', 'architect', 'lead', 'delegate'),
        link('architect-plan', 'architect', 'plan', 'note'),
        link('lead-plan', 'lead', 'plan', 'note'),
        link('lead-backend', 'lead', 'backend', 'delegate'),
        link('lead-frontend', 'lead', 'frontend', 'delegate'),
        link('lead-qa', 'lead', 'qa', 'delegate'),
        link('backend-msbuild', 'backend', 'msbuild', 'terminal'),
        link('frontend-npm', 'frontend', 'npm', 'terminal'),
        link('backend-qa', 'backend', 'qa', 'delegate', { bidirectional: true }),
        link('frontend-qa', 'frontend', 'qa', 'delegate', { bidirectional: true }),
        link('qa-visual', 'qa', 'visual', 'visual'),
      ],
    }),
  };
  return [
    { id: 'recipe-review', name: t('team.recipe.review'), description: t('team.recipe.review.description'), builtin: true, board: templateBoard({ nodes: [node('dev', 'claude-code', t('team.dev'), 0, 0, t('team.role.dev')), node('review', 'codex', t('team.reviewer'), 760, 0, t('team.role.review'))], edges: [link('review-link', 'dev', 'review', 'relay', { prompt: t('team.reviewPrompt') })] }) },
    { id: 'recipe-lead', name: t('team.recipe.lead'), description: t('team.recipe.lead.description'), builtin: true, board: templateBoard({ nodes: [node('lead', 'claude-code', t('team.lead'), 380, 0, t('team.role.lead')), node('worker-a', 'codex', t('team.workerA'), 0, 540), node('worker-b', 'claude-code', t('team.workerB'), 760, 540), { id: 'plan', type: 'note', position: { x: 1100, y: 40 }, style: { width: 270, height: 180 }, data: { label: t('team.plan'), text: t('team.planText') } }], edges: [link('lead-a', 'lead', 'worker-a', 'delegate'), link('lead-b', 'lead', 'worker-b', 'delegate'), link('lead-plan', 'lead', 'plan', 'note')] }) },
    { id: 'recipe-terminal', name: t('team.recipe.terminal'), description: t('team.recipe.terminal.description'), builtin: true, board: templateBoard({ nodes: [node('dev', 'claude-code', t('team.dev'), 0, 0, t('team.role.dev')), node('terminal', 'shell', t('team.terminal'), 760, 0)], edges: [link('terminal-link', 'dev', 'terminal', 'terminal')] }) },
    maintenance,
    enterprise,
  ];
}

function read() {
  try {
    const value = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    if (!Array.isArray(value)) throw new Error('invalid');
    return value.slice(0, MAX_TEMPLATES).filter((item) => item && /^[\w-]+$/.test(item.id) && typeof item.name === 'string').map((item) => {
      const board = templateBoard(item.board);
      const mcp = sanitizePreset(item.mcp, terminals(board));
      const backlog = board.nodes.find((node) => node.type === 'note' && node.id === item.backlog)?.id;
      return { id: item.id, name: item.name.slice(0, 40), builtin: false, board, ...(mcp && { mcp }), ...(backlog && { backlog }) };
    });
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

function save(name, input, boardId, getNoteFile = () => null) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\r\n\0]/.test(name)) throw new Error(t('team.invalidName'));
  const templates = read();
  if (templates.length >= MAX_TEMPLATES) throw new Error(t('team.limit'));
  if (list().some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) throw new Error(t('team.duplicate'));
  const board = templateBoard(input);
  if (!board.nodes.length) throw new Error(t('team.empty'));
  const mcp = boardId ? createMcpCatalog(app.getPath('userData')).capturePreset(boardId, terminals(board)) : null;
  const folders = input.nodes.flatMap((node) =>
    node?.type === 'terminal' && typeof node.data?.cwd === 'string' && path.isAbsolute(node.data.cwd) ? [node.data.cwd] : []);
  const backlog = board.nodes.find((node) => {
    if (node.type !== 'note') return false;
    const file = getNoteFile(node.id)?.file;
    return file && ['backlog.md', 'todo.md'].includes(path.basename(file).toLowerCase()) &&
      folders.some((folder) => path.relative(folder, path.dirname(file)) === '');
  })?.id;
  const item = { id: 'team-' + randomUUID(), name: name.trim(), builtin: false, board, ...(mcp && { mcp }), ...(backlog && { backlog }) };
  write([...templates, item]);
  return item;
}

function instantiate(id, cwd, replacements = {}, agents = settings.load().agents, testUrl = '', cardAgents = {}) {
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('invalid');
  } catch { throw new Error(t('team.invalidFolder')); }
  const validChoices = (choices) => choices && typeof choices === 'object' && !Array.isArray(choices);
  if (!validChoices(replacements) || !validChoices(cardAgents)) throw new Error(t('team.missingAgent'));
  const template = list().find((item) => item.id === id);
  if (!template) throw new Error(t('team.missing'));
  const url = typeof testUrl === 'string' && testUrl.length <= 2048 ? URL.parse(testUrl) : null;
  if (testUrl && (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048)) {
    throw new Error(t('team.invalidTestUrl'));
  }
  const ids = new Map(template.board.nodes.map((node) => [node.id, 'node-' + randomUUID()]));
  const nodes = template.board.nodes.map((node) => {
    const copy = { ...node, id: ids.get(node.id), data: { ...node.data } };
    if (node.type === 'visualTest' && url) {
      const saved = URL.parse(copy.data.url);
      if (saved && ['http:', 'https:'].includes(saved.protocol)) {
        const target = new URL(url.origin);
        target.pathname = saved.pathname;
        copy.data.url = target.href;
      } else {
        copy.data.url = url.href;
      }
    }
    if (node.type !== 'terminal') return copy;
    const defaultAgent = node.data.agentId;
    const agentId = Object.hasOwn(cardAgents, node.id) ? cardAgents[node.id]
      : Object.hasOwn(replacements, defaultAgent) ? replacements[defaultAgent] : defaultAgent;
    const agent = agents.find((entry) => entry.id === agentId);
    if (!agent) throw new Error(t('team.missingAgent'));
    if (defaultAgent === 'shell' && agentId !== 'shell') throw new Error(t('team.incompatible'));
    if ((node.data.role || template.mcp?.cards[node.id]?.length) && !agent.hooks) throw new Error(t('team.incompatible'));
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
    const terminalRelay = edge.data.mode === 'relay' && edge.data.terminalFallback;
    if (!terminalRelay && !sourceAgent?.hooks) throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'delegate' && !targetAgent?.hooks) throw new Error(t('team.incompatible'));
    if (edge.data.bidirectional && !terminalRelay && !targetAgent?.hooks) throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'note' && target?.type !== 'note') throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'visual' && target?.type !== 'visualTest') throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'relay' && (source?.type !== 'terminal' || target?.type !== 'terminal')) throw new Error(t('team.incompatible'));
    if (edge.data.mode === 'terminal' && target?.data.agentId !== 'shell') throw new Error(t('team.incompatible'));
  }
  const groups = template.board.groups.map((group) => ({ ...group, id: 'group-' + randomUUID(), members: group.members.map((id) => ids.get(id)) }));
  const mcp = template.mcp && {
    board: template.mcp.board,
    cards: Object.fromEntries(Object.entries(template.mcp.cards).map(([key, servers]) => [ids.get(key), servers])),
  };
  const backlog = template.backlog && { noteId: ids.get(template.backlog), cwd };
  return {
    name: template.name,
    board: { nodes, edges, groups, strokes: template.board.strokes.map((stroke) => ({ ...stroke, id: 'stroke-' + randomUUID() })), viewport: template.board.viewport },
    ...(mcp && { mcp }),
    ...(backlog && { backlog }),
  };
}

function register(getNoteFile) {
  const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
    try { return { value: await fn(...args) }; } catch (error) { return { error: error.message }; }
  });
  handle('teams:list', list);
  handle('teams:save', (name, input, boardId) => save(name, input, boardId, getNoteFile));
  handle('teams:remove', (id) => {
    const templates = read();
    if (!templates.some((item) => item.id === id)) throw new Error(t('team.missing'));
    write(templates.filter((item) => item.id !== id));
    return true;
  });
  handle('teams:create', (id, cwd, replacements, testUrl, cardAgents) => instantiate(id, cwd, replacements, undefined, testUrl, cardAgents));
}

module.exports = { register, templateBoard, list, save, instantiate };
