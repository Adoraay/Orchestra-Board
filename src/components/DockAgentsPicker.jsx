import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import { decorateAgent } from '../agents.js';
import AgentLogo from './AgentLogo.jsx';
import useT from '../hooks/useT.js';

// Agents du dock en cases à cocher (assistant du premier lancement) : ceux déjà dans les paramètres se
// masquent ou s'affichent, ceux du catalogue s'ajoutent au dock. Paramètres › Agents fait le reste.
export default function DockAgentsPicker() {
  const { settings, agents, setAgents } = useSettings();
  const t = useT();
  const [catalog, setCatalog] = useState([]);
  const [installed, setInstalled] = useState({}); // id -> true / false, vérifié avec where / which

  useEffect(() => {
    let cancelled = false;
    window.agents.catalog().then((list) => {
      if (cancelled) return;
      setCatalog(list);
      const commands = [...settings.agents.filter((a) => a.command), ...list];
      Promise.all(commands.map((a) => window.agents.testCommand(a.command))).then((results) => {
        if (!cancelled) setInstalled(Object.fromEntries(commands.map((a, i) => [a.id, results[i].ok])));
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = catalog.filter((c) => !settings.agents.some((a) => a.id === c.id));
  const toggle = (id) => setAgents(settings.agents.map((a) => (a.id === id ? { ...a, hidden: !a.hidden } : a)));
  const add = (entry) => setAgents([...settings.agents, { ...entry, builtin: false, catalog: true, hidden: false, logo: null }]);

  const row = (agent, checked, onChange) => (
    <li key={agent.id}>
      <label className={`agent-row pick ${checked ? '' : 'hidden'}`}>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <AgentLogo agent={agent} size={22} />
        <span className="agent-row-text">
          <span>
            {agent.name}
            {installed[agent.id] !== undefined && (
              <span className={`install-badge ${installed[agent.id] ? 'ok' : ''}`}>
                {t(installed[agent.id] ? 'agents.installed' : 'agents.notInstalled')}
              </span>
            )}
          </span>
          {agent.catalog && <span className="muted agent-row-description">{t(`catalog.${agent.id}`)}</span>}
        </span>
      </label>
    </li>
  );

  return (
    <ul className="agent-list setup-agents">
      {agents.map((agent) => row(agent, !agent.hidden, () => toggle(agent.id)))}
      {available.map((entry) => row(decorateAgent({ ...entry, catalog: true }, {}), false, () => add(entry)))}
    </ul>
  );
}
