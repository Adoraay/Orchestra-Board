import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import StatusDot from './StatusDot.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

// Barre repliable en bas de la map : les agents lancés de tous les tableaux, groupés par tableau.
// Clic sur un agent = ouvrir son tableau et centrer la map sur sa case.
export default function AgentsBar({ boards, content, activeId, running, open, onToggle, onFocus }) {
  const { agentById } = useSettings();

  const groups = boards
    .map((board) => ({
      board,
      agents: (content[board.id]?.nodes ?? []).filter((n) => n.type === 'terminal' && running[n.id]),
    }))
    .filter((g) => g.agents.length > 0);
  const count = groups.reduce((sum, g) => sum + g.agents.length, 0);
  const working = Object.values(running).filter((info) => info.status === 'working' || info.status === 'waiting').length;

  return (
    <div className="agents-bar-wrap">
      <button className={`agents-bar-tab ${open ? 'open' : ''}`} onClick={onToggle} title={open ? 'Masquer les agents actifs' : 'Afficher les agents actifs'}>
        <Users size={14} />
        Agents actifs
        <span className="agents-bar-count">{count}</span>
        {!open && working > 0 && <StatusDot status="working" />}
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        // Une seule ligne qui défile : la molette la fait glisser de côté.
        <div className="agents-bar" onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
          {groups.length === 0 && <span className="agents-bar-empty">Aucun agent lancé</span>}
          {groups.map(({ board, agents }) => (
            <div key={board.id} className="agents-bar-group">
              <span className={`agents-bar-board ${board.id === activeId ? 'active' : ''}`}>{board.name}</span>
              {agents.map((node) => {
                const info = running[node.id];
                const name = info.name || node.data.label || agentById(node.data.agentId).name;
                return (
                  <button
                    key={node.id}
                    className={`agent-chip ${info.unseen ? 'finished' : ''}`}
                    title={`${name} · ${board.name}`}
                    onClick={() => onFocus(node.id)}
                  >
                    <AgentLogo agent={agentById(node.data.agentId)} size={16} />
                    <span className="agent-chip-name">{name}</span>
                    <StatusDot status={info.status} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
