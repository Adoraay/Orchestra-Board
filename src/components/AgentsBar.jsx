import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ChevronUp, Users } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import StatusDot from './StatusDot.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useAutoClose from '../hooks/useAutoClose.js';
import useT from '../hooks/useT.js';

const MAX_NAME = 40;
const DOUBLE_CLICK_DELAY = 400; // ms

// Hors du composant : cliquer sur l'agent d'un autre tableau change de tableau et recrée la barre,
// le double-clic doit survivre à ce changement.
let lastClick = { id: null, at: 0 };

// Barre repliable en bas de la map : les agents lancés de tous les tableaux, groupés par tableau.
// Clic sur un agent = ouvrir son tableau, centrer la map sur sa case et marquer sa fin de tâche comme vue.
// Rendue dans la map du tableau ouvert (ReactFlowProvider), pour pouvoir renommer ses cases.
export default function AgentsBar({ boards, content, activeId, running, open, onToggle, onFocus }) {
  const { agentById } = useSettings();
  const t = useT();
  const wrapRef = useRef(null);
  useAutoClose(wrapRef, open, onToggle);

  // Double-clic = renommer la case, comme sur son titre (vide = nom de l'agent).
  const [editingId, setEditingId] = useState(null);
  const cancelEdit = useRef(false); // Échap : le blur qui suit ne doit pas enregistrer
  const { updateNodeData } = useReactFlow();

  const focus = (id) => {
    const now = Date.now();
    if (lastClick.id === id && now - lastClick.at < DOUBLE_CLICK_DELAY) setEditingId(id);
    lastClick = { id, at: now };
    if (running[id]?.unseen) window.pty.ack(id);
    onFocus(id);
  };

  // Le premier clic ouvre le tableau de l'agent : au moment de renommer, c'est toujours le tableau ouvert.
  const rename = (node, agent, label) => {
    updateNodeData(node.id, { label: label || undefined });
    window.pty.rename(node.id, label || agent.name);
  };

  const groups = boards
    .map((board) => ({
      board,
      agents: (content[board.id]?.nodes ?? []).filter((n) => n.type === 'terminal' && running[n.id]),
    }))
    .filter((g) => g.agents.length > 0);
  const count = groups.reduce((sum, g) => sum + g.agents.length, 0);
  const working = Object.values(running).filter((info) => info.status === 'working' || info.status === 'waiting').length;

  return (
    <div className="agents-bar-wrap" ref={wrapRef}>
      <button className={`agents-bar-tab ${open ? 'open' : ''}`} onClick={onToggle} title={t('agentsBar.toggle', { open })}>
        <Users size={14} />
        {t('agentsBar.title')}
        <span className="agents-bar-count">{count}</span>
        {!open && working > 0 && <StatusDot status="working" />}
        <ChevronUp className="agents-bar-chevron" size={14} />
      </button>
      {/* Toujours rendue, pour glisser à l'ouverture comme à la fermeture ; inerte quand elle est repliée. */}
      <div className={`agents-bar-slide ${open ? 'open' : ''}`} inert={open ? undefined : ''}>
        <div className="agents-bar-clip">
          {/* Une seule ligne qui défile : la molette la fait glisser de côté. */}
          <div className="agents-bar" onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
            {groups.length === 0 && <span className="agents-bar-empty">{t('agentsBar.empty')}</span>}
            {groups.map(({ board, agents }) => (
              <div key={board.id} className="agents-bar-group">
                <span className={`agents-bar-board ${board.id === activeId ? 'active' : ''}`}>{board.name}</span>
                {agents.map((node) => {
                  const info = running[node.id];
                  const agent = agentById(node.data.agentId);
                  const name = info.name || node.data.label || agent.name;
                  if (editingId === node.id) {
                    return (
                      <div key={node.id} className="agent-chip editing">
                        <AgentLogo agent={agent} size={16} />
                        <input
                          className="agent-chip-input"
                          defaultValue={name}
                          maxLength={MAX_NAME}
                          autoFocus
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (!cancelEdit.current) rename(node, agent, e.target.value.trim());
                            cancelEdit.current = false;
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation(); // Suppr, V, P… ne doivent pas déclencher les raccourcis du tableau
                            if (e.key === 'Escape') cancelEdit.current = true;
                            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                          }}
                        />
                        <StatusDot status={info.status} />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={node.id}
                      className={`agent-chip ${info.unseen ? 'finished' : ''}`}
                      title={t('agentsBar.chipTitle', { name, board: board.name })}
                      onClick={() => focus(node.id)}
                    >
                      <AgentLogo agent={agent} size={16} />
                      <span className="agent-chip-name">{name}</span>
                      <StatusDot status={info.status} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
