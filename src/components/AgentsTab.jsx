import { useEffect, useState } from 'react';
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { decorateAgent } from '../agents.js';
import AgentLogo from './AgentLogo.jsx';
import AgentForm from './AgentForm.jsx';

const ORDER_TYPE = 'application/orchestra-agent-order';

// Liste des agents du dock (PLAN.md §3.3) : réordonnables, masquables, et suppression des agents ajoutés.
// settings.agents = la version enregistrée ; agents = la même liste avec initiales et logos pour l'affichage.
export default function AgentsTab() {
  const { settings, agents, setAgents } = useSettings();
  const [adding, setAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [installed, setInstalled] = useState({}); // id -> true / false, vérifié avec where / which

  // Catalogue des agents connus : on vérifie au passage lesquels sont installés.
  useEffect(() => {
    let cancelled = false;
    window.agents.catalog().then((list) => {
      if (cancelled) return;
      setCatalog(list);
      Promise.all(list.map((a) => window.agents.testCommand(a.command))).then((results) => {
        if (!cancelled) setInstalled(Object.fromEntries(list.map((a, i) => [a.id, results[i].ok])));
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const available = catalog.filter((c) => !settings.agents.some((a) => a.id === c.id));

  const toggleHidden = (id) =>
    setAgents(settings.agents.map((a) => (a.id === id ? { ...a, hidden: !a.hidden } : a)));

  // Un agent du catalogue retourne simplement dans « Autres agents » ; un agent ajouté perd aussi son logo.
  const remove = (agent) => {
    const saved = settings.agents.find((a) => a.id === agent.id);
    setAgents(settings.agents.filter((a) => a.id !== agent.id));
    if (saved?.logo) window.agents.deleteLogo(saved.logo);
    setConfirmDelete(null);
  };

  const moveTo = (target) => {
    if (dragIndex === null || dragIndex === target) return;
    const list = [...settings.agents];
    const [moved] = list.splice(dragIndex, 1);
    list.splice(target, 0, moved);
    setAgents(list);
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  if (adding) {
    return (
      <AgentForm
        onCancel={() => setAdding(false)}
        onSave={(agent) => {
          setAgents([...settings.agents, agent]);
          setAdding(false);
        }}
      />
    );
  }

  return (
    <div className="settings-form">
      <div className="field">
        <button className="text-button align-start" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Ajouter un agent
        </button>
        <p className="hint">Glisse les lignes pour changer l'ordre du dock. Les agents de base peuvent seulement être masqués.</p>
      </div>

      <ul className="agent-list">
        {agents.map((agent, index) => (
          <li
            key={agent.id}
            className={`agent-row ${agent.hidden ? 'hidden' : ''} ${overIndex === index && dragIndex !== index ? 'drop-target' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ORDER_TYPE, agent.id);
              e.dataTransfer.effectAllowed = 'move';
              setDragIndex(index);
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              moveTo(index);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <GripVertical size={15} className="grip" />
            <AgentLogo agent={agent} size={22} />
            <span className="agent-row-text">
              <span>{agent.name}</span>
              <code className="muted">{agent.command ?? 'terminal vide'}</code>
            </span>

            {confirmDelete === agent.id ? (
              <span className="confirm">
                <button className="text-button danger" onClick={() => remove(agent)}>Supprimer</button>
                <button className="text-button" onClick={() => setConfirmDelete(null)}>Annuler</button>
              </span>
            ) : (
              <>
                <button
                  className="icon-button"
                  title={agent.hidden ? 'Afficher dans le dock' : 'Masquer du dock'}
                  onClick={() => toggleHidden(agent.id)}
                >
                  {agent.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {!agent.builtin && (
                  <button className="icon-button" title="Supprimer" onClick={() => setConfirmDelete(agent.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {available.length > 0 && (
        <section className="field">
          <span className="field-label">Autres agents</span>
          <p className="hint">Agents en ligne de commande connus. « + » les ajoute au dock (le CLI doit être installé).</p>
          <ul className="agent-list">
            {available.map((entry) => {
              const agent = decorateAgent({ ...entry, catalog: true }, {});
              return (
                <li key={agent.id} className="agent-row catalog">
                  <AgentLogo agent={agent} size={22} />
                  <span className="agent-row-text">
                    <span>
                      {agent.name}
                      {installed[agent.id] !== undefined && (
                        <span className={`install-badge ${installed[agent.id] ? 'ok' : ''}`}>
                          {installed[agent.id] ? 'installé' : 'non installé'}
                        </span>
                      )}
                    </span>
                    <span className="muted agent-row-description">{agent.description}</span>
                    <code className="muted">{agent.command}</code>
                  </span>
                  <button
                    className="icon-button"
                    title="Ajouter au dock"
                    onClick={() => setAgents([...settings.agents, { ...entry, builtin: false, catalog: true, hidden: false, logo: null }])}
                  >
                    <Plus size={17} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
