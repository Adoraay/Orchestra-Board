import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import AgentDock from './components/AgentDock.jsx';
import AgentsBar from './components/AgentsBar.jsx';
import BoardToolbar from './components/BoardToolbar.jsx';
import DeleteDialog from './components/DeleteDialog.jsx';
import DrawingLayer from './components/DrawingLayer.jsx';
import DropPreview from './components/DropPreview.jsx';
import ExplorerPanel from './components/ExplorerPanel.jsx';
import FloatingEdge from './components/FloatingEdge.jsx';
import LinkPanel from './components/LinkPanel.jsx';
import MiniMapNode from './components/MiniMapNode.jsx';
import NoteNode from './components/NoteNode.jsx';
import QuitDialog from './components/QuitDialog.jsx';
import ResumeDialog from './components/ResumeDialog.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import TerminalNode from './components/TerminalNode.jsx';
import UsagePanel from './components/UsagePanel.jsx';
import TextNode from './components/TextNode.jsx';
import Toast from './components/Toast.jsx';
import TopBar from './components/TopBar.jsx';
import { BoardContext } from './context/BoardContext.jsx';
import { useSettings } from './context/SettingsContext.jsx';
import { useWorkspace } from './context/WorkspaceContext.jsx';
import useBoardHistory from './hooks/useBoardHistory.js';
import useBoardShortcuts from './hooks/useBoardShortcuts.js';
import useBoxSelection from './hooks/useBoxSelection.js';
import usePenDrawing from './hooks/usePenDrawing.js';
import useAgentNotifications from './hooks/useAgentNotifications.js';
import useAppShortcuts from './hooks/useAppShortcuts.js';
import useBoards from './hooks/useBoards.js';
import useT from './hooks/useT.js';
import { DEFAULT_LINK } from './lib/links.js';

const nodeTypes = { terminal: TerminalNode, note: NoteNode, text: TextNode };
const NOTE_SIZE = { width: 180, height: 180 };
const edgeTypes = { floating: FloatingEdge };
const BOARD_HINTS = ['pen', 'note', 'text', 'link']; // outils avec un bandeau d'aide (board.hint.<outil>)
const NODE_SIZE = { width: 640, height: 400 };
const GRID_VARIANTS = { dots: BackgroundVariant.Dots, lines: BackgroundVariant.Lines };

// Nom par défaut d'une nouvelle case : « Claude Code 1 », « Claude Code 2 »… (plus petit numéro libre du tableau).
function numberedName(agentName, nodes) {
  const used = new Set(nodes.map((n) => n.data?.label));
  let n = 1;
  while (used.has(`${agentName} ${n}`)) n++;
  return `${agentName} ${n}`;
}

// Les tableaux sauvegardés sont chargés avant l'affichage : chaque map part de son état sauvegardé
// (et pas d'une étape que Ctrl+Z pourrait annuler).
export default function App() {
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    window.workspace.get().then(setSaved);
  }, []);

  return saved ? <Workspace saved={saved} /> : null;
}

