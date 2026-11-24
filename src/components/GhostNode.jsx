import { GitBranch, Globe, MonitorCheck, MoveDiagonal } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

const EXCERPT = 220;
const excerpt = (text) => (text && text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text);

// Case proposée par le chef d'orchestre, pas encore créée (aperçu, PLAN.md §3.25) : semi-transparente,
// ni déplaçable ni choisie. kind : agent, terminal, sticky, browser, visual, ou move (nouvelle place d'une case existante).
export default function GhostNode({ data }) {
  const { agentById } = useSettings();
  const t = useT();
  if (data.kind === 'move') return <div className="ghost-node ghost-move"><MoveDiagonal size={16} /></div>;
  if (data.kind === 'sticky') {
    return (
      <div className="ghost-node ghost-sticky">
        <span className="ghost-badge">{t('ghost.proposed')}</span>
        <strong>{data.label}</strong>
        <p>{excerpt(data.text)}</p>
      </div>
    );
  }
  if (data.kind === 'browser' || data.kind === 'visual') {
    const Icon = data.kind === 'browser' ? Globe : MonitorCheck;
    return (
      <div className="ghost-node ghost-agent">
        <header className="ghost-header">
          <Icon size={18} />
          <strong>{t(data.kind === 'browser' ? 'dock.browser' : 'tool.visualTest')}</strong>
          <span className="ghost-badge">{t('ghost.proposed')}</span>
        </header>
        {data.url && <p>{data.url}</p>}
      </div>
    );
  }
  const agent = agentById(data.agentId);
  return (
    <div className="ghost-node ghost-agent">
      <header className="ghost-header">
        <AgentLogo agent={agent} size={18} />
        <strong>{data.label}</strong>
        <span className="ghost-type">{agent.name}</span>
        <span className="ghost-badge">{t('ghost.proposed')}</span>
      </header>
      {data.branch && <p className="ghost-branch"><GitBranch size={12} />{data.branch}</p>}
      {data.role && <p><span className="ghost-label">{t('ghost.role')}</span>{excerpt(data.role)}</p>}
      {data.prompt && <p><span className="ghost-label">{t('ghost.prompt')}</span>{excerpt(data.prompt)}</p>}
    </div>
  );
}
