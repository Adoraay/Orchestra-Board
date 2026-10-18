import { useEffect, useRef } from 'react';
import { TOOLS } from '../components/BoardToolbar.jsx';

// On ne touche pas aux touches tapées dans un terminal (textarea xterm), un champ ou une note.
function isTyping(target) {
  return target instanceof HTMLElement && (target.closest('input, textarea, select, [contenteditable="true"]') !== null);
}

// Raccourcis du tableau : V/P/N/T/L pour les outils, Échap = Sélection, Suppr = supprimer la sélection.
export default function useBoardShortcuts({ onTool, onEscape, onDelete }) {
  const handlers = useRef({ onTool, onEscape, onDelete });
  handlers.current = { onTool, onEscape, onDelete };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('.modal-backdrop')) return; // paramètres ouverts

      if (event.key === 'Escape') return handlers.current.onEscape();
      if (event.key === 'Delete' || event.key === 'Backspace') return handlers.current.onDelete();

      const tool = TOOLS.find((t) => t.key.toLowerCase() === event.key.toLowerCase());
      if (tool) handlers.current.onTool(tool.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
