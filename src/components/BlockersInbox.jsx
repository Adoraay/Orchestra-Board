import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useT from '../hooks/useT.js';

export default function BlockersInbox({ entries, onFocus, onClose }) {
  const t = useT();
  const [showResolved, setShowResolved] = useState(false);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const visible = entries.filter((entry) => showResolved || !entry.resolved);
  return <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal inbox-modal" role="dialog" aria-modal="true" aria-labelledby="inbox-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <header className="modal-header"><h1 id="inbox-title">{t('inbox.title')}</h1><button className="icon-button" title={t('common.close')} onClick={onClose}><X size={17} /></button></header>
      <div className="modal-body thin-scrollbar">
        <div className="inbox-controls">
          <label className="checkbox"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />{t('inbox.showResolved')}</label>
          <button className="text-button" onClick={() => window.blockers.clearResolved()}>{t('inbox.clearResolved')}</button>
        </div>
        <p className="hint">{t('inbox.hint')}</p>
        {!visible.length && <p>{t('inbox.empty')}</p>}
        <ul className="inbox-list">{visible.map((entry) => <li key={entry.id} className={`inbox-entry ${entry.resolved ? 'resolved' : ''}`}>
          <div className="inbox-entry-header"><strong>{t(`inbox.kind.${entry.kind}`)}</strong><span className="hint">{t(entry.resolved ? 'inbox.resolved' : 'inbox.active')}</span></div>
          <button className="inbox-case" disabled={!entry.navigable} onClick={() => { onFocus(entry.caseId); onClose(); }}>{entry.name || entry.caseId} <span className="muted">· {entry.boardName}</span></button>
          <p>{entry.kind === 'permission' ? t('inbox.permission') : entry.kind === 'exit' ? t('inbox.exit', { code: entry.text }) : entry.text || t('inbox.limit')}</p>
          <time className="hint">{new Date(entry.updatedAt).toLocaleString(t.locale)}</time>
        </li>)}</ul>
      </div>
    </div>
  </div>;
}
