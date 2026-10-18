import { Folder, Settings } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';

// Barre du haut : nom de l'app, dossier actif (donné au prochain agent), paramètres.
export default function TopBar({ onOpenSettings }) {
  const { activeFolder, homeDir } = useWorkspace();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-dot" />
        Agent Board
      </div>

      <div className="topbar-folder" title={activeFolder || undefined}>
        <Folder size={15} />
        <span className="muted">Dossier actif :</span>
        <span className={activeFolder ? 'topbar-path' : 'muted'}>
          {activeFolder ? displayPath(activeFolder, homeDir) : 'aucun'}
        </span>
      </div>

      <button className="icon-button" title="Paramètres" onClick={onOpenSettings}>
        <Settings size={17} />
      </button>
    </header>
  );
}
