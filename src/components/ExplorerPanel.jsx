import { useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

// Explorateur de documents (à droite). L'arborescence arrive à l'étape 3.
export default function ExplorerPanel() {
  const [collapsed, setCollapsed] = useState(false);

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
      <p className="hint">L'explorateur de dossiers arrive bientôt.</p>
    </aside>
  );
}
