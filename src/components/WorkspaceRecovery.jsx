import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useT from '../hooks/useT.js';

export default function WorkspaceRecovery({ recovery = false, onClose }) {
  const t = useT();
  const [backups, setBackups] = useState([]);
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    window.workspace.backups().then(setBackups).catch(() => setError(t('backup.failed')));
  }, []);

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await window.workspace.restore(selected === 'new' ? null : selected);
      if (!result.ok) throw new Error(result.error);
      window.location.reload();
    } catch {
      setError(t('backup.failed'));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <h1 id="backup-title">{t(recovery ? 'backup.recoveryTitle' : 'backup.title')}</h1>
        <p className="dialog-text">{t(recovery ? 'backup.corrupt' : 'backup.description')}</p>
        {!confirming ? <>
          <div className="field">
            <label htmlFor="backup-select">{t('backup.choose')}</label>
            <select id="backup-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">{t('backup.choose')}</option>
              {backups.map((b) => <option key={b.id} value={b.id}>
                {new Date(b.at).toLocaleString(t.locale)} — {t('backup.boards', { n: b.boards })}
              </option>)}
              {recovery && <option value="new">{t('backup.new')}</option>}
            </select>
            {!backups.length && <p className="hint">{t('backup.empty')}</p>}
          </div>
          <div className="dialog-actions">
            {onClose && <button className="text-button" onClick={onClose}>{t('common.cancel')}</button>}
            <button className="text-button primary" disabled={!selected} onClick={() => setConfirming(true)}>{t('backup.continue')}</button>
          </div>
        </> : <>
          <p className="dialog-text">{t('backup.confirm')}</p>
          <div className="dialog-actions">
            <button className="text-button" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
            <button className="text-button primary" disabled={busy} onClick={restore}>{t('backup.restore')}</button>
          </div>
        </>}
        {error && <p role="alert" className="hint">{error}</p>}
      </div>
    </div>, document.body,
  );
}
