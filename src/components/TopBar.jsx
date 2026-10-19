import { useEffect, useState } from 'react';
import { Folder, Settings } from 'lucide-react';
import lockup from '../assets/orchestra-lockup.svg';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import BoardTabs from './BoardTabs.jsx';

const CONTROLS_FALLBACK = 140; // px : largeur des boutons Windows si l'API ne la donne pas

// Place laissée à droite pour les boutons Windows (réduire, agrandir, fermer) dessinés par-dessus la barre.
function useWindowControlsWidth() {
  const [width, setWidth] = useState(CONTROLS_FALLBACK);
  useEffect(() => {
    const overlay = navigator.windowControlsOverlay;
    if (!overlay?.visible) return;
    const update = () => {
      const rect = overlay.getTitlebarAreaRect();
      if (rect.width) setWidth(Math.max(0, window.innerWidth - rect.x - rect.width));
    };
    update();
    overlay.addEventListener('geometrychange', update);
    return () => overlay.removeEventListener('geometrychange', update);
  }, []);
  return width;
}

// Seule barre en haut de la fenêtre (elle sert aussi à la déplacer) : logo et nom, onglets des tableaux,
// dossier actif (donné au prochain agent), paramètres, puis les boutons Windows.
export default function TopBar({ boards, boardsWithNews, onOpenSettings }) {
  const { activeFolder, homeDir } = useWorkspace();
  const controlsWidth = useWindowControlsWidth();

  return (
    <header className="topbar" style={{ paddingRight: controlsWidth }}>
      <img className="topbar-lockup" src={lockup} alt="Orchestra" draggable={false} />
      <span className="topbar-separator" />

      <BoardTabs
        boards={boards.boards}
        activeId={boards.activeId}
        onSelect={boards.setActiveId}
        onCreate={boards.createBoard}
        onRename={boards.renameBoard}
        onDelete={boards.deleteBoard}
        agentCount={boards.agentCount}
        boardsWithNews={boardsWithNews}
      />

      <div className="topbar-folder no-drag" title={activeFolder || undefined}>
        <Folder size={15} />
        <span className="muted">Dossier actif :</span>
        <span className={activeFolder ? 'topbar-path' : 'muted'}>
          {activeFolder ? displayPath(activeFolder, homeDir) : 'aucun'}
        </span>
      </div>

      <button className="icon-button no-drag" title="Paramètres" onClick={onOpenSettings}>
        <Settings size={17} />
      </button>
      <span className="topbar-separator" />
    </header>
  );
}
