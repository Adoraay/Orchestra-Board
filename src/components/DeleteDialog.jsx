import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import StatusDot from './StatusDot.jsx';
import useT from '../hooks/useT.js';

// Suppr sur la sélection : confirmation avec ce qui va disparaître. Les cases terminal listées seront
// fermées (agent arrêté). selection : { terminals: [{ id, name, agent, status }], links, notes, texts, strokes }.
export default function DeleteDialog({ selection, onCancel, onConfirm }) {
  const t = useT();
  const { terminals } = selection;
  const others = ['links', 'notes', 'texts', 'strokes']
    .filter((kind) => selection[kind])
    .map((kind) => t(`delete.${kind}`, { count: selection[kind] }));
  const busy = terminals.some((term) => term.status === 'working' || term.status === 'waiting');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-text">
        <header className="dialog-header">
          <span className="dialog-icon warning"><Trash2 size={18} /></span>
          <h1 id="delete-title">{t('delete.title')}</h1>
        </header>

        <p id="delete-text" className="dialog-text">
          {terminals.length > 0 && t('delete.terminals', { count: terminals.length })}
          {terminals.length > 0 && others.length > 0 && ' '}
          {others.length > 0 && t('delete.others', { list: others.join(', '), withTerminals: terminals.length > 0 })}
        </p>

        {terminals.length > 0 && (
          <ul className="dialog-list no-scrollbar">
            {terminals.map((term) => (
              <li key={term.id} className="dialog-row">
                <AgentLogo agent={term.agent} size={22} />
                <span className="dialog-row-text">
                  <span className="dialog-row-name">{term.name}</span>
                </span>
                {term.status && <StatusDot status={term.status} />}
              </li>
            ))}
          </ul>
        )}

        {busy && <p className="hint">{t('delete.busy')}</p>}

        <div className="dialog-actions">
          <button className="text-button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="text-button danger-fill" onClick={onConfirm} autoFocus>
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
