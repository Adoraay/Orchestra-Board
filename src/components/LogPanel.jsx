import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Ban, CornerDownLeft, Network, OctagonX, ScrollText, Send, SquareTerminal, StickyNote, TextQuote, Trash2 } from 'lucide-react';
import useAutoClose from '../hooks/useAutoClose.js';
import useT from '../hooks/useT.js';

const MAX_ENTRIES = 500; // comme electron/activityLog.cjs
const KIND_ICONS = { relay: Send, delegate: Network, reply: CornerDownLeft, command: SquareTerminal, output: TextQuote, interrupt: OctagonX, refused: Ban, note: StickyNote };

// Languette « Journal » sur le bord droit de la map (PLAN.md §3.18) : messages passés par les liens.
// Toujours abonnée, même repliée : un point signale les nouvelles entrées.
export default function LogPanel({ open, onToggle, onFocus }) {
  const t = useT();
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [unseen, setUnseen] = useState(false);
  useAutoClose(wrapRef, open, onToggle);

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

  // Défilement automatique vers le bas, sauf si l'utilisateur est remonté lire.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [entries, open]);

  const clear = async () => {
    setEntries(await window.activityLog.clear());
    setExpanded(null);
  };

  const time = (at) => new Date(at).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const caseButton = (id, name) =>
    id ? (
      <button className="log-case" onClick={(e) => { e.stopPropagation(); onFocus(id); }} title={t('log.focus')}>
        {name}
      </button>
    ) : null;

  return (
    <div className="usage-wrap log-wrap" ref={wrapRef}>
      <div className={`usage-slide ${open ? 'open' : ''}`} inert={open ? undefined : ''}>
        <div className="usage-clip">
          <div className="usage-panel log-panel">
            <div className="usage-header">
              <span className="usage-title">{t('log.title')}</span>
              <button className="icon-button" title={t('log.clear')} onClick={clear} disabled={!entries.length}>
                <Trash2 size={14} />
              </button>
            </div>
            <div
              className="log-list thin-scrollbar nowheel"
              ref={listRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
              }}
            >
              {!entries.length && <span className="hint">{t('log.empty')}</span>}
              {entries.map((entry) => {
                const Icon = KIND_ICONS[entry.kind] ?? Send;
                const open = expanded === entry.id;
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
        {unseen && !open && <span className="log-unseen" />}
      </button>
    </div>
  );
}
