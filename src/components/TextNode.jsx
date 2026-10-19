import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { RotateCw, Trash2 } from 'lucide-react';
import useEditableText from '../hooks/useEditableText.js';
import useT from '../hooks/useT.js';

const DEFAULT_SIZE = 18;
const MIN_SIZE = 8;
const MAX_SIZE = 160;
const SNAP_ANGLE = 45; // l'angle s'aimante sur 0°, 45°, 90°…
const SNAP_TOLERANCE = 4;
const SHIFT_STEP = 15; // Maj enfoncée : pas de 15°

const angleOf = (p, c) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
const normalize = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

function snap(deg, shift) {
  if (shift) return Math.round(deg / SHIFT_STEP) * SHIFT_STEP;
  const nearest = Math.round(deg / SNAP_ANGLE) * SNAP_ANGLE;
  return Math.abs(deg - nearest) <= SNAP_TOLERANCE ? nearest : Math.round(deg);
}

// Suit la souris pendant un glisser sur une poignée (rotation, taille).
function trackPointer(event, onMove, onEnd) {
  event.stopPropagation();
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  const stop = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', stop);
    handle.removeEventListener('pointercancel', stop);
    onEnd?.();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

// Texte libre sur la map (PLAN.md §3.8) : sans fond, double-clic pour modifier, supprimé s'il est vidé.
// Choisi : flèche au-dessus pour l'angle, carré au coin pour la taille, corbeille en dessous.
export default function TextNode({ id, data, selected }) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const t = useT();
  const boxRef = useRef(null);
  const [rotating, setRotating] = useState(false);
  const fontSize = data.fontSize ?? DEFAULT_SIZE;
  const rotation = data.rotation ?? 0;

  const remove = () => deleteElements({ nodes: [{ id }] });
  const { editing, startEditing, inputProps } = useEditableText(id, data, {
    onFinish: (text) => {
      if (!text.trim()) remove();
    },
  });

  // Centre du texte à l'écran : le centre de la boîte englobante ne bouge pas quand on tourne.
  const center = () => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const startRotate = (event) => {
    const c = center();
    const startPointer = angleOf({ x: event.clientX, y: event.clientY }, c);
    setRotating(true);
    trackPointer(
      event,
      (e) => {
        const angle = normalize(rotation + angleOf({ x: e.clientX, y: e.clientY }, c) - startPointer);
        updateNodeData(id, { rotation: snap(angle, e.shiftKey) });
      },
      () => setRotating(false),
    );
  };

  // La taille suit la distance au centre : on tire vers l'extérieur pour agrandir.
  const startResize = (event) => {
    const c = center();
    const startDist = Math.hypot(event.clientX - c.x, event.clientY - c.y) || 1;
    trackPointer(event, (e) => {
      const scale = Math.hypot(e.clientX - c.x, e.clientY - c.y) / startDist;
      const size = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, fontSize * scale)));
      updateNodeData(id, { fontSize: size });
    });
  };

  const showControls = selected && !editing;

  return (
    <div className="text-node nopan" onDoubleClick={startEditing}>
      <div
        ref={boxRef}
        className={`text-box ${selected ? 'selected' : ''}`}
        style={{ fontSize, transform: rotation ? `rotate(${rotation}deg)` : undefined }}
      >
        {editing ? (
          <textarea className="text-input-free nodrag nowheel" placeholder={t('text.placeholder')} rows={1} {...inputProps} />
        ) : (
          <div className="text-content">{data.text}</div>
        )}

        {showControls && (
          // Un double-clic sur une poignée ne doit pas ouvrir la modification du texte.
          <span className="text-controls" onDoubleClick={(e) => e.stopPropagation()}>
            <button className="text-control rotate nodrag nopan" title={t('text.rotate')} onPointerDown={startRotate}>
              <RotateCw size={13} />
              {rotating && <span className="angle-label">{rotation}°</span>}
            </button>
            <span className="text-control resize nodrag nopan" title={t('text.size')} onPointerDown={startResize} />
            <button
              className="text-control trash nodrag nopan"
              title={t('common.delete')}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={remove}
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
