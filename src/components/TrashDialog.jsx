import { useEffect } from 'react';
import { File, Folder, Trash2 } from 'lucide-react';

const count = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} octets`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

// Confirmation avant de mettre un dossier ou un fichier à la corbeille, avec ce qu'il contient.
// summary : { isDir, files, folders, truncated } ou { isDir: false, size }.
export default function TrashDialog({ entry, summary, onCancel, onConfirm }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  let content;
  if (!summary.isDir) content = `Le fichier (${formatSize(summary.size)})`;
  else if (!summary.files && !summary.folders) content = 'Le dossier (vide)';
  else {
    const parts = [summary.files && count(summary.files, 'fichier', 'fichiers'), summary.folders && count(summary.folders, 'dossier', 'dossiers')];
    content = `Le dossier et tout son contenu (${summary.truncated ? 'plus de ' : ''}${parts.filter(Boolean).join(', ')})`;
  }
  const Icon = entry.isDir ? Folder : File;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="trash-title" aria-describedby="trash-text">
        <header className="dialog-header">
          <span className="dialog-icon warning"><Trash2 size={18} /></span>
          <h1 id="trash-title">Mettre à la corbeille ?</h1>
        </header>

        <div className="dialog-row">
          <Icon size={18} className="muted" />
          <span className="dialog-row-text">
            <span className="dialog-row-name">{entry.name}</span>
            <span className="muted" title={entry.path}>{entry.path}</span>
          </span>
        </div>

        <p id="trash-text" className="dialog-text">
          {content} ira dans la corbeille de Windows. Tu pourras le restaurer depuis la corbeille.
        </p>

        <div className="dialog-actions">
          <button className="text-button" onClick={onCancel}>
            Annuler
          </button>
          <button className="text-button danger-fill" onClick={onConfirm} autoFocus>
            Mettre à la corbeille
          </button>
        </div>
      </div>
    </div>
  );
}
