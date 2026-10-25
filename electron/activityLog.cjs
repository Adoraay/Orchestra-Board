const { app, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { t } = require('./i18n.cjs');
const { createReport } = require('./logReport.cjs');

// Journal des échanges entre agents (PLAN.md §3.18) : messages passés par les liens, réponses, commandes du
// lien Terminal, refus. Gardé en mémoire seulement : aucune conversation n'est écrite sur le disque.
const MAX_ENTRIES = 500;
const MAX_TEXT = 4000;
// draft : message préparé à valider, delivered : collé et envoyé chez la cible, cancelled : annulé avant l'envoi.
const KINDS = ['relay', 'delegate', 'draft', 'delivered', 'reply', 'cancelled', 'command', 'output', 'interrupt', 'refused', 'note'];

let entries = [];
let nextId = 1;
let deps = { nameOf: (id) => id, boardOf: () => null, emit: () => {} };

// nameOf(id d'une case) -> nom affiché, boardOf(id) -> tableau de la case, emit(entry) : nouvelle entrée pour l'interface.
function init(d) {
  deps = d;
}

// { kind, linkId, from, to, text } : from et to sont des ids de cases (to facultatif pour un refus).
function add({ kind, linkId = null, taskId = null, from = null, to = null, text = '' }) {
  if (!KINDS.includes(kind)) return;
  const body = String(text);
  const entry = {
    id: nextId++,
    at: Date.now(),
    kind,
    linkId,
    taskId,
    from,
    to,
    fromName: from ? deps.nameOf(from) : null,
    toName: to ? deps.nameOf(to) : null,
    boardId: (from && deps.boardOf(from)) || (to && deps.boardOf(to)) || null,
    text: body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT)}…` : body,
  };
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  deps.emit(entry);
  deps.report?.(entry);
}

function register(getWindow = () => null) {
  ipcMain.handle('log:get', () => entries);
  ipcMain.handle('log:clear', () => {
    entries = [];
    return entries;
  });
  ipcMain.handle('log:export', async (_e, filter) => {
    try {
      const report = createReport(entries, filter);
      const result = await dialog.showSaveDialog(getWindow(), { title: t('log.exportTitle'), defaultPath: path.join(app.getPath('downloads'), `orchestra-log-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return { cancelled: true };
      await fs.writeFile(result.filePath, JSON.stringify(report, null, 2), { mode: 0o600 });
      return { count: report.events.length, path: result.filePath };
    } catch { return { error: t('log.exportFailed') }; }
  });
}

module.exports = { init, add, register };
