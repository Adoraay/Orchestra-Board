import { useRef } from 'react';
import { Copy, Crosshair, Link2, Pencil, Trash2, Type } from 'lucide-react';
import useFloatingMenu from '../hooks/useFloatingMenu.js';
import useT from '../hooks/useT.js';

// Actions proposées selon le type d'élément : une case (clic droit sur sa barre de titre), un post-it, un texte.
const ACTIONS = {
  terminal: ['rename', 'duplicate', 'focus', 'link', 'delete'],
  note: ['rename', 'edit', 'duplicate', 'focus', 'link', 'delete'],
  text: ['edit', 'duplicate', 'focus', 'delete'],
};
const ICONS = { rename: Pencil, edit: Type, duplicate: Copy, focus: Crosshair, link: Link2, delete: Trash2 };

// Menu du clic droit sur un élément de la map.
export default function NodeMenu({ x, y, type, onAction, onClose }) {
  const t = useT();
  const ref = useRef(null);
  const position = useFloatingMenu(ref, x, y, onClose);
  const shortcuts = { rename: 'F2', delete: t('key.Del') };

  return (
    <div ref={ref} className="context-menu" role="menu" style={position} onContextMenu={(e) => e.preventDefault()}>
      {ACTIONS[type].map((action) => {
        const Icon = ICONS[action];
        return (
          <div key={action} className="menu-group">
            {action === 'delete' && <div className="menu-separator" />}
            <button className={`menu-item ${action === 'delete' ? 'danger' : ''}`} role="menuitem" onClick={() => onAction(action)}>
              <Icon size={14} />
              <span className="menu-label">{t(action === 'rename' ? 'common.rename' : action === 'delete' ? 'common.delete' : `nodeMenu.${action}`)}</span>
              {shortcuts[action] && <kbd>{shortcuts[action]}</kbd>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
