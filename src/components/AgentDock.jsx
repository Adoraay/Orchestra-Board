import { useState } from 'react';
import { AGENTS, DRAG_TYPE } from '../agents.js';
import AgentLogo from './AgentLogo.jsx';

// Dock de gauche : un carré par agent, le nom en infobulle, à glisser sur la map.
export default function AgentDock() {
  const [draggingId, setDraggingId] = useState(null);

  const onDragStart = (event, agentId) => {
    event.dataTransfer.setData(DRAG_TYPE, agentId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(agentId);
  };

  return (
    <nav className="dock" aria-label="Agents">
      {AGENTS.map((agent) => (
        <div
          key={agent.id}
          className={`dock-item ${draggingId === agent.id ? 'dragging' : ''}`}
          draggable
          onDragStart={(e) => onDragStart(e, agent.id)}
          onDragEnd={() => setDraggingId(null)}
          aria-label={agent.name}
        >
          <AgentLogo agent={agent} />
          <span className="tooltip" role="tooltip">{agent.name}</span>
        </div>
      ))}
    </nav>
  );
}
