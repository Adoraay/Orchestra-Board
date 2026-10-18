import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';

const RIGHT_BUTTON = 2;
const MIN_SIZE = 3; // px : en dessous, c'est un simple clic droit

// Outil Sélection : clic droit maintenu sur le fond = rectangle de sélection (PLAN.md §3.7).
// Les cases touchées par le rectangle sont sélectionnées et se déplacent ensemble.
export default function useBoxSelection({ enabled, onSelect }) {
  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow();
  const [box, setBox] = useState(null); // { left, top, width, height } relatif à la map
  const start = useRef(null);

  const onPointerDown = (event) => {
    // Seulement sur le fond : un clic droit sur un trait le supprime (DrawingLayer).
    if (!enabled || event.button !== RIGHT_BUTTON || !event.target.closest('.react-flow__pane')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY, rect: event.currentTarget.getBoundingClientRect() };
  };

  const onPointerMove = (event) => {
    const s = start.current;
    if (!s) return;
    setBox({
      left: Math.min(s.x, event.clientX) - s.rect.left,
      top: Math.min(s.y, event.clientY) - s.rect.top,
      width: Math.abs(event.clientX - s.x),
      height: Math.abs(event.clientY - s.y),
    });
  };

  const onPointerUp = (event) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    setBox(null);
    if (Math.abs(event.clientX - s.x) < MIN_SIZE && Math.abs(event.clientY - s.y) < MIN_SIZE) return;

    const a = screenToFlowPosition({ x: Math.min(s.x, event.clientX), y: Math.min(s.y, event.clientY) });
    const b = screenToFlowPosition({ x: Math.max(s.x, event.clientX), y: Math.max(s.y, event.clientY) });
    const hits = getIntersectingNodes({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }, true);
    onSelect(hits.map((n) => n.id));
  };

  return { box, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}
