import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';

const MIN_STEP = 2; // px à l'écran entre deux points enregistrés

// Dessin à main levée : les points sont en coordonnées de la map, le trait suit donc le pan et le zoom.
export default function usePenDrawing({ enabled, onStroke }) {
  const { screenToFlowPosition, getZoom } = useReactFlow();
  const [draft, setDraft] = useState(null); // trait en cours : [[x, y], ...]
  const points = useRef(null);

  const toFlow = (event) => {
    const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  };

  const onPointerDown = (event) => {
    // Seulement sur le fond de la map (pas sur la barre d'outils, la minimap, les boutons de zoom).
    if (!enabled || event.button !== 0 || !event.target.closest('.react-flow__pane')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    points.current = [toFlow(event)];
    setDraft(points.current);
  };

  const onPointerMove = (event) => {
    if (!points.current) return;
    const point = toFlow(event);
    const last = points.current[points.current.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) * getZoom() < MIN_STEP) return;
    points.current = [...points.current, point];
    setDraft(points.current);
  };

  const onPointerUp = () => {
    if (!points.current) return;
    if (points.current.length > 1) onStroke({ id: crypto.randomUUID(), points: points.current });
    points.current = null;
    setDraft(null);
  };

  return { draft, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}
