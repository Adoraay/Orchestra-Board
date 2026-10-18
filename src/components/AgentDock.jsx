import { DRAG_TYPE } from '../agents.js';
import { useSettings } from '../context/SettingsContext.jsx';
import AgentLogo from './AgentLogo.jsx';

// Image vide pour masquer le « fantôme » du navigateur : seul l'aperçu de la map doit se voir.
const emptyDragImage = new Image();
emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Dock de gauche : un carré par agent, le nom en infobulle, à glisser sur la map.
export default function AgentDock({ draggedAgentId, onDragStart, onDragEnd }) {
  const { visibleAgents } = useSettings();

  const handleDragStart = (event, agentId) => {
    event.dataTransfer.setData(DRAG_TYPE, agentId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    onDragStart(agentId);
  };

  return (
    <nav className="dock" aria-label="Agents">
      {visibleAgents.map((agent) => (
        <div
          key={agent.id}
          className={`dock-item ${draggedAgentId === agent.id ? 'dragging' : ''}`}
          draggable
          onDragStart={(e) => handleDragStart(e, agent.id)}
          onDragEnd={onDragEnd}
          aria-label={agent.name}
        >
          <AgentLogo agent={agent} />
          <span className="tooltip" role="tooltip">{agent.name}</span>
        </div>
      ))}
    </nav>
  );
}