// Barre du haut avec les onglets des tableaux, tableau ouvert, explorateur et paramètres.
function Workspace({ saved }) {
  const boards = useBoards(saved);
  const { activeId, content, updateContent } = boards;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const onBoardChange = useCallback((state) => updateContent(activeId, state), [activeId, updateContent]);
  const { boardsWithNews, running, focusRequest, focusAgent, clearFocus } = useAgentNotifications(boards);
  const [agentsBarOpen, setAgentsBarOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageAgent, setUsageAgent] = useState('claude-code');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [renameRequest, setRenameRequest] = useState(null); // tableau créé au clavier : on propose de le nommer
  const [launchRequest, setLaunchRequest] = useState(null); // « Lancer un agent ici » dans l'explorateur
  const clearLaunch = useCallback(() => setLaunchRequest(null), []);
  const { agentById } = useSettings();

  useAppShortcuts({
    toggleSettings: () => setSettingsOpen((o) => !o),
    cycleBoard: (step) => {
      const list = boards.boards;
      const index = list.findIndex((b) => b.id === activeId);
      boards.setActiveId(list[(index + step + list.length) % list.length].id);
    },
    goToBoard: (n) => {
      const list = boards.boards;
      const board = n === 9 ? list[list.length - 1] : list[n - 1];
      if (board) boards.setActiveId(board.id);
    },
    createBoard: () => setRenameRequest(boards.createBoard()),
    toggleExplorer: () => setExplorerOpen((o) => !o),
    toggleAgentsBar: () => setAgentsBarOpen((o) => !o),
    toggleUsage: () => setUsageOpen((o) => !o),
  });

  // Démarrage : une seule question pour reprendre (ou non) les conversations de tous les agents restaurés.
  // 'pending' = question affichée, 'resume' / 'new' = appliqué à chaque case restaurée (même dans un tableau
  // ouvert plus tard), 'manual' = chaque case demande elle-même.
  const [resumable] = useState(() =>
    boards.boards.flatMap((b) =>
      content[b.id].nodes
        .filter((n) => n.type === 'terminal' && n.data.restored && agentById(n.data.agentId).resumeArgs)
        .map((n) => ({ id: n.id, boardId: b.id, name: n.data.label || agentById(n.data.agentId).name, agent: agentById(n.data.agentId) })),
    ),
  );
  const [resumeChoice, setResumeChoice] = useState(resumable.length ? 'pending' : 'manual');

  // Fermeture de la fenêtre pendant que des agents travaillent : Node envoie la liste, on demande.
  const [quitAgents, setQuitAgents] = useState(null);
  useEffect(() => window.appWindow.onConfirmQuit(setQuitAgents), []);
  const closeQuit = useCallback(() => setQuitAgents(null), []);
  const quitList = quitAgents?.map((a) => {
    const board = boards.boards.find((b) => content[b.id]?.nodes.some((n) => n.id === a.id));
    const node = board && content[board.id].nodes.find((n) => n.id === a.id);
    return { ...a, agent: agentById(node?.data.agentId), boardName: boards.boards.length > 1 ? board?.name : null };
  });

  // Panneaux posés sur la map : leur état vit ici, car la map est recréée à chaque changement de tableau.
  const overlays = (
    <>
      <UsagePanel open={usageOpen} onToggle={() => setUsageOpen((o) => !o)} agentId={usageAgent} onSelectAgent={setUsageAgent} />
      <AgentsBar
        boards={boards.boards}
        content={content}
        activeId={activeId}
        running={running}
        open={agentsBarOpen}
        onToggle={() => setAgentsBarOpen((o) => !o)}
        onFocus={focusAgent}
      />
    </>
  );

  return (
    <div className="app">
      <TopBar
        boards={boards}
        boardsWithNews={boardsWithNews}
        renameRequest={renameRequest}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="workspace">
        {/* Un ReactFlowProvider par tableau : changer d'onglet repart d'un état React Flow neuf. */}
        <ReactFlowProvider key={activeId}>
          <Board
            initial={content[activeId]}
            onChange={onBoardChange}
            focusRequest={focusRequest}
            onFocusDone={clearFocus}
            overlays={overlays}
            resumeChoice={resumeChoice}
            running={running}
            launchRequest={launchRequest}
            onLaunchDone={clearLaunch}
          />
        </ReactFlowProvider>
        <ExplorerPanel
          open={explorerOpen}
          onToggle={() => setExplorerOpen((o) => !o)}
          onLaunchAgent={(agentId, cwd) => setLaunchRequest({ agentId, cwd, at: Date.now() })}
        />
      </div>
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
      {resumeChoice === 'pending' && (
        <ResumeDialog
          agents={resumable}
          boardCount={new Set(resumable.map((a) => a.boardId)).size}
          onChoose={setResumeChoice}
        />
      )}
      {quitList && <QuitDialog agents={quitList} onCancel={closeQuit} onQuit={() => window.appWindow.quit()} />}
    </div>
  );
}

