import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import useT from '../hooks/useT.js';

const MAX_ROLE = 2000; // comme electron/workspaceStore.cjs

// Bulle sous la barre de titre d'une case (PLAN.md §3.19) : rôle donné à l'agent au début de chaque session.
// Un rôle changé pendant que l'agent tourne s'applique après une relance (proposée ici, conversation reprise).
export default function RoleEditor({ role, running, onSave, onRelaunch, onClose }) {
  const t = useT();
  const [text, setText] = useState(role ?? '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    const next = text.trim();
    onSave(next);
    if (running && next !== (role ?? '')) setSaved(true);
    else onClose();
  };

  return (
    <div
      className="role-editor nodrag nowheel nopan"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation(); // Suppr, V, P… ne doivent pas déclencher les raccourcis du tableau
        if (e.key === 'Escape') onClose();
      }}
    >
      {saved ? (
        <>
          <p className="role-editor-text">{t('role.relaunchQuestion')}</p>
          <div className="role-editor-actions">
            <button className="text-button" onClick={onClose}>{t('role.later')}</button>
            <button className="text-button primary" onClick={() => { onRelaunch(); onClose(); }}>
              <RotateCcw size={14} />
              {t('role.relaunch')}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="role-editor-label" htmlFor="role-text">{t('role.title')}</label>
          <textarea
            id="role-text"
            className="thin-scrollbar"
            rows={5}
            maxLength={MAX_ROLE}
            value={text}
            placeholder={t('role.placeholder')}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && save()}
          />
          <p className="hint">{t('role.hint')}</p>
          <div className="role-editor-actions">
            <button className="text-button" onClick={onClose}>{t('common.cancel')}</button>
            <button className="text-button primary" onClick={save}>{t('common.save')}</button>
          </div>
        </>
      )}
    </div>
  );
}
