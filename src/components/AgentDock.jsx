import { useState } from 'react';
import { ChevronRight, GitBranch } from 'lucide-react';
import { BRANCH_DRAG_TYPE, DRAG_TYPE } from '../agents.js';
import { useSettings } from '../context/SettingsContext.jsx';
import AgentLogo from './AgentLogo.jsx';
import ModelMenu from './ModelMenu.jsx';
import useT from '../hooks/useT.js';

// Image vide pour masquer le « fantôme » du navigateur : seul l'aperçu de la map doit se voir.
const emptyDragImage = new Image();
emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Dock de gauche : un carré par agent, le nom en infobulle, à glisser sur la map.
// Sous un trait, le carré « Branche », à glisser sur une case (PLAN.md §3.10).
// Claude Code et Codex ont une petite flèche sur le côté : le modèle de leurs prochaines cases.
export default function AgentDock({ draggedAgentId, draggingBranch, onDragStart, onBranchDragStart, onDragEnd }) {
  const { visibleAgents, settings, setModel } = useSettings();
  const [modelMenu, setModelMenu] = useState(null); // { agent, anchor }
  const t = useT();

  const handleDragStart = (event, agentId) => {
    event.dataTransfer.setData(DRAG_TYPE, agentId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    onDragStart(agentId);
  };

  const handleBranchDragStart = (event) => {
    event.dataTransfer.setData(BRANCH_DRAG_TYPE, 'branch');
    event.dataTransfer.effectAllowed = 'link';
    event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    onBranchDragStart();
  };

  return (
    <nav className="dock" aria-label={t('dock.label')}>
      {visibleAgents.map((agent) => {
        const model = settings.models[agent.id];
        return (
        <div
          key={agent.id}
          className={`dock-item ${draggedAgentId === agent.id ? 'dragging' : ''}`}
          draggable
          onDragStart={(e) => handleDragStart(e, agent.id)}
          onDragEnd={onDragEnd}
          aria-label={agent.name}
        >
          <AgentLogo agent={agent} />
          <span className="tooltip" role="tooltip">{model ? `${agent.name} · ${model}` : agent.name}</span>
          {agent.hooks && (
            <button
              className={`dock-model ${model ? 'active' : ''} ${modelMenu?.agent.id === agent.id ? 'open' : ''}`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => {
                const anchor = e.currentTarget;
                setModelMenu((menu) => (menu?.agent.id === agent.id ? null : { agent, anchor }));
              }}
              aria-label={t('model.choose', { agent: agent.name })}
              aria-haspopup="menu"
            >
              <ChevronRight size={11} />
            </button>
          )}
        </div>
        );
      })}
      <div className="dock-separator" />
      <div
        className={`dock-item dock-branch ${draggingBranch ? 'dragging' : ''}`}
        draggable
        onDragStart={handleBranchDragStart}
        onDragEnd={onDragEnd}
        aria-label={t('dock.branch')}
      >
        <GitBranch size={22} />
        <span className="tooltip" role="tooltip">{t('dock.branch')}</span>
      </div>
      {modelMenu && (
        <ModelMenu
          agent={modelMenu.agent}
          anchor={modelMenu.anchor}
          current={settings.models[modelMenu.agent.id] ?? null}
          onChoose={(model) => {
            setModel(modelMenu.agent.id, model);
            setModelMenu(null);
          }}
          onClose={() => setModelMenu(null)}
        />
      )}
    </nav>
  );
}
