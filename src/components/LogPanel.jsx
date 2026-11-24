import { useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import LogView from './LogView.jsx';
import PinButton from './PinButton.jsx';
import useAutoClose from '../hooks/useAutoClose.js';
import usePendingMessages from '../hooks/usePendingMessages.js';
import useT from '../hooks/useT.js';
import { startPanelDrag } from '../lib/panels.js';

// Languette « Journal » sur le bord droit de la map (PLAN.md §3.18), à ouvrir d'un clic ou à glisser sur la map.
// Toujours abonnée, même repliée : un point signale les nouvelles entrées.
export default function LogPanel({ open, onToggle, onFocus, boards, pinned, onPin }) {
  const t = useT();
  const wrapRef = useRef(null);
  const [unseen, setUnseen] = useState(false);
  const pending = usePendingMessages();
  useAutoClose(wrapRef, open && !pinned, onToggle);

  useEffect(() => {
    if (open) setUnseen(false);
  }, [open, unseen]);

  return (
    <div className="usage-wrap log-wrap" ref={wrapRef}>
      <div className={`usage-slide ${open ? 'open' : ''}`} inert={open ? undefined : ''}>
        <div className="usage-clip">
          <LogView
            active={open}
            onFocus={onFocus}
            boards={boards}
            onEntry={() => setUnseen(true)}
            actions={<PinButton pinned={pinned} onPin={onPin} />}
          />
        </div>
      </div>
      <button
        className={`usage-tab ${open ? 'open' : ''}`}
        onClick={onToggle}
        title={`${t('log.toggle', { open })} · ${t('panel.dragHint')}`}
        draggable
        onDragStart={(e) => startPanelDrag(e, 'log')}
      >
        <ScrollText size={15} />
        <span className="usage-tab-label">{t('log.title')}</span>
        {(unseen || pending.some((item) => item.state === 'draft')) && !open && <span className="log-unseen" />}
      </button>
    </div>
  );
}
