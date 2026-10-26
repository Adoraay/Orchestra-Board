import { useEffect, useLayoutEffect, useState } from 'react';
import { Check, LocateFixed, X } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

const WIDTH = 330;
const SHOWN = 3;

// Encoche qui sort de l'Inbox quand un agent attend une réponse : Accepter / Refuser répondent dans son terminal.
export default function PermissionNotch({ running, content, onFocus }) {
  const t = useT();
  const { agentById } = useSettings();
  const [answered, setAnswered] = useState(new Set());
  const [anchor, setAnchor] = useState(null);
  const waiting = Object.entries(running).filter(([id, info]) => info.status === 'waiting' && !answered.has(id));
  const visible = waiting.length > 0;

  // Une case qui n'attend plus peut de nouveau afficher ses boutons à la prochaine demande.
  useEffect(() => {
    setAnswered((current) => [...current].every((id) => running[id]?.status === 'waiting') ? current : new Set([...current].filter((id) => running[id]?.status === 'waiting')));
  }, [running]);

  useLayoutEffect(() => {
    if (!visible) return;
    const measure = () => {
      const rect = document.querySelector('.inbox-toggle')?.getBoundingClientRect();
      if (!rect) return setAnchor(null);
      // L'encoche s'étend vers la gauche, sur la map : la flèche reste sous l'Inbox.
      const left = Math.max(8, Math.min(rect.right + 14 - WIDTH, window.innerWidth - WIDTH - 8));
      setAnchor({ top: rect.bottom + 9, left, caret: rect.left + rect.width / 2 - left });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [visible]);

  if (!visible || !anchor) return null;
  const agentOf = (id) => {
    for (const board of Object.values(content)) {
      const node = board.nodes.find((n) => n.id === id);
      if (node) return agentById(node.data.agentId);
    }
    return null;
  };
  const answer = (id, allow) => {
    setAnswered((current) => new Set(current).add(id));
    window.agentEvents.answerPermission(id, allow);
  };

  return <div className="permission-notch" role="alert" style={{ top: anchor.top, left: anchor.left, width: WIDTH, '--caret': `${anchor.caret}px` }}>
    {waiting.slice(0, SHOWN).map(([id, info]) => {
      const permission = info.permission;
      return <div className="permission-entry" key={id}>
        <div className="permission-title">
          <AgentLogo agent={agentOf(id)} size={18} />
          <span>{t('permission.waiting', { name: info.name })}</span>
          <button className="icon-button" title={t('permission.show')} onClick={() => onFocus(id)}><LocateFixed size={14} /></button>
        </div>
        {permission?.tool && <div className="permission-detail" title={permission.detail}><strong>{permission.tool}</strong>{permission.detail && <code>{permission.detail}</code>}</div>}
        {permission?.actionable
          ? <div className="permission-actions">
            <button className="text-button danger" onClick={() => answer(id, false)}><X size={14} />{t('permission.refuse')}</button>
            <button className="text-button primary" onClick={() => answer(id, true)}><Check size={14} />{t('permission.accept')}</button>
          </div>
          : <div className="permission-actions"><span className="hint">{t('permission.inTerminal')}</span><button className="text-button" onClick={() => onFocus(id)}>{t('permission.open')}</button></div>}
      </div>;
    })}
    {waiting.length > SHOWN && <p className="hint permission-more">{t('permission.more', { n: waiting.length - SHOWN })}</p>}
  </div>;
}