// Un tableau : dock des agents et map. Remonté à chaque changement d'onglet.
function Board({ initial, onChange, focusRequest, onFocusDone, overlays, resumeChoice, running, launchRequest, onLaunchDone }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [viewport, setViewport] = useState(initial.viewport);
  const { screenToFlowPosition, fitView, deleteElements } = useReactFlow();

  // Clic sur une notification Windows ou dans la barre des agents : on centre la map sur la case et on la
  // choisit (après sa mesure si le tableau vient de s'ouvrir). Demande effacée une fois servie.
  useEffect(() => {
    if (!focusRequest) return;
    const timer = setTimeout(() => {
      fitView({ nodes: [{ id: focusRequest.id }], duration: 400, padding: 0.3, maxZoom: 1 });
      setNodes((nds) => nds.map((n) => (Boolean(n.selected) === (n.id === focusRequest.id) ? n : { ...n, selected: n.id === focusRequest.id })));
      onFocusDone();
    }, 120);
    return () => clearTimeout(timer);
  }, [focusRequest, fitView, setNodes, onFocusDone]);
  const { activeFolder, homeDir } = useWorkspace();
  const [toast, setToast] = useState(null);
  const { settings, agentById } = useSettings();
  const t = useT();
  const grid = settings.appearance.grid;

  // Barre d'outils (PLAN.md §3.8)
  const [tool, setTool] = useState('select');
  const [strokes, setStrokes] = useState(initial.strokes);
  const [selectedStroke, setSelectedStroke] = useState(null);
  const [linkSource, setLinkSource] = useState(null); // case cliquée en premier avec l'outil Lien
  const [branchTarget, setBranchTarget] = useState(null); // case survolée en glissant « Branche »
  const [branchPicker, setBranchPicker] = useState(null); // case dont la barre des branches est ouverte
  const [linkEvents, setLinkEvents] = useState({}); // id du lien -> dernier état de transmission
  const [renameRequest, setRenameRequest] = useState(null); // F2 : { id, at } de la case à renommer
  const board = useMemo(
    () => ({ tool, linkSource, branchTarget, branchPicker, setBranchPicker, linkEvents, resumeChoice, renameRequest }),
    [tool, linkSource, branchTarget, branchPicker, linkEvents, resumeChoice, renameRequest],
  );

  // F2 : renommer la case terminal choisie, ou celle dont le terminal a le curseur. En capture, pour que
  // le terminal ne reçoive pas la touche.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'F2' || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      const focused = document.activeElement;
      if (focused?.matches('input, textarea, [contenteditable="true"]') && !focused.closest('.xterm')) return;
      if (focused?.closest('.explorer')) return; // F2 de l'explorateur : renommer le dossier ou fichier
      const selected = nodesRef.current.filter((n) => n.selected && n.type === 'terminal');
      const id = focused?.closest('.react-flow__node-terminal')?.dataset.id ?? (selected.length === 1 ? selected[0].id : null);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      setRenameRequest({ id, at: Date.now() });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(
    () => window.links.onEvent((id, event) => setLinkEvents((all) => ({ ...all, [id]: { ...event, at: Date.now() } }))),
    [],
  );
  const pen = usePenDrawing({ enabled: tool === 'pen', onStroke: (s) => setStrokes((all) => [...all, s]) });

  // Rectangle de sélection au clic droit (outil Sélection) : les cases touchées deviennent la sélection.
  const boxSelection = useBoxSelection({
    enabled: tool === 'select',
    onSelect: (ids) => {
      const chosen = new Set(ids);
      setNodes((nds) => nds.map((n) => (Boolean(n.selected) === chosen.has(n.id) ? n : { ...n, selected: chosen.has(n.id) })));
      setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setSelectedStroke(null);
    },
  });
  // Le stylo (clic gauche) et le rectangle (clic droit) écoutent les mêmes événements de la map.
  const pointerHandlers = Object.fromEntries(
    ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel'].map((name) => [
      name,
      (event) => {
        pen.handlers[name](event);
        boxSelection.handlers[name](event);
      },
    ]),
  );

  // Un trait choisi désélectionne cases et liens (et inversement, via onNodeClick / onEdgeClick).
  const selectStroke = useCallback(
    (id) => {
      setSelectedStroke(id);
      setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
    },
    [setNodes, setEdges],
  );

  const deleteStroke = useCallback((id) => {
    setStrokes((all) => all.filter((s) => s.id !== id));
    setSelectedStroke((current) => (current === id ? null : current));
  }, []);

  // Outil Lien : les terminaux ne doivent plus recevoir le clavier.
  useEffect(() => {
    setLinkSource(null);
    if (tool === 'link' && document.activeElement?.closest('.terminal-node')) document.activeElement.blur();
  }, [tool]);

  // Outil Lien : clic sur A (source, qui s'illumine) puis clic sur B = lien A -> B.
  const onNodeClick = useCallback(
    (_event, node) => {
      setSelectedStroke(null);
      if (tool !== 'link' || node.type !== 'terminal') return;
      if (!linkSource || linkSource === node.id) {
        setLinkSource(linkSource ? null : node.id);
        return;
      }
      // Un agent relié à une case Terminal : lien Terminal, toujours de l'agent vers le terminal (PLAN.md §3.17).
      const isShell = (n) => n?.data.agentId === 'shell';
      const sourceNode = nodes.find((n) => n.id === linkSource);
      const terminal = isShell(sourceNode) !== isShell(node);
      const [source, target] = terminal && isShell(sourceNode) ? [node.id, linkSource] : [linkSource, node.id];
      const mode = terminal ? 'terminal' : settings.general.linkMode;
      setEdges((eds) => addEdge({ source, target, type: 'floating', data: { ...DEFAULT_LINK, mode } }, eds));
      setLinkSource(null);
    },
    [tool, linkSource, nodes, setEdges, settings.general.linkMode],
  );

  // Un seul lien choisi avec l'outil Sélection : son panneau de réglages s'ouvre (PLAN.md §3.5).
  const selectedEdges = edges.filter((e) => e.selected);
  const panelEdge = tool === 'select' && selectedEdges.length === 1 ? selectedEdges[0] : null;
  const updateLink = useCallback(
    (id, patch) =>
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== id) return e;
          return { ...e, data: { ...DEFAULT_LINK, ...e.data, ...patch } };
        }),
      ),
    [setEdges],
  );

  const history = useBoardHistory({ nodes, edges, strokes, setNodes, setEdges, setStrokes });

  // Le contenu remonte à chaque changement : c'est ce qui est sauvegardé et relu quand on revient sur l'onglet.
  useEffect(() => {
    onChange({ nodes, edges, strokes, viewport });
  }, [nodes, edges, strokes, viewport, onChange]);

  // Suppr : tout ce qui est choisi (cases terminal comprises), après confirmation.
  const [deleteRequest, setDeleteRequest] = useState(null);
  const requestDelete = () => {
    const chosen = nodes.filter((n) => n.selected);
    const terminals = chosen
      .filter((n) => n.type === 'terminal')
      .map((n) => ({ id: n.id, name: n.data.label || agentById(n.data.agentId).name, agent: agentById(n.data.agentId), status: running[n.id]?.status }));
    const selection = {
      terminals,
      links: selectedEdges.length,
      notes: chosen.filter((n) => n.type === 'note').length,
      texts: chosen.filter((n) => n.type === 'text').length,
      strokes: selectedStroke ? 1 : 0,
    };
    if (terminals.length || selection.links || selection.notes || selection.texts || selection.strokes) setDeleteRequest(selection);
  };
  const confirmDelete = () => {
    for (const t of deleteRequest.terminals) window.pty.kill(t.id);
    // deleteElements retire aussi les liens attachés aux cases supprimées.
    deleteElements({ nodes: nodes.filter((n) => n.selected), edges: selectedEdges });
    setStrokes((all) => all.filter((s) => s.id !== selectedStroke));
    setSelectedStroke(null);
    setDeleteRequest(null);
  };
  const cancelDelete = useCallback(() => setDeleteRequest(null), []);

  useBoardShortcuts({
    onTool: setTool,
    onFitView: () => fitView({ duration: 400, padding: 0.15, maxZoom: 1 }),
    onUndo: history.undo,
    onRedo: history.redo,
    onEscape: () => {
      if (linkSource) return setLinkSource(null); // premier Échap : annule la source
      setTool('select');
      setSelectedStroke(null);
    },
    onDelete: requestDelete,
  });

  // Outils Post-it et Texte : un clic sur la map pose l'élément, puis on repasse en Sélection.
  const onPaneClick = useCallback(
    (event) => {
      setSelectedStroke(null);
      setLinkSource(null);
      if (tool !== 'note' && tool !== 'text') return;

      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const note = tool === 'note';
      setNodes((nds) =>
        nds
          .map((n) => (n.selected ? { ...n, selected: false } : n))
          .concat({
            id: crypto.randomUUID(),
            type: tool,
            position: note ? { x: p.x - NOTE_SIZE.width / 2, y: p.y - NOTE_SIZE.height / 2 } : { x: p.x, y: p.y - 14 },
            style: note ? { ...NOTE_SIZE } : undefined,
            selected: true,
            data: { text: '', autoEdit: true },
          }),
      );
      setTool('select');
    },
    [tool, screenToFlowPosition, setNodes],
  );

  // getData n'est pas lisible pendant dragover : on garde l'agent glissé ici.
  const [draggedAgentId, setDraggedAgentId] = useState(null);
  const [draggingBranch, setDraggingBranch] = useState(false);
  const [previewPos, setPreviewPos] = useState(null); // souris, relative à la map

  const endDrag = useCallback(() => {
    setDraggedAgentId(null);
    setDraggingBranch(false);
    setBranchTarget(null);
    setPreviewPos(null);
  }, []);

  const onDragOver = useCallback(
    (event) => {
      // « Branche » se lâche seulement sur une case terminal : elle s'allume au survol.
      if (draggingBranch) {
        event.preventDefault();
        const target = event.target.closest?.('.react-flow__node-terminal')?.dataset.id ?? null;
        event.dataTransfer.dropEffect = target ? 'link' : 'none';
        setBranchTarget(target);
        return;
      }
      if (!draggedAgentId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setPreviewPos((p) => (p && p.x === x && p.y === y ? p : { x, y }));
    },
    [draggedAgentId, draggingBranch],
  );

  const onDragLeave = useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setPreviewPos(null);
    setBranchTarget(null);
  }, []);

  // « Branche » lâché sur une case : barre des branches si son dossier est un dépôt Git.
  const openBranchPicker = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      window.git.isRepo(node.data.worktree ?? node.data.cwd).then((result) => {
        if (result.error) setToast({ id: Date.now(), text: result.error });
        else setBranchPicker(nodeId);
      });
    },
    [nodes],
  );

  // Nouvelle case terminal centrée sur « center » (coordonnées de la map).
  const addTerminal = useCallback(
    (agentId, cwd, center) =>
      setNodes((nds) =>
        nds.concat({
          id: crypto.randomUUID(),
          type: 'terminal',
          position: { x: center.x - NODE_SIZE.width / 2, y: center.y - NODE_SIZE.height / 2 },
          dragHandle: '.drag-handle',
          style: { ...NODE_SIZE },
          data: { agentId, cwd, label: numberedName(agentById(agentId).name, nds) },
        }),
      ),
    [setNodes, agentById],
  );

  // « Lancer un agent ici » (clic droit dans l'explorateur) : nouvelle case au centre de la vue.
  const boardRef = useRef(null);
  useEffect(() => {
    if (!launchRequest || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    addTerminal(launchRequest.agentId, launchRequest.cwd, screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    onLaunchDone();
  }, [launchRequest, addTerminal, screenToFlowPosition, onLaunchDone]);

  // Lâcher un agent du dock = créer un terminal centré sous la souris, là où était l'aperçu.
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (draggingBranch) {
        const nodeId = branchTarget;
        endDrag();
        if (nodeId) openBranchPicker(nodeId);
        return;
      }
      const agentId = draggedAgentId;
      endDrag();
      if (!agentId || agentById(agentId).id !== agentId) return;

      // L'agent démarre dans le dossier actif, sinon dans le dossier personnel.
      const cwd = activeFolder ?? homeDir;
      if (!activeFolder) setToast({ id: Date.now(), text: t('board.noFolder') });

      addTerminal(agentId, cwd, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [draggedAgentId, draggingBranch, branchTarget, openBranchPicker, endDrag, screenToFlowPosition, addTerminal, activeFolder, homeDir, agentById, t],
  );

  return (
    <>
      <AgentDock
        draggedAgentId={draggedAgentId}
        draggingBranch={draggingBranch}
        onDragStart={setDraggedAgentId}
        onBranchDragStart={() => setDraggingBranch(true)}
        onDragEnd={endDrag}
      />
      <main
        ref={boardRef}
        className={`board tool-${tool}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        {...pointerHandlers}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BoardContext.Provider value={board}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            onEdgeClick={() => setSelectedStroke(null)}
            onEdgeContextMenu={(event, edge) => {
              // Outil Lien : clic droit sur un lien = le supprimer (comme les traits du stylo).
              event.preventDefault();
              if (tool === 'link') setEdges((eds) => eds.filter((e) => e.id !== edge.id));
            }}
            onMoveEnd={(_event, v) => setViewport(v)}
            defaultViewport={initial.viewport ?? undefined}
            nodesDraggable={tool === 'select'}
            nodesConnectable={false}
            elementsSelectable={tool === 'select'}
            panOnDrag={tool === 'pen' ? [1] : true}
            minZoom={0.1}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            proOptions={{ hideAttribution: true }}
            colorMode={settings.appearance.theme === 'light' ? 'light' : 'dark'}
          >
            {GRID_VARIANTS[grid] && <Background variant={GRID_VARIANTS[grid]} gap={24} />}
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable nodeComponent={MiniMapNode} />
            <DrawingLayer
              strokes={strokes}
              draft={pen.draft}
              selectedId={selectedStroke}
              selectable={tool === 'select'}
              erasable={tool === 'select' || tool === 'pen'}
              onSelect={selectStroke}
              onDelete={deleteStroke}
            />
          </ReactFlow>
        </BoardContext.Provider>
        <BoardToolbar tool={tool} onChange={setTool} />
        {BOARD_HINTS.includes(tool) && (
          <div className="board-hint" role="status">
            {tool === 'link' && linkSource ? t('board.hint.linkTarget') : t(`board.hint.${tool}`)}
            {tool === 'link' && <kbd>{t('key.Esc')}</kbd>}
          </div>
        )}
        {boxSelection.box && <div className="selection-box" style={boxSelection.box} />}
        {overlays}
        {panelEdge && (
          <LinkPanel
            key={panelEdge.id}
            edge={panelEdge}
            nodes={nodes}
            event={linkEvents[panelEdge.id]}
            onChange={(patch) => updateLink(panelEdge.id, patch)}
            onDelete={() => setEdges((eds) => eds.filter((e) => e.id !== panelEdge.id))}
            onSwap={() =>
              setEdges((eds) => eds.map((e) => (e.id === panelEdge.id ? { ...e, source: e.target, target: e.source } : e)))
            }
            onClose={() => setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)))}
          />
        )}
        {previewPos && draggedAgentId && (
          <DropPreview agent={agentById(draggedAgentId)} position={previewPos} size={NODE_SIZE} />
        )}
        {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(null)} />}
        {deleteRequest && <DeleteDialog selection={deleteRequest} onCancel={cancelDelete} onConfirm={confirmDelete} />}
      </main>
    </>
  );
}
