import { useRef } from 'react';
import { Gauge } from 'lucide-react';
import PinButton from './PinButton.jsx';
import UsageView from './UsageView.jsx';
import useAutoClose from '../hooks/useAutoClose.js';
import useT from '../hooks/useT.js';
import { startPanelDrag } from '../lib/panels.js';

// Onglet replié sur le bord droit de la map : à ouvrir d'un clic, ou à glisser sur la map pour le garder visible.
export default function UsagePanel({ open, onToggle, agentId, onSelectAgent, pinned, onPin }) {
  const t = useT();
  const wrapRef = useRef(null);
  useAutoClose(wrapRef, open && !pinned, onToggle);

  return (
    <div className="usage-wrap" ref={wrapRef}>
      {/* Toujours rendu, pour glisser à l'ouverture comme à la fermeture ; inerte quand il est replié. */}
      <div className={`usage-slide ${open ? 'open' : ''}`} inert={open ? undefined : ''}>
        <div className="usage-clip">
          <UsageView active={open} agentId={agentId} onSelectAgent={onSelectAgent} actions={<PinButton pinned={pinned} onPin={onPin} />} />
        </div>
      </div>
      <button
        className={`usage-tab ${open ? 'open' : ''}`}
        onClick={onToggle}
        title={`${t('usage.toggle', { open })} · ${t('panel.dragHint')}`}
        draggable
        onDragStart={(e) => startPanelDrag(e, 'usage')}
      >
        <Gauge size={15} />
        <span className="usage-tab-label">{t('usage.title')}</span>
      </button>
    </div>
  );
}
