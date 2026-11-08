import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

const USAGE_AGENTS = ['claude-code', 'codex', 'gemini'];
const LIVE_REFRESH = 5 * 60 * 1000; // ms : une case posée sur la map se relit seule, sans lancer un Claude invisible trop souvent

function ago(ms, t) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t('time.hoursAgo', { n: hours });
  return t('time.daysAgo', { n: Math.round(hours / 24) });
}

function resetText(ms, t) {
  const minutes = Math.max(0, Math.round((ms - Date.now()) / 60000));
  const time = new Date(ms).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' });
  if (minutes < 60) return t('usage.resetIn', { duration: t('time.minutes', { m: minutes }), time });
  if (minutes < 24 * 60) {
    const duration = t('time.hoursMinutes', { h: Math.floor(minutes / 60), mm: String(minutes % 60).padStart(2, '0') });
    return t('usage.resetIn', { duration, time });
  }
  const day = new Date(ms).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return t('usage.resetOn', { day, time });
}

const level = (percent) => (percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'ok');

// Contenu de l'Utilisation (quotas de Claude Code et Codex), dans la languette ou dans une case de la map.
// Claude trop ancien (> 2 min) : Node lance un /usage invisible, les derniers chiffres restent affichés en attendant.
// live : posé sur la map, toujours visible, donc relu régulièrement tant que la fenêtre n'est pas cachée.
export default function UsageView({ active, live = false, agentId, onSelectAgent, actions }) {
  const { settings, agentById } = useSettings();
  const t = useT();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const request = useRef(0);

  const agents = USAGE_AGENTS.filter((id) => settings.agents.some((a) => a.id === id)).map(agentById);

  const load = async (force) => {
    const id = ++request.current; // un changement d'agent rend obsolètes les réponses en cours
    const current = await window.usage.get(agentId);
    if (id !== request.current) return;
    setData(current);
    if (!current?.refreshable) return setRefreshing(false);
    setRefreshing(true);
    const fresh = await window.usage.refresh(agentId, force);
    if (id !== request.current) return;
    setData(fresh);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!active) return;
    setData(null);
    load(false);
    const timer = setInterval(() => setTick((t) => t + 1), 30 * 1000); // « il y a … » reste juste
    return () => clearInterval(timer);
  }, [active, agentId]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => !document.hidden && load(false), LIVE_REFRESH);
    return () => clearInterval(timer);
  }, [live, agentId]);

  return (
    <div className="usage-panel">
      <div className="usage-header">
        <span className="usage-title">{t('usage.title')}</span>
        <span className="panel-actions nodrag">
          {data?.refreshable && (
            <button
              className={`icon-button ${refreshing ? 'spinning' : ''}`}
              title={t('usage.refresh')}
              disabled={refreshing}
              onClick={() => load(true)}
            >
              <RefreshCw size={14} />
            </button>
          )}
          {actions}
        </span>
      </div>

      <div className="usage-agents nodrag">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`usage-agent ${agent.id === agentId ? 'active' : ''}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <AgentLogo agent={agent} size={16} />
            {agent.name}
          </button>
        ))}
      </div>

      <div className="usage-body thin-scrollbar nodrag nowheel">
        {!data && <span className="hint">{t('usage.reading')}</span>}
        {data?.unavailable && <span className="hint">{data.unavailable}</span>}
        {data && !data.unavailable && data.limits.length === 0 && (
          <span className="hint">
            {refreshing ? t('usage.launching') : t('usage.noData', { name: agentById(agentId).name })}
          </span>
        )}
        {data?.limits?.map((l) => (
          <div key={l.label} className="usage-limit">
            <div className="usage-limit-row">
              <span>{l.label}</span>
              <span className={`usage-percent ${level(l.percent)}`}>{l.percent} %</span>
            </div>
            <div className="usage-meter">
              <div className={`usage-meter-fill ${level(l.percent)}`} style={{ width: `${l.percent}%` }} />
            </div>
            {l.resetsAt && <span className="hint">{resetText(l.resetsAt, t)}</span>}
          </div>
        ))}
        {data?.breakdown?.length > 0 && (
          <div className="usage-breakdown">
            <span className="field-label">{t('usage.breakdown')}</span>
            {data.breakdown.map((row) => (
              <div key={row.label} className="usage-limit-row">
                <span className="muted">{row.label}</span>
                <span className="muted">{row.percent} %</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {data && !data.unavailable && (
        <div className="usage-footer hint">
          {data.error && <span className="usage-error">{data.error}</span>}
          {data.plan && <span>{t('usage.plan', { plan: data.plan })}</span>}
          {data.fetchedAt && <span>{t('usage.updated', { ago: ago(data.fetchedAt, t) })}{refreshing ? t('usage.updating') : ''}</span>}
          {data.note && <span>{data.note}</span>}
        </div>
      )}
    </div>
  );
}
