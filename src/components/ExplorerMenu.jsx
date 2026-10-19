import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ClipboardCopy, FolderOpen, FolderPlus, Pencil, Play, Trash2 } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';

const MARGIN = 8; // px : le menu reste dans la fenêtre

// Menu du clic droit dans l'explorateur (PLAN.md §3.14). « Lancer un agent ici » ouvre un sous-menu
// vers la gauche (l'explorateur est collé au bord droit). Échap, clic ailleurs ou défilement le ferment.
export default function ExplorerMenu({ x, y, entry, isRoot, agents, onAction, onClose }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    // Clic ou molette en dehors du menu (la molette dans un long sous-menu le fait défiler).
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('wheel', onPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('wheel', onPointerDown, true);
    };
  }, [onClose]);

  const item = (action, Icon, label, { shortcut, danger, disabled } = {}) => (
    <button
      className={`menu-item ${danger ? 'danger' : ''}`}
      role="menuitem"
      disabled={disabled}
      title={disabled ? "Impossible sur la racine de l'explorateur" : undefined}
      onClick={() => onAction(action)}
    >
      <Icon size={14} />
      <span className="menu-label">{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );

  return (
    <div ref={ref} className="context-menu" role="menu" style={position} onContextMenu={(e) => e.preventDefault()}>
      {entry.isDir && item('create', FolderPlus, 'Nouveau dossier')}
      {entry.isDir && <div className="menu-separator" />}
      {item('rename', Pencil, 'Renommer', { shortcut: 'F2', disabled: isRoot })}
      {item('copyPath', ClipboardCopy, 'Copier le chemin')}
      {item('reveal', FolderOpen, entry.isDir ? "Ouvrir dans l'Explorateur" : "Afficher dans l'Explorateur")}
      {entry.isDir && agents.length > 0 && (
        <>
          <div className="menu-separator" />
          <div className="menu-item has-submenu" role="menuitem" aria-haspopup="menu" tabIndex={0}>
            <ChevronLeft size={14} />
            <span className="menu-label">Lancer un agent ici</span>
            <Play size={13} />
            <div className="context-menu submenu" role="menu">
              {agents.map((agent) => (
                <button key={agent.id} className="menu-item" role="menuitem" onClick={() => onAction('launch', agent.id)}>
                  <AgentLogo agent={agent} size={16} />
                  <span className="menu-label">{agent.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="menu-separator" />
      {item('trash', Trash2, 'Supprimer', { shortcut: 'Suppr', danger: true, disabled: isRoot })}
    </div>
  );
}
