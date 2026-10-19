import { useEffect, useRef } from 'react';
import { TOOLS } from '../components/BoardToolbar.jsx';

// On ne touche pas aux touches tapées dans un terminal (textarea xterm), un champ ou une note.
function isTyping(target) {
  return target instanceof HTMLElement && (target.closest('input, textarea, select, [contenteditable="true"]') !== null);
}

// Raccourcis du tableau : V/P/N/T/L pour les outils, F = afficher toutes les cases, Échap = Sélection,
// Suppr = supprimer la sélection, Ctrl+Z = annuler, Ctrl+Y ou Ctrl+Maj+Z = rétablir.
export default function useBoardShortcuts({ onTool, onEscape, onDelete, onUndo, onRedo, onFitView }) {
  const handlers = useRef({ onTool, onEscape, onDelete, onUndo, onRedo, onFitView });
  handlers.current = { onTool, onEscape, onDelete, onUndo, onRedo, onFitView };

  useEffect(() => {
    const onKeyDown = (event) => {
      // Dans un champ ou un terminal, Ctrl+Z garde son sens habituel.
      if (isTyping(event.target) || document.querySelector('.modal-backdrop')) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === 'z' && !event.shiftKey) handlers.current.onUndo();
        else if (key === 'y' || (key === 'z' && event.shiftKey)) handlers.current.onRedo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Escape') return handlers.current.onEscape();
      if (event.key === 'Delete' || event.key === 'Backspace') return handlers.current.onDelete();
      if (key === 'f' && !event.shiftKey) return handlers.current.onFitView();

      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool) handlers.current.onTool(tool.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
