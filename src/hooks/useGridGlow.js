import { useEffect } from 'react';

// Points de la grille qui s'allument autour de la souris : la position et le rayon sont posés en variables
// CSS sur la map (lues par le masque de .grid-glow), sans rendu React à chaque mouvement.
export default function useGridGlow(ref, enabled, size) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.style.setProperty('--glow-size', `${size}px`);
    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--glow-x', `${event.clientX - rect.left}px`);
      el.style.setProperty('--glow-y', `${event.clientY - rect.top}px`);
    };
    const onLeave = () => el.style.setProperty('--glow-x', '-9999px');
    onLeave();
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, enabled, size]);
}
