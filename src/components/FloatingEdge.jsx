import { BaseEdge, Position, getBezierPath, useInternalNode } from '@xyflow/react';

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

// Lien qui part du côté de A le plus proche de B (PLAN.md §3.8).
export default function FloatingEdge({ id, source, target, markerEnd, style }) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode?.measured?.width || !targetNode?.measured?.width) return null;

  const [sourceSide, targetSide] = pickSides(sourceNode, targetNode);
  const from = sidePoint(sourceNode, sourceSide);
  const to = sidePoint(targetNode, targetSide);
  const [path] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: sourceSide,
    targetX: to.x,
    targetY: to.y,
    targetPosition: targetSide,
  });

  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />;
}
