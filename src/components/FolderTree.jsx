import { useEffect, useRef, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { useExplorer } from '../context/ExplorerContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import useT from '../hooks/useT.js';
import { baseName } from '../lib/paths.js';

const INDENT = 14; // px par niveau

// Arborescence chargée à la demande : un dossier n'est lu que quand on l'ouvre, et relu après une
// action dans l'explorateur (créer, renommer, supprimer).
export default function FolderTree({ rootPath }) {
  return (
    <ul className="tree" role="tree">
      <TreeItem key={rootPath} entry={{ name: baseName(rootPath), path: rootPath, isDir: true }} depth={0} defaultOpen />
    </ul>
  );
}

// Champ de nom dans l'arbre (renommer, nouveau dossier) : Entrée ou clic ailleurs valide, Échap annule.
function NameInput({ initial, isFile = false, onSubmit, onCancel }) {
  const cancelled = useRef(false);
  return (
    <input
      className="tree-input"
      defaultValue={initial}
      maxLength={255}
      autoFocus
      spellCheck={false}
      onFocus={(e) => {
        // Comme l'Explorateur Windows : un fichier est choisi sans son extension.
        const dot = isFile ? initial.lastIndexOf('.') : -1;
        e.target.setSelectionRange(0, dot > 0 ? dot : initial.length);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') cancelled.current = true;
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
      onBlur={(e) => {
        const value = e.target.value.trim();
        if (cancelled.current || !value || value === initial) onCancel();
        else onSubmit(value);
      }}
    />
  );
}

function TreeItem({ entry, depth, defaultOpen = false }) {
  const { activeFolder, setActiveFolder } = useWorkspace();
  const explorer = useExplorer();
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(null);
  const version = explorer.versions[entry.path] ?? 0;
  const renaming = explorer.renaming === entry.path;
  const creating = explorer.creatingIn === entry.path;

  useEffect(() => {
    if (creating) setOpen(true);
  }, [creating]);

  useEffect(() => {
    if (!open || !entry.isDir) return;
    let cancelled = false;
    window.fs.listDir(entry.path).then((result) => {
      if (cancelled) return;
      setError(result.error ?? null);
      setChildren(result.error ? null : result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [open, entry.path, entry.isDir, version]);

  const style = { paddingLeft: 6 + depth * INDENT };
  const rowProps = {
    tabIndex: 0,
    onContextMenu: (event) => {
      event.preventDefault();
      event.currentTarget.focus();
      explorer.openMenu(event, entry);
    },
    onKeyDown: (event) => {
      if (renaming) return;
      if (event.key === 'F2') {
        event.preventDefault();
        explorer.setRenaming(entry.path);
      } else if (event.key === 'Delete') {
        event.preventDefault();
        explorer.requestTrash(entry);
      }
    },
  };
  const name = renaming ? (
    <NameInput initial={entry.name} isFile={!entry.isDir} onSubmit={(value) => explorer.rename(entry, value)} onCancel={() => explorer.setRenaming(null)} />
  ) : (
    <span className="tree-name">{entry.name}</span>
  );

  if (!entry.isDir) {
    return (
      <li className="tree-row file" style={style} title={entry.path} {...rowProps}>
        <span className="tree-chevron" />
        <File size={14} />
        {name}
      </li>
    );
  }

  const active = activeFolder === entry.path;
  const FolderIcon = open ? FolderOpen : Folder;
  const childStyle = { paddingLeft: 6 + (depth + 1) * INDENT };

  return (
    <li role="treeitem" aria-expanded={open} aria-selected={active}>
      <div
        className={`tree-row folder ${active ? 'active' : ''}`}
        style={style}
        title={entry.path}
        onClick={() => {
          if (renaming) return;
          setActiveFolder(entry.path);
          setOpen(true);
        }}
        {...rowProps}
      >
        <button
          className={`tree-chevron ${open ? 'open' : ''}`}
          title={t(open ? 'tree.collapse' : 'tree.expand')}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          <ChevronRight size={14} />
        </button>
        <FolderIcon size={14} />
        {name}
      </div>

      {open && (
        <ul role="group">
          {creating && (
            <li className="tree-row folder creating" style={childStyle}>
              <span className="tree-chevron" />
              <Folder size={14} />
              <NameInput
                initial={t('tree.newFolderName')}
                onSubmit={(value) => explorer.createFolder(entry.path, value)}
                onCancel={() => explorer.setCreatingIn(null)}
              />
            </li>
          )}
          {error && <li className="tree-row message" style={childStyle}>{error}</li>}
          {!error && !children && <li className="tree-row message" style={childStyle}>{t('common.loading')}</li>}
          {children?.length === 0 && !creating && <li className="tree-row message" style={childStyle}>{t('tree.empty')}</li>}
          {children?.map((child) => (
            <TreeItem key={child.path} entry={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
