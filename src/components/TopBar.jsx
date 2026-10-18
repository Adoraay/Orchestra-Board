import { Folder, Settings } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import BoardTabs from './BoardTabs.jsx';

// Barre sous le titre : onglets des tableaux, dossier actif (donné au prochain agent), paramètres.
export default function TopBar({ boards, onOpenSettings }) {
  const { activeFolder, homeDir } = useWorkspace();

  return (
    <header className="topbar">
      <BoardTabs
        boards={boards.boards}
        activeId={boards.activeId}
        onSelect={boards.setActiveId}
        onCreate={boards.createBoard}
        onRename={boards.renameBoard}
        onDelete={boards.deleteBoard}
        agentCount={boards.agentCount}
      />

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
