import { Pin, PinOff } from 'lucide-react';
import useT from '../hooks/useT.js';

// Punaise d'un panneau (PLAN.md §7, 3.4) : épinglé, il ne se referme plus tout seul après un clic ailleurs.
export default function PinButton({ pinned, onPin }) {
  const t = useT();
  return (
    <button
      className={`icon-button ${pinned ? 'active' : ''}`}
      title={t(pinned ? 'panel.unpin' : 'panel.pin')}
      aria-pressed={pinned}
      onClick={() => onPin(!pinned)}
    >
      {pinned ? <PinOff size={14} /> : <Pin size={14} />}
    </button>
  );
}
