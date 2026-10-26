import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Hand, LocateFixed, PowerOff, Repeat, X } from 'lucide-react';
import useT from '../hooks/useT.js';

const ICONS = { permission: Hand, refused: Ban, limit: Repeat, exit: PowerOff };

export default function BlockersInbox({ entries, onFocus, onClose }) {
  const t = useT();
  const [view, setView] = useState('active');
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const active = entries.filter((entry) => !entry.resolved);
  const resolved = entries.filter((entry) => entry.resolved);
  const visible = view === 'active' ? active : resolved;
  const message = (entry) => entry.kind === 'permission' ? t('inbox.permission') : entry.kind === 'exit' ? t('inbox.exit', { code: entry.text }) : entry.text || t('inbox.limit');

  return <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal inbox-modal" role="dialog" aria-modal="true" aria-labelledby="inbox-title">
      <header className="modal-header"><h1 id="inbox-title">{t('inbox.title')}</h1><button className="icon-button" title={t('common.close')} onClick={onClose}><X size={17} /></button></header>
      <nav className="tabs inbox-controls" role="tablist">
        {[['active', active.length], ['resolved', resolved.length]].map(([id, n]) => <button key={id} role="tab" aria-selected={view === id} className={`tab inbox-tab-${id} ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>{t(`inbox.tab.${id}`)}<span className="inbox-tab-count">{n}</span></button>)}
        {view === 'resolved' && resolved.length > 0 && <button className="text-button inbox-clear" onClick={() => window.blockers.clearResolved()}>{t('inbox.clearResolved')}</button>}
      </nav>
      <div className="modal-body thin-scrollbar">
        {!visible.length && (view === 'active'
          ? <div className="inbox-empty"><CheckCircle2 size={28} /><h2>{t('inbox.emptyTitle')}</h2><p>{t('inbox.emptyHint')}</p></div>
          : <p className="hint">{t('inbox.emptyResolved')}</p>)}
        <ul className="inbox-list">{visible.map((entry) => {
          const Icon = ICONS[entry.kind] ?? Hand;
          return <li key={entry.id} className={`inbox-entry ${entry.kind} ${entry.resolved ? 'resolved' : ''}`}>
            <span className="inbox-icon"><Icon size={17} /></span>
            <div className="inbox-entry-body">
              <div className="inbox-entry-header"><strong>{entry.name || entry.caseId}</strong><span className="hint">{entry.boardName} · {new Date(entry.updatedAt).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })}</span></div>
              <span className="inbox-kind">{t(`inbox.kind.${entry.kind}`)}</span>
              <p>{message(entry)}</p>
            </div>
            <button className="text-button inbox-case" disabled={!entry.navigable} title={entry.navigable ? undefined : t('inbox.gone')} onClick={() => { onFocus(entry.caseId); onClose(); }}><LocateFixed size={14} />{t(entry.kind === 'permission' ? 'inbox.answer' : 'inbox.open')}</button>
          </li>;
        })}</ul>
        <p className="hint inbox-footnote">{t('inbox.hint')}</p>
      </div>
    </div>
  </div>;
}
