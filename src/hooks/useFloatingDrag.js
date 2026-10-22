import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MAX_TILT = 2; // degrés
const TILT_PER_PX = 0.25;
const STILL_DELAY = 90; // ms sans mouvement avant de revenir à plat
const SMOOTHING = 0.25; // part du nouveau mouvement dans l'inclinaison : un geste rapide ne la fait pas osciller
const MIN_CHANGE = 0.05; // degrés : en dessous, on ne réécrit pas le style

// Effet « soulever, flotter, se fixer » d'une case (PLAN.md §4.4).
// Seuls transform et l'ombre sont animés : la taille réelle ne change pas, le terminal ne se refit pas.
export default function useFloatingDrag(dragging, x) {
  const ref = useRef(null);
  const lastX = useRef(x);
  const tilt = useRef(0);
  const stillTimer = useRef(null);
  const wasDragging = useRef(false);
  const [anim, setAnim] = useState('appear');

  // Inclinaison dans le sens du mouvement, lissée d'une image à l'autre et écrite directement dans le style
  // (pas de re-rendu). Sans lissage, un déplacement rapide la faisait basculer d'un côté à l'autre (scintillement).
  useLayoutEffect(() => {
    const dx = x - lastX.current;
    lastX.current = x;
    const el = ref.current;
    if (!el || !dragging || dx === 0) return;

    const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx * TILT_PER_PX));
    const next = tilt.current + (target - tilt.current) * SMOOTHING;
    if (Math.abs(next - tilt.current) >= MIN_CHANGE) {
      tilt.current = next;
      el.style.setProperty('--tilt', `${next.toFixed(2)}deg`);
    }
    clearTimeout(stillTimer.current);
    stillTimer.current = setTimeout(() => {
      tilt.current = 0;
      el.style.setProperty('--tilt', '0deg');
    }, STILL_DELAY);
  }, [x, dragging]);

  useEffect(() => {
    if (dragging) {
      wasDragging.current = true;
      setAnim(null);
    } else if (wasDragging.current) {
      wasDragging.current = false;
      clearTimeout(stillTimer.current);
      tilt.current = 0;
      ref.current?.style.setProperty('--tilt', '0deg');
      setAnim('settle');
    }
  }, [dragging]);

  useEffect(() => () => clearTimeout(stillTimer.current), []);

  const onAnimationEnd = (event) => {
    if (event.target === ref.current) setAnim(null);
  };

  return { ref, animClass: anim ?? '', onAnimationEnd };
}
