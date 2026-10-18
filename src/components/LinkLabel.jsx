import { EdgeLabelRenderer } from '@xyflow/react';
import { Network, Pause } from 'lucide-react';

// Étiquette au milieu d'un lien (affichée seulement s'il y a la place) : état du lien et tours.
// Un clic ouvre le panneau du lien.
export default function LinkLabel({ x, y, state, prompt, targetName, turns, maxTurns, message, onOpen }) {
  let text;
  switch (state) {
    case 'unconfigured': text = 'Configurer le lien'; break;
    case 'disabled': text = 'Lien en pause'; break;
    case 'delegate': text = 'Délégation'; break;
    case 'sending': text = `Transmission à ${targetName}…`; break;
    case 'queued': text = `En attente de ${targetName}…`; break;
    case 'limit': text = 'Limite de tours atteinte'; break;
    case 'error': text = message; break;
    default: text = `« ${prompt.trim()} »`;
  }
  const showTurns = state !== 'unconfigured' && state !== 'disabled' && state !== 'error';

  return (
    <EdgeLabelRenderer>
      <button
        className={`link-label ${state} nodrag nopan`}
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        onClick={onOpen}
        title="Réglages du lien"
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
