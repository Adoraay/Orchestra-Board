import { useEffect, useLayoutEffect, useState } from 'react';

const MARGIN = 8; // px : le menu reste dans la fenêtre
// Clic à deux doigts sur un trackpad (Mac surtout) : il s'accompagne de petits événements de molette, qui ne
// doivent pas refermer le menu qu'il vient d'ouvrir.
const WHEEL_GRACE = 400; // ms après l'ouverture

// Menu de clic droit posé en (x, y) : gardé dans la fenêtre, fermé par Échap, un clic ou la molette ailleurs
// (la molette dans un long sous-menu le fait défiler), ou quand la fenêtre perd le focus.
export default function useFloatingMenu(ref, x, y, onClose) {
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [ref, x, y]);

  useEffect(() => {
    const openedAt = performance.now();
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const onWheel = (event) => {
      if (performance.now() - openedAt > WHEEL_GRACE) onPointerDown(event);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('wheel', onWheel, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [ref, onClose]);

  return position;
}
