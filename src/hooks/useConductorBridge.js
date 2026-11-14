import { useCallback, useEffect, useMemo, useRef } from 'react';
import { arrangeShape, autoPlace, besideGroup, placeAgent } from '../lib/autoPlace.js';
import { NODE_SIZE, NOTE_SIZE } from './useBoardOps.js';

const COMMIT_WAIT = 300; // ms : un changement sans effet sur la map (lien en double…) ne bloque pas la réponse
const DRAW_DURATION = 1200; // ms : un lien créé se trace (classe edge-draw, jamais sauvegardée)
// Map vide : les cases du chef d'orchestre partent de ce point (le même pour l'aperçu et la validation).
export const PLAN_ORIGIN = { x: 0, y: 0 };

// Chef d'orchestre (PLAN.md §3.25), côté app : Node demande un changement pour un tableau précis.
// Le tableau ouvert l'applique ; sinon l'app ouvre ce tableau d'abord (ses agents ne se lancent que montés).
export function useConductorRouter(boards) {
  const slot = useRef(null); // { boardId, apply } du tableau monté
  const waiting = useRef([]); // demandes pour un tableau en cours d'ouverture
  const latest = useRef(boards);
  latest.current = boards;

  useEffect(
    () =>
      window.conductor.onOp((request) => {
        const { boards: list, activeId, setActiveId } = latest.current;
        if (!list.some((b) => b.id === request.boardId)) return window.conductor.done(request.reqId, { error: 'board' });
        if (slot.current?.boardId === request.boardId) return slot.current.apply(request);
        waiting.current.push(request);
        if (activeId !== request.boardId) setActiveId(request.boardId);
      }),
    [],
  );

  const register = useCallback((boardId, apply) => {
    slot.current = { boardId, apply };
    const mine = waiting.current.filter((r) => r.boardId === boardId);
    waiting.current = waiting.current.filter((r) => r.boardId !== boardId);
    mine.forEach(apply);
    return () => {
      if (slot.current?.apply === apply) slot.current = null;
    };
  }, []);

  const flushSave = useCallback(() => latest.current.flushSave(), []);
  return useMemo(() => ({ register, flushSave }), [register, flushSave]);
}

// Dans un tableau : applique les changements avec les opérations de l'utilisateur (useBoardOps), un à la fois,
// puis répond à Node une fois la map rendue et sauvegardée (le changement suivant voit le précédent).
// À appeler après l'effet qui remonte le contenu du tableau (onChange) : la sauvegarde lit ce contenu.
// reveal(ids, created) : la caméra montre les cases créées (et leur voisine) ; created = la case nouvelle.
export function useConductorOps({ boardId, bridge, ops, nodes, edges, getNodes, setNodes, setEdges, reveal }) {
  const waiters = useRef([]);
  useEffect(() => {
    const ready = waiters.current;
    waiters.current = [];
    ready.forEach((resolve) => resolve());
  }, [nodes, edges]);
  const rendered = () => new Promise((resolve) => {
    waiters.current.push(resolve);
    setTimeout(resolve, COMMIT_WAIT);
  });

  const latest = useRef({ ops, edges, getNodes, setNodes, setEdges, reveal });
  latest.current = { ops, edges, getNodes, setNodes, setEdges, reveal };
  // Agents placés sous chaque case (near) pendant cette session de la map : leur rangée reste centrée sous elle.
  const children = useRef(new Map());

  const run = async (op) => {
    const { ops: o, getNodes: get, setNodes: set } = latest.current;
    const all = get().filter((n) => n.type !== 'ghost'); // les fantômes de l'aperçu ne comptent pas
    const exists = (id) => all.some((n) => n.id === id);
    const place = (size) => {
      const at = autoPlace(all, size, { near: op.near, origin: PLAN_ORIGIN });
      return { x: at.x + size.width / 2, y: at.y + size.height / 2 };
    };
    switch (op.type) {
      case 'addAgent': {
        if (exists(op.id)) return { error: 'exists' };
        const data = { label: op.label, createdBy: 'conductor', ...(op.role && { role: op.role }), ...(op.branch && op.worktree && { branch: op.branch, worktree: op.worktree }) };
        // Sous une case qui a déjà des agents : la rangée entière est recentrée (un chef, deux agents = pyramide).
        const siblings = op.near ? (children.current.get(op.near) ?? []).filter(exists) : [];
        const { position, moved } = placeAgent(all, siblings, op.near, NODE_SIZE, PLAN_ORIGIN);
        if (moved.size) set((nds) => nds.map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id) } : n)));
        const center = { x: position.x + NODE_SIZE.width / 2, y: position.y + NODE_SIZE.height / 2 };
        const id = o.addTerminal({ id: op.id, agentId: op.agentId, cwd: op.cwd, center, data });
        if (op.near) children.current.set(op.near, [...siblings, id]);
        latest.current.reveal([id, op.near], id);
        return { id };
      }
      case 'addSticky': {
        const id = o.addAnnotation({ type: 'note', point: place(NOTE_SIZE), text: op.text, label: op.label, autoEdit: false, select: false });
        latest.current.reveal([id, op.near], id);
        return { id };
      }
      case 'updateSticky':
        if (!exists(op.id)) return { error: 'notFound' };
        set((nds) => nds.map((n) => (n.id === op.id ? { ...n, data: { ...n.data, text: op.text } } : n)));
        return {};
      case 'addLink': {
        const id = o.addLink(op.source, op.target, op.data);
        if (!id) return { error: 'impossible' };
        const draw = (className) => latest.current.setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, className } : e)));
        draw('edge-draw');
        setTimeout(() => draw(undefined), DRAW_DURATION);
        return { id };
      }
      case 'arrange': {
        const shape = arrangeShape(all, latest.current.edges, op.ids, op.layout, op.top);
        if (!shape.size) return { error: 'notFound' };
        const positions = new Map([...shape, ...besideGroup(all, shape, op.companions ?? [])]);
        set((nds) => nds.map((n) => (positions.has(n.id) ? { ...n, position: positions.get(n.id) } : n)));
        latest.current.reveal([...positions.keys()]);
        return {};
      }
      case 'updateLink':
        o.updateLink(op.id, op.patch);
        return {};
      case 'removeLink':
        o.removeLink(op.id);
        return {};
      case 'removeNode':
        if (!exists(op.id)) return { error: 'notFound' };
        o.removeElements({ nodeIds: [op.id] });
        return {};
      case 'setRole':
        await o.setRole(op.id, op.role);
        return {};
    }
    return { error: 'unknown' };
  };

  const queue = useRef(Promise.resolve());
  const apply = useCallback((request) => {
    queue.current = queue.current.then(async () => {
      let response;
      try {
        response = await run(request.op);
        if (!response.error) {
          await rendered();
          await bridge.flushSave();
        }
      } catch (error) {
        response = { error: error?.message || 'failed' };
      }
      window.conductor.done(request.reqId, response);
    });
  }, []);

  useEffect(() => bridge.register(boardId, apply), [bridge, boardId, apply]);
}
