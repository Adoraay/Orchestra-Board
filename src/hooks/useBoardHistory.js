import { useEffect, useMemo, useRef } from 'react';

const SETTLE_DELAY = 400; // ms sans changement = une étape (une saisie, un trait, un déplacement…)
const LIMIT = 100;
const ANNOTATIONS = new Set(['note', 'text']);

// Ce qui peut être annulé : dessins, post-it, textes et liens. Pas les cases terminal :
// on ne peut pas « dé-fermer » un agent dont le processus a été tué.
function snapshotOf(nodes, edges, strokes) {
  return {
    annotations: nodes
      .filter((n) => ANNOTATIONS.has(n.type))
      .map(({ id, type, position, width, height, style, data }) => ({ id, type, position, width, height, style, data })),
    edges: edges.map(({ id, source, target, type, animated }) => ({ id, source, target, type, animated })),
    strokes,
  };
}

// Historique Ctrl+Z / Ctrl+Y : une photo est prise quand l'état reste stable SETTLE_DELAY ms.
export default function useBoardHistory({ nodes, edges, strokes, setNodes, setEdges, setStrokes }) {
  const present = useRef(null);
  const past = useRef([]);
  const future = useRef([]);
  const pending = useRef(null); // { entry, timer }
  const adoptNext = useRef(false); // l'état qui suit une restauration devient la référence, sans nouvelle étape
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const current = useMemo(() => {
    const snapshot = snapshotOf(nodes, edges, strokes);
    return { snapshot, key: JSON.stringify(snapshot) };
  }, [nodes, edges, strokes]);

  const commit = (entry) => {
    if (present.current) past.current = [...past.current, present.current].slice(-LIMIT);
    present.current = entry;
    future.current = [];
  };

  const cancelPending = () => {
    clearTimeout(pending.current?.timer);
    pending.current = null;
  };

  useEffect(() => {
    if (!present.current || adoptNext.current) {
      adoptNext.current = false;
      present.current = current;
      return;
    }
    cancelPending();
    if (current.key === present.current.key) return;
    pending.current = {
      entry: current,
      timer: setTimeout(() => {
        commit(current);
        pending.current = null;
      }, SETTLE_DELAY),
    };
  }, [current]);

  useEffect(() => cancelPending, []);

  // Une action pas encore « posée » compte quand même : on l'enregistre avant d'annuler.
  const flush = () => {
    if (!pending.current) return;
    const { entry } = pending.current;
    cancelPending();
    commit(entry);
  };

  const restore = (entry) => {
    adoptNext.current = true;
    present.current = entry;
    const { annotations, edges: savedEdges, strokes: savedStrokes } = entry.snapshot;
    const terminals = nodesRef.current.filter((n) => !ANNOTATIONS.has(n.type));
    const ids = new Set(terminals.map((n) => n.id));
    setStrokes(savedStrokes);
    setNodes([...terminals, ...annotations]);
    setEdges(savedEdges.filter((e) => ids.has(e.source) && ids.has(e.target))); // case fermée entre-temps
  };

  const undo = () => {
    flush();
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(present.current);
    restore(previous);
  };

  const redo = () => {
    flush();
    const next = future.current.pop();
    if (!next) return;
    past.current.push(present.current);
    restore(next);
  };

  return { undo, redo };
}
