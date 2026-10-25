import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Ban, Check, CircleSlash, CornerDownLeft, Download, FilePen, Filter, Network, OctagonX, ScrollText, Send, SquareTerminal,
  StickyNote, TextQuote, Trash2, X,
} from 'lucide-react';
import PendingMessage from './PendingMessage.jsx';
import PinButton from './PinButton.jsx';
import LogExportDialog from './LogExportDialog.jsx';
import useAutoClose from '../hooks/useAutoClose.js';
import usePendingMessages from '../hooks/usePendingMessages.js';
import useT from '../hooks/useT.js';

const MAX_ENTRIES = 500; // comme electron/activityLog.cjs
const KIND_ICONS = {
  relay: Send, delegate: Network, draft: FilePen, delivered: Check, reply: CornerDownLeft, cancelled: CircleSlash,
  command: SquareTerminal, output: TextQuote, interrupt: OctagonX, refused: Ban, note: StickyNote,
};
const KINDS = Object.keys(KIND_ICONS);
const MESSAGE_KINDS = ['relay', 'delegate', 'draft'];
// État d'une tâche d'après son dernier événement (PLAN.md §7, 3.2) : en attente, envoyé, réponse reçue…
const TASK_STATES = { draft: 'review', relay: 'pending', delegate: 'pending', delivered: 'sent', reply: 'replied', cancelled: 'cancelled', refused: 'refused' };
const NO_FILTER = { board: '', tile: '', kind: '', task: '' };

