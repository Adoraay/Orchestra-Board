import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import useT from '../hooks/useT.js';

export default function LogExportDialog({ filter, count, onClose }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const lock = useRef(false);
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape' && !lock.current) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setResult(null);
    try { setResult(await window.activityLog.export(filter)); }
    catch { setResult({ error: t('log.export.failed') }); }
    finally { lock.current = false; setBusy(false); }
  };
  return createPortal(<div className="modal-backdrop" onPointerDown={(e) => !busy && e.target === e.currentTarget && onClose()}><div className="dialog log-export-dialog" role="dialog" aria-modal="true" aria-labelledby="log-export-title">
    <header className="dialog-header"><h1 id="log-export-title">{t('log.export.title')}</h1><button className="icon-button" disabled={busy} title={t('common.close')} onClick={onClose}><X size={17} /></button></header>
    <p>{t('log.export.description', { n: count })}</p><p className="link-warning">{t('log.export.private')}</p>
    {result?.error && <p className="form-error" role="alert">{result.error}</p>}
    {result?.cancelled && <p className="hint">{t('log.export.cancelled')}</p>}
    {result?.path && <p className="hint log-export-result" role="status">{t('log.export.saved', { n: result.count })}<br />{result.path}</p>}
    <footer className="dialog-actions"><button className="text-button" disabled={busy} onClick={onClose}>{t('common.close')}</button><button className="text-button primary" disabled={busy} onClick={save}><Download size={14} />{t('log.export.save')}</button></footer>
  </div></div>, document.body);
}
