import { AGENTS, DRAG_TYPE } from '../agents.js';

// Barre de droite : chaque carte se glisse sur la map.
export default function AgentSidebar() {
  const onDragStart = (event, agentId) => {
    event.dataTransfer.setData(DRAG_TYPE, agentId);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="sidebar">
      <h2>Agents</h2>
      {AGENTS.map((agent) => (
        <div
          key={agent.id}
          className="agent-card"
          draggable
          onDragStart={(e) => onDragStart(e, agent.id)}
        >
          <span className="agent-logo" style={{ background: agent.color }}>
            {agent.initials}
          </span>
          {agent.name}
        </div>
      ))}
      <p className="hint">Glisse un agent sur la map pour l'ouvrir.</p>
    </aside>
  );
}
