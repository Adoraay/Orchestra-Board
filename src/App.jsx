import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import AgentDock from './components/AgentDock.jsx';
import DropPreview from './components/DropPreview.jsx';
import ExplorerPanel from './components/ExplorerPanel.jsx';
import TerminalNode from './components/TerminalNode.jsx';
import TopBar from './components/TopBar.jsx';
import { agentById } from './agents.js';

const nodeTypes = { terminal: TerminalNode };
const NODE_SIZE = { width: 640, height: 400 };

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { screenToFlowPosition } = useReactFlow();

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
      if (!agentById(agentId)) return;

      const center = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((nds) =>
        nds.concat({
          id: crypto.randomUUID(),
          type: 'terminal',
          position: { x: center.x - NODE_SIZE.width / 2, y: center.y - NODE_SIZE.height / 2 },
          dragHandle: '.drag-handle',
          style: { ...NODE_SIZE },
          data: { agentId },
        }),
      );
    },
    [draggedAgentId, endDrag, screenToFlowPosition, setNodes],
  );

  // Les liens existent déjà visuellement. Étape suivante : leur donner un sens
  // (quand A a fini, envoyer sa réponse à B). Voir PLAN.md §3.5.
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  return (
    <div className="app">
      <TopBar activeFolder={null} />
      <div className="workspace">
        <AgentDock draggedAgentId={draggedAgentId} onDragStart={setDraggedAgentId} onDragEnd={endDrag} />
        <main className="board" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            minZoom={0.1}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background gap={24} />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable />
          </ReactFlow>
          {previewPos && draggedAgentId && (
            <DropPreview agent={agentById(draggedAgentId)} position={previewPos} size={NODE_SIZE} />
          )}
        </main>
        <ExplorerPanel />
      </div>
    </div>
  );
}
