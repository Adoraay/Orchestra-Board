import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import useT from '../hooks/useT.js';

const MAX_ROLE = 2000; // comme electron/workspaceStore.cjs

// Bulle sous la barre de titre d'une case (PLAN.md §3.19) : rôle donné à l'agent au début de chaque session.
// Un rôle changé pendant que l'agent tourne s'applique après une relance (proposée ici, conversation reprise).
export default function RoleEditor({ role, state, running, onSave, onRelaunch, onClose }) {
  const t = useT();
  const [text, setText] = useState(role ?? '');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    const next = text.trim();
    setBusy(true); setError('');
    try {
      await onSave(next);
      if (running && next !== (state?.activeRole ?? '')) setSaved(true);
      else onClose();
    } catch { setError(t('role.saveFailed')); }
    finally { setBusy(false); }
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
      <div className="role-session">
        <strong>{t('role.activeLabel')}</strong>
        <p>{state?.known ? state.activeRole || t('role.none') : t('role.unknown')}</p>
        {state?.pending && <span className="role-pending-text">{t('role.pending')}</span>}
      </div>
      {saved ? (
        <>
          <div className="role-saved"><strong>{t('role.savedLabel')}</strong><p>{state?.savedRole || t('role.none')}</p></div>
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
          <label className="role-editor-label" htmlFor="role-text">{t('role.savedLabel')}</label>
          <textarea
            id="role-text"
            className="thin-scrollbar"
            rows={5}
            maxLength={MAX_ROLE}
            value={text}
            placeholder={t('role.placeholder')}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && save()}
          />
          <p className="hint">{t('role.hint')}</p>
          <div className="role-editor-actions">
            <button className="text-button" onClick={onClose}>{t('common.cancel')}</button>
            <button className="text-button primary" disabled={busy} onClick={save}>{t('common.save')}</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  );
}
