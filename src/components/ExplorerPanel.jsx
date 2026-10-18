import { useState } from 'react';
import { FolderInput, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import FolderTree from './FolderTree.jsx';

// Explorateur de documents (à droite) : cliquer un dossier en fait le dossier actif.
export default function ExplorerPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const { rootPath, changeRoot } = useWorkspace();

  if (collapsed) {
    return (
      <aside className="explorer collapsed">
        <button className="icon-button" title="Afficher les documents" onClick={() => setCollapsed(false)}>
          <PanelRightOpen size={17} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="explorer">
      <div className="panel-header">
        <h2>Documents</h2>
        <button className="icon-button" title="Masquer les documents" onClick={() => setCollapsed(true)}>
          <PanelRightClose size={17} />
        </button>
      </div>

      <div className="explorer-tree no-scrollbar">
        {rootPath ? <FolderTree rootPath={rootPath} /> : <p className="hint">Chargement…</p>}
      </div>

      <button className="text-button" onClick={changeRoot}>
        <FolderInput size={15} />
        Changer la racine
      </button>
    </aside>
  );
}
