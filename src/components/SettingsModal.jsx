import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import AgentsTab from './AgentsTab.jsx';
import AppearanceTab from './AppearanceTab.jsx';
import GeneralTab from './GeneralTab.jsx';
import ShortcutsTab from './ShortcutsTab.jsx';

const TABS = [
  { id: 'appearance', label: 'Apparence' },
  { id: 'agents', label: 'Agents' },
  { id: 'general', label: 'Général' },
  { id: 'shortcuts', label: 'Raccourcis' },
];

// Fenêtre de paramètres centrée (PLAN.md §3.3) : fermeture par ×, Échap ou clic à côté.
export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('appearance');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <h1 id="settings-title">Paramètres</h1>
          <button className="icon-button" onClick={onClose} title="Fermer">
            <X size={17} />
          </button>
        </header>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="modal-body no-scrollbar" role="tabpanel">
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'agents' && <AgentsTab />}
          {tab === 'general' && <GeneralTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
        </div>
      </div>
    </div>
  );
}
