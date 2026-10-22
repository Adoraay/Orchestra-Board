import { ArrowLeftRight, ArrowRight, Repeat, SquareTerminal, StickyNote, Trash2, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { DEFAULT_LINK, LINK_MODES, MAX_TURNS } from '../lib/links.js';
import useT from '../hooks/useT.js';

function statusText(event, nameOf, t) {
  const turns = event.maxTurns ? t('link.status.turns', { turns: event.turns, max: event.maxTurns }) : '';
  const to = nameOf(event.to);
  switch (event.state) {
    case 'ready': return t('link.status.ready', { turns });
    case 'sent': return t('link.status.sent', { to, turns });
    case 'queued': return t('link.status.queued', { to, turns });
    case 'limit': return t('link.status.limit', { max: event.maxTurns });
    default: return event.message;
  }
}

// Panneau d'un lien choisi (PLAN.md §3.5, §3.11) : type, sens, consigne avec {reponse}, limite de tours, actif ou non.
export default function LinkPanel({ edge, nodes, event, onChange, onSwap, onDelete, onClose }) {
  const { agentById } = useSettings();
  const t = useT();
  const link = { ...DEFAULT_LINK, ...edge.data };
  const caseOf = (id) => {
    const node = nodes.find((n) => n.id === id);
    const agent = agentById(node?.data.agentId);
    return { name: node?.data.label || (node?.type === 'note' ? t('note.defaultName') : agent.name), agent };
  };
  const source = caseOf(edge.source);
  const target = caseOf(edge.target);
  const nameOf = (id) => (id === edge.source ? source.name : target.name);
  const relay = link.mode === 'relay';

  // Qui doit être Claude Code ou Codex (agents à hooks) : en Transmission, chaque source (son hook Stop donne
  // la réponse) ; en Délégation, les deux bouts (l'un appelle les outils, l'autre répond).
  const needsHooks = relay ? [source, ...(link.bidirectional ? [target] : [])] : [source, target];
  const notClaude = needsHooks.filter((c) => !c.agent.hooks).map((c) => c.name);

  // Lien Terminal (PLAN.md §3.17) ou Note : rien à régler, une explication et la suppression.
  if (link.mode === 'terminal' || link.mode === 'note') {
    const Icon = link.mode === 'note' ? StickyNote : SquareTerminal;
    const warning = link.mode === 'note' ? 'link.warnNote' : 'link.warnTerminal';
    return (
      <aside className="link-panel nowheel" aria-label={t('link.panelLabel')}>
        <header className="link-panel-header">
          <span className="link-panel-title">
            {source.name}
            <ArrowRight size={14} />
            {target.name}
          </span>
          <button className="icon-button" onClick={onClose} title={t('common.close')}><X size={15} /></button>
        </header>
        <p className="link-terminal-title">
          <Icon size={14} />
          {t(`link.mode.${link.mode}`)}
        </p>
        <p className="hint">{t(`link.mode.${link.mode}.description`)}</p>
        {!source.agent.hooks && <p className="link-warning">{t(warning, { name: source.name })}</p>}
        <button className="text-button danger link-delete" onClick={onDelete}>
          <Trash2 size={14} />
          {t('link.delete')}
        </button>
      </aside>
    );
  }

  return (
    <aside className="link-panel nowheel" aria-label={t('link.panelLabel')}>
      <header className="link-panel-header">
        <span className="link-panel-title">
          {source.name}
          {link.bidirectional ? <ArrowLeftRight size={14} /> : <ArrowRight size={14} />}
          {target.name}
        </span>
        <button className="icon-button" onClick={onClose} title={t('common.close')}><X size={15} /></button>
      </header>

      <div className="link-modes" role="radiogroup" aria-label={t('link.type')}>
        {LINK_MODES.map((mode) => (
          <button
            key={mode}
            role="radio"
            aria-checked={link.mode === mode}
            className={`link-mode ${link.mode === mode ? 'active' : ''}`}
            onClick={() => onChange({ mode })}
          >
            {t(`link.mode.${mode}`)}
          </button>
        ))}
      </div>
      <p className="hint">{t(`link.mode.${link.mode}.description`)}</p>

      <div className="link-direction">
        <button className="text-button" onClick={onSwap} disabled={link.bidirectional} title={t('link.swapTitle')}>
          <Repeat size={14} />
          {t('link.swap')}
        </button>
        <label className="checkbox">
          <input type="checkbox" checked={link.bidirectional} onChange={(e) => onChange({ bidirectional: e.target.checked })} />
          {t('link.bidirectional')}
        </label>
      </div>

      <label className="checkbox link-toggle">
        <input type="checkbox" checked={link.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        {t('link.enabled')}
      </label>

      {relay && (
        <>
          <label className="link-field">
            {t('link.prompt')}
            <textarea
              className="thin-scrollbar"
              rows={4}
              value={link.prompt}
              placeholder={t('link.promptPlaceholder')}
              onChange={(e) => onChange({ prompt: e.target.value })}
            />
          </label>
          <p className="hint">
            <code>{t('link.responseToken')}</code> {t('link.promptHint')}
          </p>
        </>
      )}

      <label className="link-field inline">
        {t('link.maxTurns')}
        <input
          type="number"
          min={1}
          max={MAX_TURNS}
          value={link.maxTurns}
          onChange={(e) => {
            const value = Math.round(Number(e.target.value));
            if (value >= 1 && value <= MAX_TURNS) onChange({ maxTurns: value });
          }}
        />
      </label>

      {notClaude.length > 0 && (
        <p className="link-warning">
          {relay
            ? t('link.warnRelay', { names: notClaude.join(t('common.and')) })
            : t('link.warnDelegate', { names: notClaude.join(', ') })}
        </p>
      )}
      {event && <p className={`link-status ${event.state}`}>{statusText(event, nameOf, t)}</p>}

      <button className="text-button danger link-delete" onClick={onDelete}>
        <Trash2 size={14} />
        {t('link.delete')}
      </button>
    </aside>
  );
}
