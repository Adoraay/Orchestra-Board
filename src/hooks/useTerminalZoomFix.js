import { useEffect } from 'react';

const EVENTS = ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'];

// xterm place la souris avec clientX - rect.left (position à l'écran, donc zoomée par la map) divisé par la
// taille d'une cellule sans zoom : dès que la map n'est pas à 100 %, la sélection se décale sous la souris.
// En capture sur window (avant xterm, qui suit le glisser sur document), on ramène clientX / clientY à
// l'échelle 1 par rapport à l'écran du terminal, le temps de ces événements.
export default function useTerminalZoomFix(containerRef) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let dragging = false;

    const correct = (event) => {
      const screen = container.querySelector('.xterm-screen');
      if (!screen) return;
      if (event.type === 'mousedown') dragging = screen.contains(event.target);
      const inside = screen.contains(event.target);
      if (!inside && !dragging) return;
      if (event.type === 'mouseup') dragging = false;

      const rect = screen.getBoundingClientRect();
      const scale = screen.offsetWidth ? rect.width / screen.offsetWidth : 1;
      if (Math.abs(scale - 1) < 0.001) return;
      Object.defineProperty(event, 'clientX', { value: rect.left + (event.clientX - rect.left) / scale, configurable: true });
      Object.defineProperty(event, 'clientY', { value: rect.top + (event.clientY - rect.top) / scale, configurable: true });
    };

    for (const type of EVENTS) window.addEventListener(type, correct, true);
    return () => {
      for (const type of EVENTS) window.removeEventListener(type, correct, true);
    };
  }, [containerRef]);
}
