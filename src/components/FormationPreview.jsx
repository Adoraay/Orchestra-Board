import { ViewportPortal } from '@xyflow/react';
import { arrangeNodes, nodeSize } from '../lib/layout.js';

// Contours en pointillés de la future position des cases, affichés au survol d'une formation.
export default function FormationPreview({ nodes, formation }) {
  const arranged = arrangeNodes(nodes, formation);
  return <ViewportPortal>{arranged.filter((node) => node.selected).map((node) => {
    const { width, height } = nodeSize(node);
    return <div key={node.id} className="formation-ghost" style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)`, width, height }} />;
  })}</ViewportPortal>;
}
