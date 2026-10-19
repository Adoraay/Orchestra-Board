import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import StatusDot from './StatusDot.jsx';

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// Suppr sur la sélection : confirmation avec ce qui va disparaître. Les cases terminal listées seront
// fermées (agent arrêté). selection : { terminals: [{ id, name, agent, status }], links, notes, texts, strokes }.
export default function DeleteDialog({ selection, onCancel, onConfirm }) {
  const { terminals, links, notes, texts, strokes } = selection;
  const others = [
    links && plural(links, 'lien', 'liens'),
    notes && plural(notes, 'post-it', 'post-it'),
    texts && plural(texts, 'texte', 'textes'),
    strokes && plural(strokes, 'trait', 'traits'),
  ].filter(Boolean);
  const busy = terminals.some((t) => t.status === 'working' || t.status === 'waiting');

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
          <h1 id="delete-title">Supprimer la sélection ?</h1>
        </header>

        <p id="delete-text" className="dialog-text">
          {terminals.length > 0 &&
            `${terminals.length > 1 ? `Ces ${terminals.length} cases seront fermées` : 'Cette case sera fermée'} et ${
              terminals.length > 1 ? 'leurs agents arrêtés' : 'son agent arrêté'
            }.`}
          {terminals.length > 0 && others.length > 0 && ' '}
          {others.length > 0 && `${terminals.length ? 'Aussi supprimé' : 'Sera supprimé'} : ${others.join(', ')}.`}
        </p>

        {terminals.length > 0 && (
          <ul className="dialog-list no-scrollbar">
            {terminals.map((t) => (
              <li key={t.id} className="dialog-row">
                <AgentLogo agent={t.agent} size={22} />
                <span className="dialog-row-text">
                  <span className="dialog-row-name">{t.name}</span>
                </span>
                {t.status && <StatusDot status={t.status} />}
              </li>
            ))}
          </ul>
        )}

        {busy && <p className="hint">Un agent de la sélection travaille encore : sa tâche sera interrompue.</p>}

        <div className="dialog-actions">
          <button className="text-button" onClick={onCancel}>
            Annuler
          </button>
          <button className="text-button danger-fill" onClick={onConfirm} autoFocus>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
