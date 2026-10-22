import { useRef, useState } from 'react';
import { MousePointer2 } from 'lucide-react';

// Aperçu de la map dans les paramètres : la grille choisie et, avec glow, l'effet autour de la souris (dessinée
// au centre, ou qui suit la vraie souris quand elle passe dessus). Mêmes variables que la map (.glow-preview-dots).
export default function MapPreview({ grid, glow = false, color, size }) {
  const ref = useRef(null);
  const [point, setPoint] = useState(null); // null = centre

  const onPointerMove = (event) => {
    const rect = ref.current.getBoundingClientRect();
    setPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  const x = point ? `${point.x}px` : '50%';
  const y = point ? `${point.y}px` : '50%';

  return (
    <div
      ref={ref}
      className={`map-preview grid-${grid} ${glow ? 'with-glow' : ''}`}
      style={glow ? { '--glow-x': x, '--glow-y': y, '--glow-size': `${size}px`, '--glow-color': color } : undefined}
      onPointerMove={glow ? onPointerMove : undefined}
      onPointerLeave={() => setPoint(null)}
      aria-hidden="true"
    >
      {glow && grid !== 'none' && <div className="glow-preview-dots" />}
      {glow && <MousePointer2 className="map-preview-cursor" size={18} style={{ left: x, top: y }} />}
    </div>
  );
}
