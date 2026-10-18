import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_BOARD, deserializeBoard, serializeBoard } from '../lib/workspace.js';

const SAVE_DELAY = 500; // ms après le dernier changement (PLAN.md §3.4)

function nextName(boards) {
  const names = new Set(boards.map((b) => b.name));
  let n = boards.length + 1;
  while (names.has(`Tableau ${n}`)) n++;
  return `Tableau ${n}`;
}

// Tableaux (pages) et sauvegarde de workspace.json.
// Le contenu de chaque tableau est gardé dans une ref : le tableau ouvert la met à jour à chaque
// changement sans faire re-rendre l'app, et on la relit quand on rouvre un tableau.
export default function useBoards(saved) {
  const content = useRef(null);
  if (!content.current) content.current = Object.fromEntries(saved.boards.map((b) => [b.id, deserializeBoard(b)]));

  const [boards, setBoards] = useState(() => saved.boards.map(({ id, name }) => ({ id, name })));
  const [activeId, setActiveId] = useState(saved.activeBoardId);
  const latest = useRef({ boards, activeId });
  latest.current = { boards, activeId };
  const saveTimer = useRef(null);

  const snapshot = () => ({
    activeBoardId: latest.current.activeId,
    boards: latest.current.boards.map((b) => ({ ...b, ...serializeBoard(content.current[b.id]) })),
  });

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => window.workspace.set(snapshot()), SAVE_DELAY);
  }, []);

  useEffect(scheduleSave, [boards, activeId, scheduleSave]);

  // Fermeture de la fenêtre : sauvegarde immédiate, une sauvegarde asynchrone n'aurait pas le temps de finir.
  useEffect(() => {
    const onUnload = () => window.workspace.saveSync(snapshot());
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const updateContent = useCallback(
    (id, state) => {
      content.current[id] = state;
      scheduleSave();
    },
    [scheduleSave],
  );

  const createBoard = () => {
    const id = 'board-' + crypto.randomUUID();
    content.current[id] = EMPTY_BOARD;
    setBoards((list) => [...list, { id, name: nextName(list) }]);
    setActiveId(id);
    return id;
  };

  const renameBoard = (id, name) => setBoards((list) => list.map((b) => (b.id === id ? { ...b, name } : b)));

  const agentCount = (id) => content.current[id]?.nodes.filter((n) => n.type === 'terminal').length ?? 0;

  // Supprimer un tableau ferme ses agents (comme le bouton × de chaque case).
  const deleteBoard = (id) => {
    const index = boards.findIndex((b) => b.id === id);
    if (index === -1 || boards.length === 1) return;
    for (const node of content.current[id].nodes) {
      if (node.type === 'terminal') window.pty.kill(node.id);
    }
    delete content.current[id];
    const rest = boards.filter((b) => b.id !== id);
    setBoards(rest);
    if (activeId === id) setActiveId(rest[Math.min(index, rest.length - 1)].id);
  };

  return {
    boards,
    activeId,
    setActiveId,
    content: content.current,
    updateContent,
    createBoard,
    renameBoard,
    deleteBoard,
    agentCount,
  };
}
