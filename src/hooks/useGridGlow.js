import { useEffect } from 'react';

// Points de la grille qui s'allument autour de la souris : la position et le rayon sont posés en variables
// CSS sur la couche .grid-glow elle-même (lues par son masque), une fois par image au plus, sans rendu React.
// Pas sur la map : une variable changée sur un parent fait recalculer le style de toutes les cases et de leurs
// terminaux à chaque mouvement, ce qui saccade le déplacement d'une case.
export default function useGridGlow(ref, enabled, size) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let frame = 0;
    let point = null;

    const paint = () => {
      frame = 0;
      const glow = el.querySelector('.grid-glow');
      if (!glow) return;
      glow.style.setProperty('--glow-size', `${size}px`);
      if (!point) return glow.style.setProperty('--glow-x', '-9999px');
      const rect = glow.getBoundingClientRect();
      glow.style.setProperty('--glow-x', `${point.x - rect.left}px`);
      glow.style.setProperty('--glow-y', `${point.y - rect.top}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onMove = (event) => {
      point = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = () => {
      point = null;
      schedule();
    };

    schedule();
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, enabled, size]);
}
