import { useCallback, useEffect, useMemo, useState } from 'react';
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
import BoardToolbar from './components/BoardToolbar.jsx';
import DrawingLayer from './components/DrawingLayer.jsx';
import DropPreview from './components/DropPreview.jsx';
import ExplorerPanel from './components/ExplorerPanel.jsx';
import FloatingEdge from './components/FloatingEdge.jsx';
import NoteNode from './components/NoteNode.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import TerminalNode from './components/TerminalNode.jsx';
import TextNode from './components/TextNode.jsx';
import Toast from './components/Toast.jsx';
import TitleBar from './components/TitleBar.jsx';
import TopBar from './components/TopBar.jsx';
import { BoardContext } from './context/BoardContext.jsx';
import { useSettings } from './context/SettingsContext.jsx';
import { useWorkspace } from './context/WorkspaceContext.jsx';
import useBoardHistory from './hooks/useBoardHistory.js';
import useBoardShortcuts from './hooks/useBoardShortcuts.js';
import usePenDrawing from './hooks/usePenDrawing.js';
import useBoards from './hooks/useBoards.js';

const nodeTypes = { terminal: TerminalNode, note: NoteNode, text: TextNode };
const NOTE_SIZE = { width: 180, height: 180 };
const edgeTypes = { floating: FloatingEdge };
const BOARD_HINTS = {
  pen: 'LMB pour dessiner · RMB pour supprimer',
  note: 'Clique sur la map pour poser un post-it',
  text: 'Clique sur la map pour écrire un texte',
  link: 'Clique sur une case, puis sur une autre pour les relier',
};
const NODE_SIZE = { width: 640, height: 400 };
const GRID_VARIANTS = { dots: BackgroundVariant.Dots, lines: BackgroundVariant.Lines };

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

  return (
    <div className="app">
      <TitleBar />
      <TopBar boards={boards} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="workspace">
        {/* Un ReactFlowProvider par tableau : changer d'onglet repart d'un état React Flow neuf. */}
        <ReactFlowProvider key={activeId}>
          <Board initial={content[activeId]} onChange={onBoardChange} />
        </ReactFlowProvider>
        <ExplorerPanel />
      </div>
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
    </div>
  );
}

// Un tableau : dock des agents et map. Remonté à chaque changement d'onglet.
function Board({ initial, onChange }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [viewport, setViewport] = useState(initial.viewport);
  const { screenToFlowPosition } = useReactFlow();
  const { activeFolder, homeDir } = useWorkspace();
  const [toast, setToast] = useState(null);
  const { settings, agentById } = useSettings();
  const grid = settings.appearance.grid;

  // Barre d'outils (PLAN.md §3.8)
  const [tool, setTool] = useState('select');
  const [strokes, setStrokes] = useState(initial.strokes);
  const [selectedStroke, setSelectedStroke] = useState(null);
  const [linkSource, setLinkSource] = useState(null); // case cliquée en premier avec l'outil Lien
  const board = useMemo(() => ({ tool, linkSource }), [tool, linkSource]);
  const pen = usePenDrawing({ enabled: tool === 'pen', onStroke: (s) => setStrokes((all) => [...all, s]) });

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
      setEdges((eds) => addEdge({ source: linkSource, target: node.id, type: 'floating', animated: true }, eds));
      setLinkSource(null);
    },
    [tool, linkSource, setEdges],
  );

  const history = useBoardHistory({ nodes, edges, strokes, setNodes, setEdges, setStrokes });

  // Le contenu remonte à chaque changement : c'est ce qui est sauvegardé et relu quand on revient sur l'onglet.
  useEffect(() => {
    onChange({ nodes, edges, strokes, viewport });
  }, [nodes, edges, strokes, viewport, onChange]);

  // Suppr retire le trait ou les liens choisis. Les cases se ferment avec leur bouton ×.
  useBoardShortcuts({
    onTool: setTool,
    onUndo: history.undo,
    onRedo: history.redo,
    onEscape: () => {
      if (linkSource) return setLinkSource(null); // premier Échap : annule la source
      setTool('select');
      setSelectedStroke(null);
    },
    onDelete: () => {
      setStrokes((all) => all.filter((s) => s.id !== selectedStroke));
      setSelectedStroke(null);
      setEdges((eds) => eds.filter((e) => !e.selected));
      setNodes((nds) => nds.filter((n) => !(n.selected && n.type !== 'terminal')));
    },
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
  const [previewPos, setPreviewPos] = useState(null); // souris, relative à la map

  const endDrag = useCallback(() => {
    setDraggedAgentId(null);
    setPreviewPos(null);
  }, []);

  const onDragOver = useCallback(
    (event) => {
      if (!draggedAgentId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setPreviewPos((p) => (p && p.x === x && p.y === y ? p : { x, y }));
    },
    [draggedAgentId],
  );

  const onDragLeave = useCallback((event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPreviewPos(null);
  }, []);

  // Lâcher un agent du dock = créer un terminal centré sous la souris, là où était l'aperçu.
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const agentId = draggedAgentId;
      endDrag();
      if (!agentId || agentById(agentId).id !== agentId) return;

      // L'agent démarre dans le dossier actif, sinon dans le dossier personnel.
      const cwd = activeFolder ?? homeDir;
      if (!activeFolder) setToast({ id: Date.now(), text: 'Aucun dossier choisi, lancé dans ~' });

      const center = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((nds) =>
        nds.concat({
          id: crypto.randomUUID(),
          type: 'terminal',
          position: { x: center.x - NODE_SIZE.width / 2, y: center.y - NODE_SIZE.height / 2 },
          dragHandle: '.drag-handle',
          style: { ...NODE_SIZE },
          data: { agentId, cwd },
        }),
      );
    },
    [draggedAgentId, endDrag, screenToFlowPosition, setNodes, activeFolder, homeDir, agentById],
  );

  return (
    <>
      <AgentDock draggedAgentId={draggedAgentId} onDragStart={setDraggedAgentId} onDragEnd={endDrag} />
      <main
        className={`board tool-${tool}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        {...pen.handlers}
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
            colorMode="dark"
          >
            {GRID_VARIANTS[grid] && <Background variant={GRID_VARIANTS[grid]} gap={24} />}
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable />
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
        {BOARD_HINTS[tool] && (
          <div className="board-hint" role="status">
            {tool === 'link' && linkSource ? 'Clique sur la case à relier' : BOARD_HINTS[tool]}
            {tool === 'link' && <kbd>Échap</kbd>}
          </div>
        )}
        {previewPos && draggedAgentId && (
          <DropPreview agent={agentById(draggedAgentId)} position={previewPos} size={NODE_SIZE} />
        )}
        {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(null)} />}
      </main>
    </>
  );
}
