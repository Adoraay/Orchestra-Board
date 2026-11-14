import { WandSparkles } from 'lucide-react';
import useT from '../hooks/useT.js';
import { toolLabel } from '../lib/conductorLabels.js';

// Encart « Composition de l'orchestre… » au centre de la partie visible de la map (sous la bulle si elle est
// ouverte), pendant que le chef d'orchestre construit : ses cases apparaissent ensemble une fois le plan fini.
export default function ConductorComposing({ boardRef, action, nameOf }) {
  const t = useT();
  const board = boardRef.current?.getBoundingClientRect();
  const bar = boardRef.current?.querySelector('.conductor-bar')?.getBoundingClientRect();
  const top = board && bar ? (bar.bottom - board.top + board.height) / 2 : null;
  return (
    <div className="conductor-composing" role="status" style={{ top: top === null ? '50%' : `${top}px` }}>
      <WandSparkles size={26} className="conductor-composing-icon" />
      <strong>{t('conductor.composing')}</strong>
      {action && <span>{toolLabel(t, action, nameOf)}</span>}
    </div>
  );
}
