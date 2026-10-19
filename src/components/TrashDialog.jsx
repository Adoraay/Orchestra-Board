import { useEffect } from 'react';
import { File, Folder, Trash2 } from 'lucide-react';
import useT from '../hooks/useT.js';

const UNITS = ['KB', 'MB', 'GB'];

function formatSize(bytes, t) {
  if (bytes < 1024) return t('size.bytes', { n: bytes });
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return t(`size.${UNITS[unit]}`, { n: value.toLocaleString(t.locale, { maximumFractionDigits: 1 }) });
}

// Confirmation avant de mettre un dossier ou un fichier à la corbeille, avec ce qu'il contient.
// summary : { isDir, files, folders, truncated } ou { isDir: false, size }.
export default function TrashDialog({ entry, summary, onCancel, onConfirm }) {
  const t = useT();

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const count = (key, n) => t(key, { n: n.toLocaleString(t.locale), count: n });
  let content;
  if (!summary.isDir) content = t('trash.file', { size: formatSize(summary.size, t) });
  else if (!summary.files && !summary.folders) content = t('trash.emptyFolder');
  else {
    const parts = [summary.files && count('trash.files', summary.files), summary.folders && count('trash.folders', summary.folders)];
    content = t('trash.folder', { list: parts.filter(Boolean).join(', '), truncated: summary.truncated });
  }
  const Icon = entry.isDir ? Folder : File;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="trash-title" aria-describedby="trash-text">
        <header className="dialog-header">
          <span className="dialog-icon warning"><Trash2 size={18} /></span>
          <h1 id="trash-title">{t('trash.title')}</h1>
        </header>

        <div className="dialog-row">
          <Icon size={18} className="muted" />
          <span className="dialog-row-text">
            <span className="dialog-row-name">{entry.name}</span>
            <span className="muted" title={entry.path}>{entry.path}</span>
          </span>
        </div>

        <p id="trash-text" className="dialog-text">{t('trash.text', { content })}</p>

        <div className="dialog-actions">
          <button className="text-button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="text-button danger-fill" onClick={onConfirm} autoFocus>
            {t('trash.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
