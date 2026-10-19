import { useEffect } from 'react';
import { History, LayoutGrid, MessageSquarePlus } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';

const MAX_CHIPS = 8;

// Au démarrage : reprendre ou non les conversations de tous les agents restaurés, en une fois.
// « Voir le tableau » = choisir case par case (Échap fait pareil : rien n'est lancé sans choix).
// agents : [{ id, name, agent }], boardCount : nombre de tableaux concernés.
export default function ResumeDialog({ agents, boardCount, onChoose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onChoose('manual');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onChoose]);

  const plural = agents.length > 1;
  const hidden = agents.length - MAX_CHIPS;

  return (
    <div className="modal-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="resume-title" aria-describedby="resume-text">
        <header className="dialog-header">
          <span className="dialog-icon"><History size={18} /></span>
          <h1 id="resume-title">Reprendre tes discussions ?</h1>
        </header>

        <p id="resume-text" className="dialog-text">
          {plural ? `${agents.length} agents` : '1 agent'}
          {boardCount > 1 ? ` sur ${boardCount} tableaux` : ''} {plural ? 'avaient' : 'avait'} une conversation en cours lors
          de ta dernière session.{' '}
          {plural
            ? 'Veux-tu reprendre ces conversations là où elles s’étaient arrêtées ?'
            : 'Veux-tu reprendre cette conversation là où elle s’était arrêtée ?'}
        </p>

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
          <button className="text-button" onClick={() => onChoose('manual')} title="Choisir case par case sur la map">
            <LayoutGrid size={15} />
            Voir le tableau
          </button>
          <button className="text-button" onClick={() => onChoose('new')}>
            <MessageSquarePlus size={15} />
            Nouvelle discussion
          </button>
          <button className="text-button primary" onClick={() => onChoose('resume')} autoFocus>
            <History size={15} />
            Reprendre
          </button>
        </div>
      </div>
    </div>
  );
}
