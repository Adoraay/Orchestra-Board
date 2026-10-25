const { t } = require('./i18n.cjs');
const TASK_STATES = { draft: 'review', relay: 'pending', delegate: 'pending', delivered: 'sent', reply: 'replied', cancelled: 'cancelled', refused: 'refused' };
const KINDS = ['relay', 'delegate', 'draft', 'delivered', 'reply', 'cancelled', 'command', 'output', 'interrupt', 'refused', 'note'];

function createReport(entries, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(t('log.invalidFilter'));
  const filter = {};
  for (const key of ['board', 'tile', 'kind', 'task']) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > 128 || (key === 'kind' && value && !KINDS.includes(value))) throw new Error(t('log.invalidFilter'));
    filter[key] = value;
  }
  const states = new Map();
  for (const entry of entries) if (entry.taskId && TASK_STATES[entry.kind]) states.set(entry.taskId, TASK_STATES[entry.kind]);
  const events = entries.filter((entry) => (!filter.board || entry.boardId === filter.board) && (!filter.tile || entry.from === filter.tile || entry.to === filter.tile) && (!filter.kind || entry.kind === filter.kind) && (!filter.task || entry.taskId === filter.task)).map((entry) => ({ ...entry, state: entry.taskId ? states.get(entry.taskId) ?? null : null }));
  return { version: 1, exportedAt: new Date().toISOString(), filter, events };
}

module.exports = { createReport };
