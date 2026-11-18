const fs = require('node:fs');
const path = require('node:path');

const ID = /^[\w-]{1,128}$/;
const SERVER_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const reserved = new Set(['orchestra', '__proto__', 'constructor', 'prototype']);
const line = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);
const validId = (id) => typeof id === 'string' && ID.test(id) && !reserved.has(id);

function sanitizePreset(input, cardIds) {
  if (!input || typeof input !== 'object') return null;
  const ids = (value) => Array.isArray(value) ? [...new Set(value.filter((id) => validId(id) && SERVER_ID.test(id)))].slice(0, 54) : [];
  const board = ids(input.board);
  const cards = Object.fromEntries(cardIds.flatMap((id) =>
    validId(id) && Array.isArray(input.cards?.[id]) ? [[id, ids(input.cards[id])]] : []));
  return board.length || Object.keys(cards).length ? { board, cards } : null;
}

function npmServer(pkg, args) {
  const npmArgs = ['npx', '--yes', pkg, ...args];
  return process.platform === 'win32'
    ? { type: 'stdio', command: 'cmd.exe', args: ['/d', '/c', ...npmArgs] }
    : { type: 'stdio', command: npmArgs[0], args: npmArgs.slice(1) };
}

const presets = [
  { id: 'linear', label: 'Linear', type: 'http', url: 'https://mcp.linear.app/mcp' },
  { id: 'chrome-devtools', label: 'Chrome DevTools', ...npmServer('chrome-devtools-mcp@1.13.0', ['--isolated', '--no-usage-statistics']) },
  { id: 'agent-browser', label: 'agent-browser', ...npmServer('agent-browser@0.43.0', ['mcp']) },
  { id: 'agent-desktop', label: 'agent-desktop', ...npmServer('agent-desktop@1.3.1', ['mcp']) },
];

function customServer(value) {
  if (!value || !validId(value.id) || !SERVER_ID.test(value.id) || value.id.toLowerCase() === 'orchestra' ||
      presets.some(({ id }) => id === value.id.toLowerCase())) {
    throw new Error('invalidServer');
  }
  const { id } = value;
  if (value.type === 'http') {
    if (!line(value.url, 2048)) throw new Error('invalidUrl');
    let url;
    try { url = new URL(value.url); } catch { throw new Error('invalidUrl'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || (local && url.protocol === 'http:')) ||
        url.username || url.password || url.hash) throw new Error('invalidUrl');
    return { id, type: 'http', url: url.href };
  }
  if (value.type !== 'stdio' || !line(value.command, 1024) || !value.command.trim() ||
      !Array.isArray(value.args) || value.args.length > 64 || !value.args.every((arg) => line(arg, 2048))) {
    throw new Error('invalidCommand');
  }
  return { id, type: 'stdio', command: value.command.trim(), args: value.args };
}

function createMcpCatalog(directory) {
  const file = path.join(directory, 'mcp-settings.json');
  const empty = () => ({ custom: [], boards: {}, cards: {} });

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
      if (!Array.isArray(data.custom) || !isObject(data.boards) || !isObject(data.cards) ||
          !Object.values(data.cards).every((card) => isObject(card) && validId(card.boardId) && Array.isArray(card.servers))) {
        throw new Error('saveFailed');
      }
      return { custom: data.custom.map(customServer), boards: data.boards, cards: data.cards };
    } catch (err) {
      if (err.code === 'ENOENT') return empty();
      throw new Error('saveFailed', { cause: err });
    }
  }

  function selection(value, custom) {
    if (!Array.isArray(value)) return [];
    const known = new Set([...presets, ...custom].map(({ id }) => id));
    return [...new Set(value.filter((id) => known.has(id)))];
  }

  function get(boardId, cardId) {
    const { custom, boards, cards } = read();
    return {
      presets: presets.map(({ id, label }) => ({ id, label })),
      custom,
      board: validId(boardId) ? selection(boards[boardId], custom) : [],
      card: validId(cardId) && cards[cardId]?.boardId === boardId ? selection(cards[cardId].servers, custom) : null,
    };
  }

  function write(data) {
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  function save(boardId, cardId, change) {
    if (!validId(boardId) || (cardId != null && !validId(cardId))) throw new Error('invalidScope');
    const data = read();
    if (change.add) {
      const added = customServer(change.add);
      if (data.custom.length >= 50 || data.custom.some(({ id }) => id.toLowerCase() === added.id.toLowerCase())) throw new Error('invalidServer');
      data.custom.push(added);
    }
    if (change.remove) {
      data.custom = data.custom.filter(({ id }) => id !== change.remove);
      for (const key of Object.keys(data.boards)) data.boards[key] = selection(data.boards[key], data.custom);
      for (const card of Object.values(data.cards)) card.servers = selection(card.servers, data.custom);
    }
    if (Object.hasOwn(change, 'selection')) {
      if (cardId == null) data.boards[boardId] = selection(change.selection, data.custom);
      else if (change.selection == null) delete data.cards[cardId];
      else data.cards[cardId] = { boardId, servers: selection(change.selection, data.custom) };
    }
    write(data);
    return get(boardId, cardId);
  }

  function capturePreset(boardId, cardIds) {
    if (!validId(boardId)) return null;
    const { custom, boards, cards } = read();
    return sanitizePreset({
      board: selection(boards[boardId], custom),
      cards: Object.fromEntries(cardIds.flatMap((id) =>
        validId(id) && cards[id]?.boardId === boardId ? [[id, selection(cards[id].servers, custom)]] : [])),
    }, cardIds);
  }

  function applyPreset(boardId, cardIds, input, saveWorkspace) {
    if (!validId(boardId)) throw new Error('invalidScope');
    const preset = sanitizePreset(input, cardIds);
    if (!preset) return saveWorkspace();
    const previous = read();
    const known = new Set([...presets, ...previous.custom].map(({ id }) => id));
    const missing = [...new Set([...preset.board, ...Object.values(preset.cards).flat()])].filter((id) => !known.has(id));
    if (missing.length) throw Object.assign(new Error('missingServers'), { missingServers: missing });
    const cards = Object.fromEntries(Object.entries(preset.cards).map(([id, servers]) => [id, { boardId, servers }]));
    write({ ...previous, boards: { ...previous.boards, [boardId]: preset.board }, cards: { ...previous.cards, ...cards } });
    try {
      return saveWorkspace();
    } catch (error) {
      write(previous);
      throw error;
    }
  }

  function resolve(boardId, cardId) {
    if (!validId(boardId)) return {};
    try {
      const { custom, boards, cards } = read();
      const card = validId(cardId) && cards[cardId]?.boardId === boardId ? cards[cardId].servers : null;
      const ids = selection(card ?? boards[boardId], custom);
      return Object.fromEntries([...presets, ...custom].flatMap(({ id, label, ...server }) => ids.includes(id) ? [[id, server]] : []));
    } catch {
      console.error('[orchestra] Unable to load MCP settings. Only the Orchestra server will be injected.');
      return {};
    }
  }

  return { get, save, resolve, capturePreset, applyPreset };
}

module.exports = { createMcpCatalog, sanitizePreset, validId };
