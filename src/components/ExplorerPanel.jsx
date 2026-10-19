import { useCallback, useMemo, useState } from 'react';
import { FolderInput, FolderPlus, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { ExplorerContext } from '../context/ExplorerContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { isWithin, movePath, parentOf } from '../lib/paths.js';
import ExplorerMenu from './ExplorerMenu.jsx';
import FolderTree from './FolderTree.jsx';
import Toast from './Toast.jsx';
import TrashDialog from './TrashDialog.jsx';

// Explorateur de documents (à droite) : cliquer un dossier en fait le dossier actif. Clic droit = menu
// pour créer, renommer, supprimer, ouvrir dans l'Explorateur ou lancer un agent (PLAN.md §3.14).
// Replié ou non : état gardé par l'app (raccourci Ctrl+Maj+E).
export default function ExplorerPanel({ open, onToggle, onLaunchAgent }) {
  const { rootPath, changeRoot, activeFolder, setActiveFolder } = useWorkspace();
  const { visibleAgents } = useSettings();
  const [versions, setVersions] = useState({}); // dossier -> compteur : on le relit quand il change
  const [renaming, setRenaming] = useState(null);
  const [creatingIn, setCreatingIn] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, entry }
  const [trashing, setTrashing] = useState(null); // { entry, summary }
  const [toast, setToast] = useState(null);

  const refresh = useCallback((dir) => setVersions((v) => ({ ...v, [dir]: (v[dir] ?? 0) + 1 })), []);
  const showError = useCallback((text) => setToast({ id: Date.now(), text }), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const requestTrash = useCallback(
    async (entry) => {
      if (entry.path === rootPath) return;
      const summary = await window.fs.summary(entry.path);
      if (summary.error) showError(summary.error);
      else setTrashing({ entry, summary });
    },
    [rootPath, showError],
  );

  const value = useMemo(
    () => ({
      versions,
      renaming,
      setRenaming: (path) => setRenaming(path === rootPath ? null : path),
      creatingIn,
      setCreatingIn,
      openMenu: (event, entry) => setMenu({ x: event.clientX, y: event.clientY, entry }),
      requestTrash,
      createFolder: async (parent, name) => {
        setCreatingIn(null);
        const result = await window.fs.createFolder(parent, name);
        if (result.error) return showError(result.error);
        refresh(parent);
        setActiveFolder(result.path); // le nouveau dossier est prêt à recevoir un agent
      },
      rename: async (entry, name) => {
        setRenaming(null);
        const result = await window.fs.rename(entry.path, name);
        if (result.error) return showError(result.error);
        refresh(parentOf(entry.path));
        if (entry.isDir) setActiveFolder(movePath(activeFolder, entry.path, result.path));
      },
    }),
    [versions, renaming, creatingIn, rootPath, requestTrash, showError, refresh, activeFolder, setActiveFolder],
  );

  const onMenuAction = async (action, agentId) => {
    const { entry } = menu;
    setMenu(null);
    if (action === 'create') setCreatingIn(entry.path);
    else if (action === 'rename') value.setRenaming(entry.path);
    else if (action === 'copyPath') navigator.clipboard.writeText(entry.path).catch(() => {});
    else if (action === 'trash') requestTrash(entry);
    else if (action === 'launch') {
      setActiveFolder(entry.path);
      onLaunchAgent(agentId, entry.path);
    } else if (action === 'reveal') {
      const result = await window.fs.reveal(entry.path);
      if (result.error) showError(result.error);
    }
  };

  const confirmTrash = async () => {
    const { entry } = trashing;
    setTrashing(null);
    const result = await window.fs.trash(entry.path);
    if (result.error) return showError(result.error);
    refresh(parentOf(entry.path));
    if (isWithin(activeFolder, entry.path)) setActiveFolder(null);
  };

  if (!open) {
    return (
      <aside className="explorer collapsed">
        <button className="icon-button" title="Afficher les documents (Ctrl+Maj+E)" onClick={onToggle}>
          <PanelRightOpen size={17} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="explorer">
      <div className="panel-header">
        <h2>Documents</h2>
        <span className="panel-actions">
          <button
            className="icon-button"
            title="Nouveau dossier (dans le dossier actif)"
            disabled={!rootPath}
            onClick={() => setCreatingIn(activeFolder ?? rootPath)}
          >
            <FolderPlus size={16} />
          </button>
          <button className="icon-button" title="Masquer les documents (Ctrl+Maj+E)" onClick={onToggle}>
            <PanelRightClose size={17} />
          </button>
        </span>
      </div>

      <ExplorerContext.Provider value={value}>
        <div className="explorer-tree no-scrollbar">
          {rootPath ? <FolderTree rootPath={rootPath} /> : <p className="hint">Chargement…</p>}
        </div>
      </ExplorerContext.Provider>

      <button className="text-button" onClick={changeRoot}>
        <FolderInput size={15} />
        Changer la racine
      </button>

      {menu && (
        <ExplorerMenu
          {...menu}
          isRoot={menu.entry.path === rootPath}
          agents={visibleAgents}
          onAction={onMenuAction}
          onClose={closeMenu}
        />
      )}
      {trashing && <TrashDialog {...trashing} onCancel={() => setTrashing(null)} onConfirm={confirmTrash} />}
      {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(null)} />}
    </aside>
  );
}
