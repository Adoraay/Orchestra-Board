import { useEffect, useReducer } from 'react';
import { BaseEdge, Position, getBezierPath, useInternalNode, useReactFlow } from '@xyflow/react';
import LinkLabel from './LinkLabel.jsx';
import { useBoard } from '../context/BoardContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { DEFAULT_LINK } from '../lib/links.js';

const PULSE_DURATION = 1200; // ms : un point lumineux parcourt le lien à chaque transmission
const SENDING_FOR = 2000; // ms pendant lesquels le lien reste « en cours de transfert » après un envoi
const LABEL_ROOM = { horizontal: 320, vertical: 90 }; // écart minimal entre les cases pour l'étiquette
const ARROW = { length: 9, half: 5 };

// Milieu du côté demandé de la case.
function sidePoint(node, side) {
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured.width;
  const h = node.measured.height;
  switch (side) {
    case Position.Top: return { x: x + w / 2, y };
    case Position.Bottom: return { x: x + w / 2, y: y + h };
    case Position.Left: return { x, y: y + h / 2 };
    default: return { x: x + w, y: y + h / 2 };
  }
}

// Côtés à relier selon la position des deux cases : côte à côte = gauche/droite,
// l'une au-dessus de l'autre = haut/bas. Recalculé à chaque déplacement.
function pickSides(source, target) {
  const center = (n) => ({
    x: n.internals.positionAbsolute.x + n.measured.width / 2,
    y: n.internals.positionAbsolute.y + n.measured.height / 2,
  });
  const s = center(source);
  const t = center(target);
  const dx = t.x - s.x;
  const dy = t.y - s.y;

  // On compare en tenant compte de la forme des cases (plus larges que hautes).
  const horizontal = Math.abs(dx) / (source.measured.width + target.measured.width) >
    Math.abs(dy) / (source.measured.height + target.measured.height);

  if (horizontal) return dx > 0 ? [Position.Right, Position.Left] : [Position.Left, Position.Right];
  return dy > 0 ? [Position.Bottom, Position.Top] : [Position.Top, Position.Bottom];
}

// Pointe de flèche qui entre dans la case cible par le côté choisi.
function arrowPath(tip, side) {
  const d = { [Position.Left]: [1, 0], [Position.Right]: [-1, 0], [Position.Top]: [0, 1], [Position.Bottom]: [0, -1] }[side];
  const bx = tip.x - d[0] * ARROW.length;
  const by = tip.y - d[1] * ARROW.length;
  const px = -d[1] * ARROW.half;
  const py = d[0] * ARROW.half;
  return `M ${bx + px} ${by + py} L ${tip.x} ${tip.y} L ${bx - px} ${by - py}`;
}

// État affiché : réglages du lien d'abord (pause, Transmission sans consigne), puis dernier événement.
// Au repos, une Délégation est « delegate », une Transmission configurée est « ready ».
function linkState(link, event) {
  if (!link.enabled) return 'disabled';
  if (link.mode === 'relay' && !link.prompt.trim()) return 'unconfigured';
  const rest = link.mode === 'delegate' ? 'delegate' : 'ready';
  if (event?.state === 'sent') return Date.now() - event.at < SENDING_FOR ? 'sending' : rest;
  if (event?.state === 'queued' || event?.state === 'limit' || event?.state === 'error') return event.state;
  return rest;
}

// Lien qui part du côté de A le plus proche de B (PLAN.md §3.8), coloré selon son état (§3.5).
export default function FloatingEdge({ id, source, target, data, style }) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const event = useBoard().linkEvents[id];
  const { agentById } = useSettings();
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
  const state = linkState(link, event);
  const pulsing = event?.state === 'sent' && Date.now() - event.at < PULSE_DURATION;
  const horizontal = sourceSide === Position.Left || sourceSide === Position.Right;
  const roomy = horizontal ? Math.abs(to.x - from.x) >= LABEL_ROOM.horizontal : Math.abs(to.y - from.y) >= LABEL_ROOM.vertical;
  const turns = event && typeof event.turns === 'number' ? event.turns : 0;
  // Dans un lien à double sens, le message peut aller vers la source : event.to dit vers qui.
  const toNode = event?.to === source ? sourceNode : targetNode;
  const targetName = toNode.data?.label || agentById(toNode.data?.agentId).name;

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
          maxTurns={link.maxTurns}
          message={event?.message}
          onOpen={open}
        />
      )}
    </>
  );
}
