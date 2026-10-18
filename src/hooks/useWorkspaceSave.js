import { useEffect, useRef } from 'react';
import { serializeWorkspace } from '../lib/workspace.js';

const SAVE_DELAY = 500; // ms après le dernier changement (PLAN.md §3.4)

// Sauvegarde la map dans workspace.json : avec un délai pendant l'utilisation, tout de suite à la fermeture.
export default function useWorkspaceSave(state) {
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const timer = setTimeout(() => window.workspace.set(serializeWorkspace(latest.current)), SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [state.nodes, state.edges, state.strokes, state.viewport]);

  useEffect(() => {
    const onUnload = () => window.workspace.saveSync(serializeWorkspace(latest.current));
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
}
