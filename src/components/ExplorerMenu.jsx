import { useRef } from 'react';
import { ChevronLeft, ClipboardCopy, FolderOpen, FolderPlus, Pencil, Play, Trash2 } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import useFloatingMenu from '../hooks/useFloatingMenu.js';
import useT from '../hooks/useT.js';

// Menu du clic droit dans l'explorateur (PLAN.md §3.14). « Lancer un agent ici » ouvre un sous-menu
// vers la gauche (l'explorateur est collé au bord droit). Échap, clic ailleurs ou défilement le ferment.
export default function ExplorerMenu({ x, y, entry, isRoot, agents, onAction, onClose }) {
  const t = useT();
  const ref = useRef(null);
  const position = useFloatingMenu(ref, x, y, onClose);

  const item = (action, Icon, label, { shortcut, danger, disabled } = {}) => (
    <button
      className={`menu-item ${danger ? 'danger' : ''}`}
      role="menuitem"
      disabled={disabled}
      title={disabled ? t('menu.rootDisabled') : undefined}
      onClick={() => onAction(action)}
    >
      <Icon size={14} />
      <span className="menu-label">{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );

  return (
    <div ref={ref} className="context-menu" role="menu" style={position} onContextMenu={(e) => e.preventDefault()}>
      {entry.isDir && item('create', FolderPlus, t('menu.newFolder'))}
      {entry.isDir && <div className="menu-separator" />}
      {item('rename', Pencil, t('common.rename'), { shortcut: 'F2', disabled: isRoot })}
      {item('copyPath', ClipboardCopy, t('menu.copyPath'))}
      {item('reveal', FolderOpen, t(entry.isDir ? 'menu.openInExplorer' : 'menu.revealInExplorer'))}
      {entry.isDir && agents.length > 0 && (
        <>
          <div className="menu-separator" />
          <div className="menu-item has-submenu" role="menuitem" aria-haspopup="menu" tabIndex={0}>
            <ChevronLeft size={14} />
            <span className="menu-label">{t('menu.launchHere')}</span>
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
      {item('trash', Trash2, t('common.delete'), { shortcut: t('key.Del'), danger: true, disabled: isRoot })}
    </div>
  );
}
