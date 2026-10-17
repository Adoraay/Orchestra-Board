import { Folder, Settings } from 'lucide-react';

// Barre du haut : nom de l'app, dossier actif (donné au prochain agent), paramètres.
export default function TopBar({ activeFolder }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-dot" />
        Agent Board
      </div>

      <div className="topbar-folder" title={activeFolder || undefined}>
        <Folder size={15} />
        <span className="muted">Dossier actif :</span>
        <span className={activeFolder ? '' : 'muted'}>{activeFolder || 'aucun'}</span>
      </div>

      {/* Les paramètres arrivent à l'étape 5 */}
      <button className="icon-button" title="Paramètres" disabled>
        <Settings size={17} />
      </button>
    </header>
  );
}
