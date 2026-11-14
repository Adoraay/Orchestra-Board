import { BaseEdge, getBezierPath, useInternalNode } from '@xyflow/react';
import { arrowPath, pickSides, sidePoint } from '../lib/edgeGeometry.js';

// Lien proposé par le chef d'orchestre (aperçu) : pointillés qui défilent, même tracé qu'un lien réel.
export default function GhostEdge({ id, source, target }) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode?.measured?.width || !targetNode?.measured?.width) return null;
  const [sourceSide, targetSide] = pickSides(sourceNode, targetNode);
  const from = sidePoint(sourceNode, sourceSide);
  const to = sidePoint(targetNode, targetSide);
  const [path] = getBezierPath({ sourceX: from.x, sourceY: from.y, sourcePosition: sourceSide, targetX: to.x, targetY: to.y, targetPosition: targetSide });
  return (
    <>
      <BaseEdge id={id} path={path} className="ghost-edge" />
      <path d={arrowPath(to, targetSide)} className="react-flow__edge-path ghost-edge ghost-arrow" />
    </>
  );
}
