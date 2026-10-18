import { ViewportPortal } from '@xyflow/react';

const RIGHT_BUTTON = 2;

// Trait lissé : on passe par le milieu de chaque segment, les points servent de points de contrôle.
function toPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`;
  }
  const [lx, ly] = points[points.length - 1];
  return d + ` L${lx},${ly}`;
}

// Dessins du stylo, rendus dans le repère de la map (ils suivent le pan et le zoom).
// Clic gauche (outil Sélection) = choisir un trait. Clic droit (Sélection ou Stylo) = le supprimer ;
// en gardant le bouton droit enfoncé, chaque trait survolé est supprimé (gomme).
export default function DrawingLayer({ strokes, draft, selectedId, selectable, erasable, onSelect, onDelete }) {
  return (
    <ViewportPortal>
      <svg className="drawing-layer">
        {strokes.map((stroke) => {
          const d = toPath(stroke.points);
          return (
            <g key={stroke.id} className={`stroke ${selectedId === stroke.id ? 'selected' : ''}`}>
              {/* Zone de clic plus large que le trait */}
              {(selectable || erasable) && (
                <path
                  className="stroke-hit nopan nodrag"
                  d={d}
                  onPointerDown={(e) => {
                    if (e.button === RIGHT_BUTTON) {
                      e.stopPropagation();
                      onDelete(stroke.id);
                    } else if (e.button === 0 && selectable) {
                      e.stopPropagation();
                      onSelect(stroke.id);
                    }
                    // Clic gauche avec le Stylo : on laisse passer, on peut dessiner par-dessus.
                  }}
                  onPointerEnter={(e) => {
                    if (erasable && e.buttons & RIGHT_BUTTON) onDelete(stroke.id);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                />
              )}
              <path className="stroke-line" d={d} />
            </g>
          );
        })}
        {draft && <path className="stroke-line" d={toPath(draft)} />}
      </svg>
    </ViewportPortal>
  );
}
