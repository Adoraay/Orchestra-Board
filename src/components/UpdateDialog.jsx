import { useEffect, useState } from 'react';
import { Download, ExternalLink, Sparkles } from 'lucide-react';
import useT from '../hooks/useT.js';

// Nouvelle version disponible (PLAN.md §3.22) : passe avant toutes les autres fenêtres du démarrage.
// « Télécharger et installer » : téléchargement vérifié par Node, puis installateur (Windows) ou .dmg (macOS)
// et fermeture d'Orchestra. info : { current, version, notes, canInstall, platform }.
export default function UpdateDialog({ info, onClose }) {
  const t = useT();
  const [progress, setProgress] = useState(null); // null, puis 0 → 1 pendant le téléchargement
  const [error, setError] = useState(null);
  const busy = progress !== null && !error;

  useEffect(() => window.updates.onProgress(setProgress), []);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const install = async () => {
    setError(null);
    setProgress(0);
    const result = await window.updates.download();
    if (result.error) return setError(result.error);
    const installed = await window.updates.install();
    if (installed.error) setError(installed.error);
  };

  return (
    <div className="modal-backdrop">
      <div className="dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title" aria-describedby="update-text">
        <header className="dialog-header">
          <span className="dialog-icon"><Sparkles size={18} /></span>
          <h1 id="update-title">{t('update.title')}</h1>
        </header>

        <p id="update-text" className="dialog-text">{t('update.text', { version: info.version, current: info.current })}</p>
        {info.notes.trim() && <pre className="update-notes thin-scrollbar">{info.notes.trim()}</pre>}

        {busy && (
          <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="update-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>{progress < 1 ? t('update.downloading', { percent: Math.round(progress * 100) }) : t('update.installing')}</span>
          </div>
        )}
        {error && <p className="dialog-text update-error">{error}</p>}
        {!info.canInstall && <p className="hint">{t('update.manualOnly')}</p>}
        {info.canInstall && info.platform === 'darwin' && <p className="hint">{t('update.macHint')}</p>}

        <div className="dialog-actions">
          <button className="text-button" onClick={onClose} disabled={busy}>
            {t('update.later')}
          </button>
          <button className="text-button" onClick={() => window.updates.openRelease()}>
            <ExternalLink size={15} />
            {t('update.whatsNew')}
          </button>
          {info.canInstall && (
            <button className="text-button primary" onClick={install} disabled={busy} autoFocus>
              <Download size={15} />
              {t(info.platform === 'darwin' ? 'update.download' : 'update.install')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
