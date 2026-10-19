import { useEffect } from 'react';
import { History, LayoutGrid, MessageSquarePlus } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import useT from '../hooks/useT.js';

const MAX_CHIPS = 8;

// Au démarrage : reprendre ou non les conversations de tous les agents restaurés, en une fois.
// « Voir le tableau » = choisir case par case (Échap fait pareil : rien n'est lancé sans choix).
// agents : [{ id, name, agent }], boardCount : nombre de tableaux concernés.
export default function ResumeDialog({ agents, boardCount, onChoose }) {
  const t = useT();

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onChoose('manual');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onChoose]);

  const hidden = agents.length - MAX_CHIPS;

  return (
    <div className="modal-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title" aria-describedby="resume-text">
        <header className="dialog-header">
          <span className="dialog-icon"><History size={18} /></span>
          <h1 id="resume-title">{t('resume.title')}</h1>
        </header>

        <p id="resume-text" className="dialog-text">{t('resume.text', { count: agents.length, boards: boardCount })}</p>

        <ul className="dialog-chips">
          {agents.slice(0, MAX_CHIPS).map((a) => (
            <li key={a.id} className="dialog-chip">
              <AgentLogo agent={a.agent} size={16} />
              <span>{a.name}</span>
            </li>
          ))}
          {hidden > 0 && <li className="dialog-chip muted">+{hidden}</li>}
        </ul>

        <div className="dialog-actions">
          <button className="text-button" onClick={() => onChoose('manual')} title={t('resume.manualTitle')}>
            <LayoutGrid size={15} />
            {t('resume.manual')}
          </button>
          <button className="text-button" onClick={() => onChoose('new')}>
            <MessageSquarePlus size={15} />
            {t('resume.new')}
          </button>
          <button className="text-button primary" onClick={() => onChoose('resume')} autoFocus>
            <History size={15} />
            {t('resume.resume')}
          </button>
        </div>
      </div>
    </div>
  );
}
