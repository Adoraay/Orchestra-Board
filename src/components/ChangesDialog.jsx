import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code, Folder, GitBranch, RefreshCw, X } from 'lucide-react';
import useT from '../hooks/useT.js';

const LINE_CLASS = { '+': 'add', '-': 'del', '@': 'hunk', '\\': 'meta' };

const splitPath = (file) => {
  const i = file.lastIndexOf('/');
  return i < 0 ? ['', file] : [file.slice(0, i + 1), file.slice(i + 1)];
};

// Fenêtre « Changements » d'une case (PLAN.md §3.20) : fichiers modifiés de son dossier (ou worktree) par
// rapport au dernier commit, et diff du fichier choisi. Lecture seule. Rendue dans body : dans la map,
// le transform des cases décalerait une fenêtre en position fixed.
export default function ChangesDialog({ id, dir, name, taskId, onClose }) {
  const t = useT();
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const listRequest = useRef(0);
  const directoryRequest = useRef(0);
  const [expanding, setExpanding] = useState(false);

  const load = async () => {
    const token = ++listRequest.current;
    directoryRequest.current++;
    setLoading(true);
    const result = await (taskId ? window.tasks.changes(taskId) : window.git.changes(dir, id)).catch(() => ({ error: t('changes.failed') }));
    if (token !== listRequest.current) return;
    setLoading(false);
    setList(result);
    // Le fichier choisi reste choisi s'il a encore des changements, sinon le premier.
    setSelected((current) => (result.files?.some((f) => f.path === current) ? current : result.files?.[0]?.path ?? null));
    return result;
  };

  useEffect(() => {
    load();
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dir, taskId]);

  useEffect(() => {
    const id = ++request.current;
    directoryRequest.current++;
    setExpanding(false);
    setDiff(null);
    if (!selected) return;
    (taskId ? window.tasks.diff(taskId, selected) : window.git.diff(dir, selected))
      .catch(() => ({ error: t('changes.failed') }))
      .then((result) => id === request.current && setDiff(result));
    return () => { request.current++; };
  }, [dir, taskId, selected, list]);

  useEffect(() => () => { listRequest.current++; directoryRequest.current++; }, []);

  const expand = async () => {
    const token = ++directoryRequest.current;
    setExpanding(true);
    const remaining = Math.max(0, 500 - files.length);
    const result = await window.git.untracked(dir, selected, remaining).catch(() => ({ error: t('changes.failed') }));
    if (token !== directoryRequest.current) return;
    setExpanding(false);
    if (result.error) { setDiff(result); return; }
    const known = new Set(files.map((file) => file.path));
    const children = (result.files ?? []).filter((file) => !known.has(file.path));
    setList((current) => ({ ...current, files: [...current.files, ...children], filesLimited: current.filesLimited || result.limited }));
    if (children.length) setSelected(children[0].path);
  };

  const files = list?.files ?? [];

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal changes-modal" role="dialog" aria-modal="true" aria-labelledby="changes-title">
        <header className="modal-header">
          <h1 id="changes-title" className="changes-title">
            {t('changes.title', { name })}
            {list?.branch && (
              <span className="changes-branch">
                <GitBranch size={13} />
                {list.branch}
              </span>
            )}
          </h1>
          <span className="changes-actions">
            <button className={`icon-button ${loading ? 'spinning' : ''}`} onClick={load} disabled={loading} title={t('changes.refresh')}>
              <RefreshCw size={15} />
            </button>
            {!taskId && <button className="text-button" onClick={() => window.git.openInEditor(dir, selected)} disabled={!list?.root}>
              <Code size={14} />
              {t('changes.openInEditor')}
            </button>}
            <button className="icon-button" onClick={onClose} title={t('common.close')}>
              <X size={17} />
            </button>
          </span>
        </header>

        {list?.root && <div className="changes-scope">
          <strong>{taskId ? t('tasks.diffScope', { date: new Date(list.at).toLocaleString(t.locale) }) : t(list.base === 'empty' ? 'changes.scopeEmpty' : 'changes.scopeHead')}</strong>
          <span className="hint">{list.root}</span>
          <p className="hint">{t(taskId ? 'tasks.attribution' : 'changes.attribution')}</p>
          {taskId && <p className="hint">{t('tasks.snapshotLimits')}</p>}
          {list.sharedCases?.length > 0 && <p className="shared-worktree" role="status">{t('changes.shared', { names: list.sharedCases.map((entry) => `${entry.name} (${entry.boardName})`).join(', ') })}</p>}
        </div>}

        {list?.error && <p className="changes-message">{list.error}</p>}
        {list && !list.error && !files.length && <p className="changes-message">{t('changes.none')}</p>}
        {!list && <p className="changes-message hint">{t('changes.reading')}</p>}
        {list?.filesLimited && <p className="changes-message hint">{t('changes.filesLimited')}</p>}

        {files.length > 0 && (
          <div className="changes-body">
            <ul className="changes-files thin-scrollbar">
              {files.map((file) => {
                const [folder, base] = splitPath(file.directory ? file.path.replace(/\/$/, '') : file.path);
                return (
                  <li key={file.path}>
                    <button
                      className={`changes-file ${file.path === selected ? 'active' : ''}`}
                      onClick={() => setSelected(file.path)}
                      title={file.from ? `${file.from} → ${file.path}` : file.path}
                    >
                      <span className={`changes-status s-${file.status === '?' ? 'new' : file.status}`}>{file.directory ? <Folder size={13} /> : file.status === '?' ? 'U' : file.status}</span>
                      <span className="changes-path">
                        <span className="changes-name">{base}</span>
                        {folder && <span className="changes-folder">{folder}</span>}
                      </span>
                      {file.binary ? (
                        <span className="changes-count muted">{t('changes.binaryShort')}</span>
                      ) : (
                        <span className="changes-count">
                          {file.added > 0 && <span className="add">+{file.added}</span>}
                          {file.removed > 0 && <span className="del">−{file.removed}</span>}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="changes-diff thin-scrollbar">
              {!diff && <span className="hint">{t('changes.reading')}</span>}
              {diff?.error && <span className="changes-message">{diff.error}</span>}
              {diff?.binary && <span className="hint">{t('changes.binary')}</span>}
              {diff?.directory && <div className="changes-directory">
                <p className="hint">{t('changes.directory')}</p>
                <button className="text-button" onClick={expand} disabled={expanding || files.length >= 500}>{t(expanding ? 'changes.reading' : 'changes.expandDirectory')}</button>
              </div>}
              {diff?.diff !== undefined && (
                <pre className="changes-code">
                  {diff.diff.split('\n', 2001).map((line, i) => (
                    <div key={i} className={`changes-line ${LINE_CLASS[line[0]] ?? ''}`}>{line || ' '}</div>
                  ))}
                </pre>
              )}
              {diff?.truncated && <p className="hint">{t('changes.truncated')}</p>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
