import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import StatusDot from './StatusDot.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import useT from '../hooks/useT.js';
import { displayPath } from '../lib/paths.js';

// Fermeture de l'app pendant que des agents travaillent : liste de ce qui sera interrompu.
// agents : [{ id, name, status, cwd, agent, boardName }]. Échap ou clic à côté = Annuler.
export default function QuitDialog({ agents, onCancel, onQuit }) {
  const { homeDir } = useWorkspace();
  const t = useT();
  const count = agents.length;
  const allResumable = agents.every((a) => a.agent.resumeArgs);
  const waiting = agents.some((a) => a.status === 'waiting');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="quit-title" aria-describedby="quit-text">
        <header className="dialog-header">
          <span className="dialog-icon warning"><TriangleAlert size={18} /></span>
          <h1 id="quit-title">{t('quit.title')}</h1>
        </header>

        <p id="quit-text" className="dialog-text">{t('quit.text', { count, name: agents[0].name })}</p>

        <ul className="dialog-list no-scrollbar">
          {agents.map((a) => (
            <li key={a.id} className="dialog-row">
              <AgentLogo agent={a.agent} size={22} />
              <span className="dialog-row-text">
                <span className="dialog-row-name">{a.name}</span>
                <span className="muted">
                  {[a.boardName, a.cwd && displayPath(a.cwd, homeDir)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`dialog-status ${a.status}`}>
                <StatusDot status={a.status} />
                {t(`quit.status.${a.status}`)}
              </span>
            </li>
          ))}
        </ul>

        {(allResumable || waiting) && (
          <p className="hint">
            {waiting && t('quit.waitingHint')}
            {allResumable && t('quit.resumable', { count })}
          </p>
        )}

        <div className="dialog-actions">
          <button className="text-button" onClick={onCancel} autoFocus>
            {t('common.cancel')}
          </button>
          <button className="text-button danger-fill" onClick={onQuit}>
            {t('quit.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
