import { useEffect, useRef } from 'react';

const AUTO_CLOSE_DELAY = 3000; // ms après un clic en dehors

// Panneau ouvert : il le reste tant qu'on ne clique pas ailleurs. Un clic ailleurs le ferme 3 s plus tard,
// sauf si on reclique dedans entre-temps.
export default function useAutoClose(ref, open, onClose) {
  const timer = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (ref.current?.contains(event.target)) {
        clearTimeout(timer.current);
        timer.current = null;
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          closeRef.current();
        }, AUTO_CLOSE_DELAY);
      }
    };
    // En capture : xterm et la map arrêtent certains clics avant qu'ils remontent au document.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      clearTimeout(timer.current);
      timer.current = null;
    };
  }, [ref, open]);
}
