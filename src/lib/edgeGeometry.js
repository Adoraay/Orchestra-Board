import { Position } from '@xyflow/react';

// Géométrie des liens flottants (PLAN.md §3.8), partagée par les liens et les liens fantômes du chef d'orchestre.
const ARROW = { length: 9, half: 5 };

// Milieu du côté demandé de la case.
export function sidePoint(node, side) {
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
export function pickSides(source, target) {
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
export function arrowPath(tip, side) {
  const d = { [Position.Left]: [1, 0], [Position.Right]: [-1, 0], [Position.Top]: [0, 1], [Position.Bottom]: [0, -1] }[side];
  const bx = tip.x - d[0] * ARROW.length;
  const by = tip.y - d[1] * ARROW.length;
  const px = -d[1] * ARROW.half;
  const py = d[0] * ARROW.half;
  return `M ${bx + px} ${by + py} L ${tip.x} ${tip.y} L ${bx - px} ${by - py}`;
}
