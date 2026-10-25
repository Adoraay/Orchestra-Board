import { useEffect, useRef } from 'react';
import { hasModifier } from '../lib/platform.js';

// Raccourcis valables partout, même le curseur dans un terminal (src/lib/shortcuts.js, groupe « Partout »).
// Écoutés en capture : le terminal ne les reçoit pas. Une fenêtre de choix ouverte (quitter, reprendre)
// les bloque, sauf Ctrl+, qui ouvre et ferme les paramètres.
export default function useAppShortcuts(actions) {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    const onKeyDown = (event) => {
      // Cmd sur Mac, Ctrl ailleurs ; Ctrl+Tab partout (Cmd+Tab appartient à macOS).
      const tab = event.key === 'Tab' && event.ctrlKey && !event.metaKey;
      if ((!hasModifier(event) && !tab) || event.altKey) return;
      const a = latest.current;
      const key = event.key.toLowerCase();
      if (document.querySelector('.team-modal, .inbox-modal')) return;
      const run = (fn) => {
        event.preventDefault();
        event.stopPropagation();
        fn();
      };

      if (tab) {
        if (!document.querySelector('.dialog')) run(() => a.cycleBoard(event.shiftKey ? -1 : 1));
        return;
      }
      if (key === ',' && !event.shiftKey) return run(a.toggleSettings);
      if (document.querySelector('.dialog')) return;

      // Touche physique : en AZERTY, la touche 1 sans Maj donne « & », pas « 1 ».
      const digit = event.code.match(/^(?:Digit|Numpad)([1-9])$/)?.[1];
      if (!event.shiftKey && digit) return run(() => a.goToBoard(Number(digit)));
      if (!event.shiftKey) return;
      if (key === 't') return run(a.createBoard);
      if (key === 'e') return run(a.toggleExplorer);
      if (key === 'a') return run(a.toggleAgentsBar);
      if (key === 'u') return run(a.toggleUsage);
      if (key === 'j') return run(a.toggleLog);
      if (event.code === 'KeyF') return run(a.toggleSearch);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
