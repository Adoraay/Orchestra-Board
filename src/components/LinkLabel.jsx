import { EdgeLabelRenderer } from '@xyflow/react';
import { Network, Pause } from 'lucide-react';
import useT from '../hooks/useT.js';

// Étiquette au milieu d'un lien (affichée seulement s'il y a la place) : état du lien et tours.
// Un clic ouvre le panneau du lien.
export default function LinkLabel({ x, y, state, prompt, targetName, turns, maxTurns, message, onOpen }) {
  const t = useT();
  let text;
  switch (state) {
    case 'unconfigured':
    case 'disabled':
    case 'delegate':
    case 'limit':
      text = t(`link.label.${state}`);
      break;
    case 'sending':
    case 'queued':
      text = t(`link.label.${state}`, { name: targetName });
      break;
    case 'error': text = message; break;
    default: text = t('link.label.prompt', { prompt: prompt.trim() });
  }
  const showTurns = state !== 'unconfigured' && state !== 'disabled' && state !== 'error';

  return (
    <EdgeLabelRenderer>
      <button
        className={`link-label ${state} nodrag nopan`}
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        onClick={onOpen}
        title={t('link.panelLabel')}
      >
        {state === 'disabled' && <Pause size={13} />}
        {state === 'delegate' && <Network size={13} />}
        {state !== 'disabled' && state !== 'delegate' && <span className="link-label-dot" />}
        <span className="link-label-text">{text}</span>
        {showTurns && <span className="link-label-turns">{turns}/{maxTurns}</span>}
      </button>
    </EdgeLabelRenderer>
  );
}
