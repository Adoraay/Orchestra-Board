import { useCallback } from 'react';
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
import ExplorerPanel from './components/ExplorerPanel.jsx';
import TerminalNode from './components/TerminalNode.jsx';
import TopBar from './components/TopBar.jsx';
import { DRAG_TYPE, agentById } from './agents.js';

const nodeTypes = { terminal: TerminalNode };

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Lâcher une carte de la barre = créer un terminal à cet endroit.
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const agentId = event.dataTransfer.getData(DRAG_TYPE);
      if (!agentById(agentId)) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((nds) =>
        nds.concat({
          id: crypto.randomUUID(),
          type: 'terminal',
          position,
          dragHandle: '.drag-handle',
          style: { width: 640, height: 400 },
          data: { agentId },
        }),
      );
    },
    [screenToFlowPosition, setNodes],
  );

  // Les liens existent déjà visuellement. Étape suivante : leur donner un sens
  // (quand A a fini, envoyer sa réponse à B). Voir README.
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  return (
    <div className="app">
      <TopBar activeFolder={null} />
      <div className="workspace">
        <AgentDock />
        <main className="board" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            minZoom={0.1}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background gap={24} />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable />
          </ReactFlow>
        </main>
        <ExplorerPanel />
      </div>
    </div>
  );
}
