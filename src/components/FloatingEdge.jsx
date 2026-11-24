import { useEffect, useReducer } from 'react';
import { BaseEdge, Position, getBezierPath, useInternalNode, useReactFlow } from '@xyflow/react';
import LinkLabel from './LinkLabel.jsx';
import { useBoard } from '../context/BoardContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { DEFAULT_LINK } from '../lib/links.js';
import { arrowPath, pickSides, sidePoint } from '../lib/edgeGeometry.js';
import useT from '../hooks/useT.js';

const PULSE_DURATION = 1200; // ms : un point lumineux parcourt le lien à chaque transmission
const SENDING_FOR = 2000; // ms pendant lesquels le lien reste « en cours de transfert » après un envoi
const LABEL_ROOM = { horizontal: 320, vertical: 90 }; // écart minimal entre les cases pour l'étiquette
// État affiché : réglages du lien d'abord (pause, Transmission sans consigne), puis dernier événement.
// Au repos, une Délégation est « delegate », un lien Terminal « terminal », un lien Note « note », une Transmission configurée « ready ».
function linkState(link, event) {
  if (['visual', 'browser'].includes(link.mode)) return link.enabled ? link.mode : 'disabled';
  if (link.mode === 'terminal' || link.mode === 'note') return event?.state === 'sent' && Date.now() - event.at < SENDING_FOR ? 'sending' : link.mode;
  if (!link.enabled) return 'disabled';
  if (link.mode === 'relay' && !link.prompt.trim()) return 'unconfigured';
  const rest = link.mode === 'delegate' ? 'delegate' : 'ready';
  if (event?.state === 'sent') return Date.now() - event.at < SENDING_FOR ? 'sending' : rest;
  if (['queued', 'review', 'limit', 'error'].includes(event?.state)) return event.state;
  return rest;
}

// Lien qui part du côté de A le plus proche de B (PLAN.md §3.8), coloré selon son état (§3.5).
export default function FloatingEdge({ id, source, target, data, style }) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { linkEvents, pendingMessages } = useBoard();
  const event = linkEvents[id];
  const { agentById } = useSettings();
  const t = useT();
  const { setEdges, setNodes } = useReactFlow();
  const [, rerender] = useReducer((n) => n + 1, 0);

  // Fin de la période « en cours de transfert » : on redessine pour revenir à « prêt ».
  useEffect(() => {
    if (event?.state !== 'sent') return;
    const timer = setTimeout(rerender, Math.max(0, SENDING_FOR - (Date.now() - event.at)));
    return () => clearTimeout(timer);
  }, [event]);

  if (!sourceNode?.measured?.width || !targetNode?.measured?.width) return null;

  const [sourceSide, targetSide] = pickSides(sourceNode, targetNode);
  const from = sidePoint(sourceNode, sourceSide);
  const to = sidePoint(targetNode, targetSide);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: sourceSide,
    targetX: to.x,
    targetY: to.y,
    targetPosition: targetSide,
  });

  const link = { ...DEFAULT_LINK, ...data };
  const drafts = pendingMessages.filter((item) => item.linkId === id && item.state === 'draft');
  const draft = link.mode === 'relay' && link.enabled ? drafts[0] : null;
  // La file fait foi, même si un autre envoi ou une remise à zéro a remplacé le dernier événement.
  const state = draft ? 'review' : linkState(link, event?.state === 'review' ? null : event);
  const pulsing = event?.state === 'sent' && Date.now() - event.at < PULSE_DURATION;
  const horizontal = sourceSide === Position.Left || sourceSide === Position.Right;
  const labelWidth = ['visual', 'browser'].includes(link.mode) ? 120 : LABEL_ROOM.horizontal;
  const roomy = horizontal ? Math.abs(to.x - from.x) >= labelWidth : Math.abs(to.y - from.y) >= LABEL_ROOM.vertical;
  const turns = event && typeof event.turns === 'number' ? event.turns : 0;
  // Dans un lien à double sens, le message peut aller vers la source : event.to dit vers qui.
  const toNode = (draft?.to ?? event?.to) === source ? sourceNode : targetNode;
  const targetName = toNode.data?.label || (toNode.type === 'note' ? t('note.defaultName') : agentById(toNode.data?.agentId).name);

  // Clic sur l'étiquette = ce lien seul choisi, son panneau s'ouvre.
  const open = () => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((eds) => eds.map((e) => (Boolean(e.selected) === (e.id === id) ? e : { ...e, selected: e.id === id })));
  };

  return (
    <>
      <BaseEdge id={id} path={path} style={style} className={`link-${state}`} />
      <path d={arrowPath(to, targetSide)} className={`react-flow__edge-path link-arrow link-${state}`} />
      {link.bidirectional && <path d={arrowPath(from, sourceSide)} className={`react-flow__edge-path link-arrow link-${state}`} />}
      {pulsing && (
        <circle key={event.at} r="5" className="link-pulse">
          {/* Message vers la source (lien à double sens, réponse d'une délégation) : le point remonte le lien */}
          <animateMotion
            dur={`${PULSE_DURATION}ms`}
            path={path}
            fill="freeze"
            {...(event.to === source && { keyPoints: '1;0', keyTimes: '0;1', calcMode: 'linear' })}
          />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={`${PULSE_DURATION}ms`} fill="freeze" />
        </circle>
      )}
      {roomy && (
        <LinkLabel
          x={labelX}
          y={labelY}
          state={state}
          prompt={link.prompt}
          targetName={targetName}
          turns={turns}
          maxTurns={['terminal', 'note', 'visual', 'browser'].includes(link.mode) ? null : link.maxTurns}
          message={event?.message}
          onOpen={open}
          draft={draft}
          draftCount={drafts.length}
        />
      )}
    </>
  );
}
