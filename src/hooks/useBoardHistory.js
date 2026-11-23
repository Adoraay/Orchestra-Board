import { useEffect, useMemo, useRef } from 'react';
import { ANNOTATIONS, restoreBoardHistory } from '../lib/boardHistory.js';

const SETTLE_DELAY = 400; // ms sans changement = une étape (une saisie, un trait, un déplacement…)
const LIMIT = 100;
const BATCH_LIMIT = 120000; // ms : une validation jamais terminée ne bloque pas l'historique

// Dessins, annotations, liens, groupes et positions : un terminal fermé n'est jamais recréé.
function snapshotOf(nodes, edges, strokes, groups) {
  return {
    annotations: nodes
      .filter((n) => ANNOTATIONS.has(n.type))
      .map(({ id, type, position, width, height, style, data, dragHandle }) => ({ id, type, position, width, height, style, data, dragHandle })),
    edges: edges.map(({ id, source, target, type, animated, data }) => ({ id, source, target, type, animated, data })),
    strokes,
    positions: nodes.filter((node) => node.type === 'terminal').map(({ id, position }) => ({ id, position })),
    groups,
  };
}

// Historique Ctrl+Z / Ctrl+Y : une photo est prise quand l'état reste stable SETTLE_DELAY ms.
// Validation d'un plan du chef d'orchestre (beginBatch / endBatch) : une seule étape, qui garde les terminaux
// qu'elle a créés (created) ; Ctrl+Z sur cette étape les retire et arrête leurs agents, Ctrl+Y ne les recrée pas.
export default function useBoardHistory({ nodes, edges, strokes, groups, setNodes, setEdges, setStrokes, setGroups }) {
  const present = useRef(null);
  const past = useRef([]);
  const future = useRef([]);
  const pending = useRef(null); // { entry, timer }
  const adoptNext = useRef(false); // l'état qui suit une restauration devient la référence, sans nouvelle étape
  const batching = useRef(null); // { timer } pendant une validation du chef d'orchestre
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const current = useMemo(() => {
    const snapshot = snapshotOf(nodes, edges, strokes, groups);
    const annotations = snapshot.annotations.map((node) => node.type === 'interactiveBrowser' ? { ...node, data: undefined } : node);
    return { snapshot, key: JSON.stringify({ ...snapshot, annotations }) };
  }, [nodes, edges, strokes, groups]);
  const currentRef = useRef(current);
  currentRef.current = current;

  const commit = (entry) => {
    if (present.current) past.current = [...past.current, present.current].slice(-LIMIT);
    present.current = entry;
    future.current = [];
  };

  // Même état rendu à nouveau : l'étape garde ses terminaux créés.
  const keepCreated = (entry) => (present.current?.created ? { ...entry, created: present.current.created } : entry);

  const cancelPending = () => {
    clearTimeout(pending.current?.timer);
    pending.current = null;
  };

  useEffect(() => {
    if (!present.current || adoptNext.current) {
      adoptNext.current = false;
      present.current = keepCreated(current);
      return;
    }
    if (batching.current) return;
    cancelPending();
    if (current.key === present.current.key) {
      present.current = keepCreated(current);
      return;
    }
    pending.current = {
      entry: current,
      timer: setTimeout(() => {
        commit(current);
        pending.current = null;
      }, SETTLE_DELAY),
    };
  }, [current]);

  useEffect(() => () => {
    cancelPending();
    clearTimeout(batching.current?.timer);
  }, []);

  // Une action pas encore « posée » compte quand même : on l'enregistre avant d'annuler.
  const flush = () => {
    if (!pending.current) return;
    const { entry } = pending.current;
    cancelPending();
    commit(entry);
  };

  // drop : terminaux retirés avec l'étape annulée (agents arrêtés).
  const restore = (entry, drop = []) => {
    adoptNext.current = true;
    present.current = entry;
    const removed = new Set(drop.filter((id) => nodesRef.current.some((n) => n.id === id && n.type === 'terminal')));
    removed.forEach((id) => window.pty.kill(id));
    const restored = restoreBoardHistory(nodesRef.current.filter((n) => !removed.has(n.id)), entry.snapshot);
    setStrokes(restored.strokes);
    setNodes(restored.nodes);
    setEdges(restored.edges);
    setGroups(restored.groups);
  };

  const undo = () => {
    if (batching.current) return;
    flush();
    const previous = past.current.pop();
    if (!previous) return;
    const leaving = present.current;
    future.current.push(leaving);
    restore(previous, leaving.created);
  };

  const redo = () => {
    if (batching.current) return;
    flush();
    const next = future.current.pop();
    if (!next) return;
    past.current.push(present.current);
    restore(next);
  };

  // Terminaux encore ouverts que le prochain Ctrl+Z retirerait (pour demander confirmation avant).
  const undoTerminals = () => {
    if (batching.current || pending.current || !past.current.length) return [];
    return (present.current?.created ?? []).filter((id) => nodesRef.current.some((n) => n.id === id));
  };

  const beginBatch = () => {
    if (batching.current) return;
    flush();
    batching.current = { timer: setTimeout(() => endBatch({}), BATCH_LIMIT) };
  };

  // rollback : validation défaite, l'état actuel redevient la référence sans nouvelle étape.
  const endBatch = ({ rollback = false, created = [] } = {}) => {
    if (!batching.current) return;
    clearTimeout(batching.current.timer);
    batching.current = null;
    const entry = currentRef.current;
    if (rollback || !present.current || entry.key === present.current.key) {
      present.current = entry;
      return;
    }
    commit(created.length ? { ...entry, created } : entry);
  };

  return { undo, redo, undoTerminals, beginBatch, endBatch };
}
