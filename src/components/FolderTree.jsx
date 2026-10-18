import { useEffect, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { baseName } from '../lib/paths.js';

const INDENT = 14; // px par niveau

// Arborescence chargée à la demande : un dossier n'est lu que quand on l'ouvre.
export default function FolderTree({ rootPath }) {
  return (
    <ul className="tree" role="tree">
      <TreeItem key={rootPath} entry={{ name: baseName(rootPath), path: rootPath, isDir: true }} depth={0} defaultOpen />
    </ul>
  );
}

function TreeItem({ entry, depth, defaultOpen = false }) {
  const { activeFolder, setActiveFolder } = useWorkspace();
  const [open, setOpen] = useState(defaultOpen);
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || children) return;
    window.fs.listDir(entry.path).then((result) => {
      if (result.error) setError(result.error);
      else setChildren(result.entries);
    });
  }, [open, children, entry.path]);

  const style = { paddingLeft: 6 + depth * INDENT };

  if (!entry.isDir) {
    return (
      <li className="tree-row file" style={style} title={entry.name}>
        <span className="tree-chevron" />
        <File size={14} />
        <span className="tree-name">{entry.name}</span>
      </li>
    );
  }

  const active = activeFolder === entry.path;
  const FolderIcon = open ? FolderOpen : Folder;

  return (
    <li role="treeitem" aria-expanded={open} aria-selected={active}>
      <div
        className={`tree-row folder ${active ? 'active' : ''}`}
        style={style}
        title={entry.path}
        onClick={() => {
          setActiveFolder(entry.path);
          setOpen(true);
        }}
      >
        <button
          className={`tree-chevron ${open ? 'open' : ''}`}
          title={open ? 'Replier' : 'Déplier'}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          <ChevronRight size={14} />
        </button>
        <FolderIcon size={14} />
        <span className="tree-name">{entry.name}</span>
      </div>

      {open && (
        <ul role="group">
          {error && <li className="tree-row message" style={{ paddingLeft: 6 + (depth + 1) * INDENT }}>{error}</li>}
          {!error && !children && (
            <li className="tree-row message" style={{ paddingLeft: 6 + (depth + 1) * INDENT }}>Chargement…</li>
          )}
          {children?.length === 0 && (
            <li className="tree-row message" style={{ paddingLeft: 6 + (depth + 1) * INDENT }}>Vide</li>
          )}
          {children?.map((child) => (
            <TreeItem key={child.path} entry={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
