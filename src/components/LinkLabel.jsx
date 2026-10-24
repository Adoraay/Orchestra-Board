import { EdgeLabelRenderer } from '@xyflow/react';
import { Network, Pause, SquareTerminal, StickyNote } from 'lucide-react';
import useT from '../hooks/useT.js';
import LinkReview from './LinkReview.jsx';

// Étiquette au milieu d'un lien (affichée seulement s'il y a la place) : état du lien et tours.
// Un clic ouvre le panneau du lien.
export default function LinkLabel({ x, y, state, prompt, targetName, turns, maxTurns, message, onOpen, draft, draftCount }) {
  const t = useT();
  let text;
  switch (state) {
    case 'unconfigured':
    case 'disabled':
    case 'delegate':
    case 'terminal':
    case 'note':
    case 'limit':
      text = t(`link.label.${state}`);
      break;
    case 'sending':
    case 'queued':
    case 'review':
      text = t(`link.label.${state}`, { name: targetName });
      break;
    case 'error': text = message; break;
    default: text = t('link.label.prompt', { prompt: prompt.trim() });
  }
  const showTurns = maxTurns != null && state !== 'unconfigured' && state !== 'disabled' && state !== 'error';

  return (
    <EdgeLabelRenderer>
      <div
        className={`link-label ${state} ${draft ? 'has-review' : ''} nodrag nopan nowheel`}
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className="link-label-main" onClick={onOpen} title={t('link.panelLabel')}>
          {state === 'disabled' && <Pause size={13} />}
          {state === 'delegate' && <Network size={13} />}
          {state === 'terminal' && <SquareTerminal size={13} />}
          {state === 'note' && <StickyNote size={13} />}
          {!['disabled', 'delegate', 'terminal', 'note'].includes(state) && <span className="link-label-dot" />}
          <span className="link-label-text">{text}</span>
          {showTurns && <span className="link-label-turns">{turns}/{maxTurns}</span>}
        </button>
        {draft && <LinkReview key={draft.qid} draft={draft} count={draftCount} />}
      </div>
    </EdgeLabelRenderer>
  );
}
