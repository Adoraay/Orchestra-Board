import { ArrowLeftRight, ArrowRight, Repeat, Trash2, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { DEFAULT_LINK, LINK_MODES, MAX_TURNS } from '../lib/links.js';

function statusText(event, nameOf) {
  const turns = event.maxTurns ? ` (tour ${event.turns} / ${event.maxTurns})` : '';
  const to = nameOf(event.to);
  switch (event.state) {
    case 'ready': return `Prêt, compteur remis à zéro${turns}`;
    case 'sent': return `Message transmis à ${to}${turns}`;
    case 'queued': return `En attente : ${to} travaille encore${turns}`;
    case 'limit': return `Limite de ${event.maxTurns} tours atteinte. Écris toi-même à la source pour relancer la chaîne.`;
    default: return event.message;
  }
}

// Panneau d'un lien choisi (PLAN.md §3.5, §3.11) : type, sens, consigne avec {reponse}, limite de tours, actif ou non.
export default function LinkPanel({ edge, nodes, event, onChange, onSwap, onDelete, onClose }) {
  const { agentById } = useSettings();
  const link = { ...DEFAULT_LINK, ...edge.data };
  const caseOf = (id) => {
    const node = nodes.find((n) => n.id === id);
    const agent = agentById(node?.data.agentId);
    return { name: node?.data.label || agent.name, agent };
  };
  const source = caseOf(edge.source);
  const target = caseOf(edge.target);
  const nameOf = (id) => (id === edge.source ? source.name : target.name);
  const relay = link.mode === 'relay';
  const mode = LINK_MODES.find((m) => m.id === link.mode);

  // Qui doit être Claude Code : en Transmission, chaque source (son hook Stop donne la réponse) ;
  // en Délégation, les deux bouts (l'un appelle les outils, l'autre répond).
  const needsClaude = relay ? [source, ...(link.bidirectional ? [target] : [])] : [source, target];
  const notClaude = needsClaude.filter((c) => c.agent.hooks !== 'claude').map((c) => c.name);

  return (
    <aside className="link-panel nowheel" aria-label="Réglages du lien">
      <header className="link-panel-header">
        <span className="link-panel-title">
          {source.name}
          {link.bidirectional ? <ArrowLeftRight size={14} /> : <ArrowRight size={14} />}
          {target.name}
        </span>
        <button className="icon-button" onClick={onClose} title="Fermer"><X size={15} /></button>
      </header>

      <div className="link-modes" role="radiogroup" aria-label="Type de lien">
        {LINK_MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={link.mode === m.id}
            className={`link-mode ${link.mode === m.id ? 'active' : ''}`}
            onClick={() => onChange({ mode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{mode.description}</p>

      <div className="link-direction">
        <button className="text-button" onClick={onSwap} disabled={link.bidirectional} title="La source devient la cible">
          <Repeat size={14} />
          Inverser le sens
        </button>
        <label className="checkbox">
          <input type="checkbox" checked={link.bidirectional} onChange={(e) => onChange({ bidirectional: e.target.checked })} />
          Dans les deux sens
        </label>
      </div>

      <label className="checkbox link-toggle">
        <input type="checkbox" checked={link.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        Lien actif
      </label>

      {relay && (
        <>
          <label className="link-field">
            Consigne
            <textarea
              className="thin-scrollbar"
              rows={4}
              value={link.prompt}
              placeholder="Relis ce code et corrige les bugs : {reponse}"
              onChange={(e) => onChange({ prompt: e.target.value })}
            />
          </label>
          <p className="hint">
            <code>{'{reponse}'}</code> est remplacé par la dernière réponse de la source. Sans lui, la réponse est ajoutée
            à la fin. Sans consigne, le lien ne transmet rien.
          </p>
        </>
      )}

      <label className="link-field inline">
        Limite de tours
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
            ? `Seul Claude Code prévient quand il a fini : ${notClaude.join(' et ')} ne transmettra rien.`
            : `La délégation ne marche qu'entre agents Claude Code pour l'instant (${notClaude.join(', ')}).`}
        </p>
      )}
      {event && <p className={`link-status ${event.state}`}>{statusText(event, nameOf)}</p>}

      <button className="text-button danger link-delete" onClick={onDelete}>
        <Trash2 size={14} />
        Supprimer le lien
      </button>
    </aside>
  );
}
