import { useEffect, useRef, useState } from 'react';

const CLICK_TOLERANCE = 3; // px : au-delà, c'est un glisser (déplacement), pas un clic

// Mode redimensionnement (PLAN.md §3.7) : activé par un vrai clic sur la barre de titre,
// fermé par Échap ou dès que la case n'est plus choisie (clic sur une autre case ou sur le vide).
export default function useResizeMode(selected) {
  const [resizing, setResizing] = useState(false);
  const downAt = useRef(null);

  useEffect(() => {
    if (!selected) setResizing(false);
  }, [selected]);

  useEffect(() => {
    if (!resizing) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setResizing(false);
    };
    // Phase de capture : xterm stoppe la propagation des touches qu'il traite.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [resizing]);

  const headerProps = {
    onPointerDown: (event) => {
      downAt.current = { x: event.clientX, y: event.clientY };
    },
    onClick: (event) => {
      const start = downAt.current;
      downAt.current = null;
      if (!start || event.target.closest('button')) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved < CLICK_TOLERANCE) setResizing(true);
    },
  };

  return { resizing, headerProps, stopResizing: () => setResizing(false) };
}
