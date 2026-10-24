import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

const QUIET_AFTER = 5 * 60 * 1000; // ms sans hook après lequel on le signale, sans conclure à une panne

function ago(ms, t) {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return t('diag.secondsAgo', { n: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  return t('time.hoursAgo', { n: Math.round(minutes / 60) });
}

// Paramètres › Diagnostic (PLAN.md §7, 3.5) : commande résolue et version de chaque agent du dock, puis pour
// chaque case lancée le dernier hook reçu. Aucune requête au modèle, aucun contenu d'échange affiché.
export default function DiagnosticsTab() {
  const { agentById } = useSettings();
  const t = useT();
  const [agents, setAgents] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [, setTick] = useState(0);

  const load = () => {
    setAgents(null);
    window.diagnostics.agents().then(setAgents).catch(() => setAgents([]));
    window.diagnostics.tiles().then(setTiles).catch(() => setTiles([]));
  };
  useEffect(() => {
    load();
    // Le dernier hook se rafraîchit seul ; les versions seulement sur demande.
    const timer = setInterval(() => {
      window.diagnostics.tiles().then(setTiles).catch(() => {});
      setTick((n) => n + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const agentLine = (a) => {
    if (a.state === 'missing') return <span className="diag-bad">{t('diag.missing', { command: a.command })}</span>;
    const version = a.version
      ? t('diag.version', { version: a.version })
      : t(a.versionChecked ? 'diag.versionUnknown' : 'diag.versionNotChecked');
    return (
      <>
        <span className="diag-path" title={a.path}>{a.path}</span>
        <span className={a.version ? '' : 'muted'}>{version}</span>
      </>
    );
  };

  const tileLine = (tile) => {
    if (!tile.hooks) return <span className="muted">{t('diag.noHooks')}</span>;
    if (tile.lastHook) {
      const quiet = Date.now() - tile.lastHook.at > QUIET_AFTER;
      return (
        <span className={quiet ? 'muted' : ''}>
          {t('diag.lastHook', { event: tile.lastHook.event, ago: ago(tile.lastHook.at, t) })}
          {quiet && ` ${t('diag.quiet')}`}
        </span>
      );
    }
    return <span className="diag-warn">{t('diag.noHookYet', { ago: tile.launchedAt ? ago(tile.launchedAt, t) : '?' })}</span>;
  };

  return (
    <div className="settings-form diagnostics">
      <div className="diag-header">
        <p className="hint">{t('diag.hint')}</p>
        <button className="text-button" onClick={load} disabled={!agents}>
          <RefreshCw size={14} />
          {t('diag.refresh')}
        </button>
      </div>

      <span className="field-label">{t('diag.agents')}</span>
      {!agents && <p className="hint">{t('diag.checking')}</p>}
      <ul className="diag-list">
        {agents?.map((a) => (
          <li key={a.id} className="diag-row">
            <AgentLogo agent={agentById(a.id)} size={18} />
            <span className="diag-name">{a.name}</span>
            {agentLine(a)}
            <span className="muted">{a.hooks ? t('diag.withHooks') : t('diag.withoutHooks')}</span>
          </li>
        ))}
      </ul>

      <span className="field-label">{t('diag.tiles')}</span>
      {!tiles.length && <p className="hint">{t('diag.noTiles')}</p>}
      <ul className="diag-list">
        {tiles.map((tile) => (
          <li key={tile.id} className="diag-row">
            <AgentLogo agent={agentById(tile.agentId)} size={18} />
            <span className="diag-name">{tile.name}</span>
            {tile.boardName && <span className="muted">{tile.boardName}</span>}
            {tileLine(tile)}
          </li>
        ))}
      </ul>
      <p className="hint">{t('diag.quietHint')}</p>
    </div>
  );
}