// Languette « Journal » sur le bord droit de la map (PLAN.md §3.18) : messages passés par les liens.
// Toujours abonnée, même repliée : un point signale les nouvelles entrées.
export default function LogPanel({ open, onToggle, onFocus, boards, pinned, onPin }) {
  const t = useT();
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [unseen, setUnseen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState(NO_FILTER);
  const [exportOpen, setExportOpen] = useState(false);
  const pending = usePendingMessages();
  useAutoClose(wrapRef, open && !pinned, onToggle);

  useEffect(() => {
    let cancelled = false;
    window.activityLog.get().then((list) => !cancelled && setEntries(list));
    const off = window.activityLog.onEntry((entry) => {
      setEntries((list) => [...list.slice(-(MAX_ENTRIES - 1)), entry]);
      setUnseen(true);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => {
    if (open) setUnseen(false);
  }, [open, entries]);

  // Dernier état connu de chaque tâche, et cases présentes dans le journal (avec leur dernier nom).
  const { taskStates, tiles } = useMemo(() => {
    const states = new Map();
    const names = new Map();
    for (const entry of entries) {
      if (entry.taskId && TASK_STATES[entry.kind]) states.set(entry.taskId, TASK_STATES[entry.kind]);
      if (entry.from) names.set(entry.from, entry.fromName);
      if (entry.to) names.set(entry.to, entry.toName);
    }
    return { taskStates: states, tiles: [...names].sort((a, b) => String(a[1]).localeCompare(String(b[1]))) };
  }, [entries]);

  const visible = entries.filter(
    (e) =>
      (!filter.board || e.boardId === filter.board) &&
      (!filter.tile || e.from === filter.tile || e.to === filter.tile) &&
      (!filter.kind || e.kind === filter.kind) &&
      (!filter.task || e.taskId === filter.task),
  );
  const filtering = Object.values(filter).some(Boolean);

  // Défilement automatique vers le bas, sauf si l'utilisateur est remonté lire.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [entries, open, filter]);

  const clear = async () => {
    setEntries(await window.activityLog.clear());
    setExpanded(null);
  };

  const setOne = (key, value) => setFilter((f) => ({ ...f, [key]: value }));
  const time = (at) => new Date(at).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const caseButton = (id, name) =>
    id ? (
      <button className="log-case" onClick={(e) => { e.stopPropagation(); onFocus(id); }} title={t('log.focus')}>
        {name}
      </button>
    ) : null;
  const boardName = (id) => boards.find((b) => b.id === id)?.name;

  return (
    <div className="usage-wrap log-wrap" ref={wrapRef}>
      <div className={`usage-slide ${open ? 'open' : ''}`} inert={open ? undefined : ''}>
        <div className="usage-clip">
          <div className="usage-panel log-panel">
            <div className="usage-header">
              <span className="usage-title">{t('log.title')}</span>
              <span className="panel-actions">
                <button className="icon-button" title={t('log.export.title')} disabled={!entries.length} onClick={() => setExportOpen(true)}><Download size={14} /></button>
                <button
                  className={`icon-button ${showFilters || filtering ? 'active' : ''}`}
                  title={t('log.filters')}
                  aria-pressed={showFilters}
                  onClick={() => setShowFilters((s) => !s)}
                >
                  <Filter size={14} />
                </button>
                <PinButton pinned={pinned} onPin={onPin} />
                <button className="icon-button" title={t('log.clear')} onClick={clear} disabled={!entries.length}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>

            {pending.length > 0 && (
              <div className="log-pending thin-scrollbar nowheel">
                <span className="field-label">{t('pending.title', { n: pending.length })}</span>
                {pending.map((item) => <PendingMessage key={item.qid} item={item} onFocus={onFocus} />)}
              </div>
            )}

            {showFilters && (
              <div className="log-filters">
                <select value={filter.board} onChange={(e) => setOne('board', e.target.value)} aria-label={t('log.filter.board')}>
                  <option value="">{t('log.filter.allBoards')}</option>
                  {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={filter.tile} onChange={(e) => setOne('tile', e.target.value)} aria-label={t('log.filter.tile')}>
                  <option value="">{t('log.filter.allTiles')}</option>
                  {tiles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select value={filter.kind} onChange={(e) => setOne('kind', e.target.value)} aria-label={t('log.filter.kind')}>
                  <option value="">{t('log.filter.allKinds')}</option>
                  {KINDS.map((kind) => <option key={kind} value={kind}>{t(`log.kind.${kind}`)}</option>)}
                </select>
                {filter.task && (
                  <button className="log-chip" onClick={() => setOne('task', '')} title={t('log.filter.clearTask')}>
                    {t('log.filter.task', { id: filter.task.slice(0, 8) })}
                    <X size={12} />
                  </button>
                )}
                {filtering && (
                  <button className="text-button" onClick={() => setFilter(NO_FILTER)}>{t('log.filter.reset')}</button>
                )}
              </div>
            )}

            <div
              className="log-list thin-scrollbar nowheel"
              ref={listRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
              }}
            >
              {!entries.length && <span className="hint">{t('log.empty')}</span>}
              {entries.length > 0 && !visible.length && <span className="hint">{t('log.filter.none')}</span>}
              {visible.map((entry) => {
                const Icon = KIND_ICONS[entry.kind] ?? Send;
                const open = expanded === entry.id;
                const state = MESSAGE_KINDS.includes(entry.kind) && entry.taskId ? taskStates.get(entry.taskId) : null;
                const board = !filter.board && boards.length > 1 ? boardName(entry.boardId) : null;
                return (
                  <div
                    key={entry.id}
                    className={`log-entry ${entry.kind} ${open ? 'expanded' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(open ? null : entry.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setExpanded(open ? null : entry.id)}
                  >
                    <div className="log-entry-head">
                      <Icon size={13} className="log-icon" />
                      <span className="log-kind">{t(`log.kind.${entry.kind}`)}</span>
                      {caseButton(entry.from, entry.fromName)}
                      {entry.to && <ArrowRight size={11} className="log-arrow" />}
                      {caseButton(entry.to, entry.toName)}
                      <span className="log-time">{time(entry.at)}</span>
                    </div>
                    {(state || entry.taskId || board) && (
                      <div className="log-entry-meta">
                        {state && <span className={`log-state ${state}`}>{t(`log.state.${state}`)}</span>}
                        {entry.taskId && (
                          <button
                            className="log-task"
                            title={t('log.filter.byTask')}
                            onClick={(e) => { e.stopPropagation(); setOne('task', entry.taskId); setShowFilters(true); }}
                          >
                            #{entry.taskId.slice(0, 8)}
                          </button>
                        )}
                        {board && <span className="muted">{board}</span>}
                      </div>
                    )}
                    {entry.text && <div className="log-text">{entry.text}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <button className={`usage-tab ${open ? 'open' : ''}`} onClick={onToggle} title={t('log.toggle', { open })}>
        <ScrollText size={15} />
        <span className="usage-tab-label">{t('log.title')}</span>
        {(unseen || pending.some((item) => item.state === 'draft')) && !open && <span className="log-unseen" />}
      </button>
      {exportOpen && <LogExportDialog filter={filter} count={visible.length} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
