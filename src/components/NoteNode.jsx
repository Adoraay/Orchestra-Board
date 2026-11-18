import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import { Circle, CircleCheck, CircleDot, Link2Off, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBoard } from '../context/BoardContext.jsx';
import useEditableText from '../hooks/useEditableText.js';
import useT from '../hooks/useT.js';
import TerminalTitle from './TerminalTitle.jsx';

// Lignes de statut, écrites à la main ou par un agent relié (lien Note) : « - [x] », « - [~] », « - [ ] ».
const STATUS_LINE = /^\s*[-*]\s*\[([ xX~])\]\s?(.*)$/;
const STATUS = { x: 'done', X: 'done', '~': 'doing', ' ': 'todo' };
const STATUS_ICONS = { done: CircleCheck, doing: CircleDot, todo: Circle };

function NoteText({ text, tasks, onToggle, busy }) {
  const t = useT();
  const fileTasks = tasks && new Map(tasks.map((task) => [task.line, task]));
  return text.split('\n').map((line, i) => {
    const match = !fileTasks && STATUS_LINE.exec(line);
    const task = fileTasks ? fileTasks.get(i) : match && { marker: match[1], label: match[2] };
    if (!task) return <div key={i} className="note-line">{line || ' '}</div>;
    const status = STATUS[task.marker];
    const Icon = STATUS_ICONS[status];
    const label = task.label || t('note.fileTask', { n: i + 1 });
    if (fileTasks) {
      return (
        <button
          className={`note-line note-status note-task nodrag ${status}`}
          type="button"
          key={i}
          role="checkbox"
          aria-checked={status === 'doing' ? 'mixed' : status === 'done'}
          aria-label={label}
          aria-disabled={busy}
          title={t(`note.fileNext.${status}`)}
          onClick={() => !busy && onToggle(i)}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{task.label}</span>
        </button>
      );
    }
    return (
      <div key={i} className={`note-line note-status ${status}`}>
        <Icon size={14} />
        <span>{task.label}</span>
      </div>
    );
  });
}

function useNoteFile(id, api) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api?.getFile) return;
    let updated = false;
    const unsubscribe = api.onFileChange((noteId, state) => {
      if (noteId !== id) return;
      updated = true;
      setFile(state);
    });
    api.getFile(id).then((result) => {
      if (!updated) setFile(result.state ?? null);
    }).catch(() => { if (!updated) setError('note.fileUnavailable'); });
    return () => { updated = true; unsubscribe(); };
  }, [api, id]);

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api[action](id, ...args);
      setError(result.error ?? null);
    } catch {
      setError('note.fileUnavailable');
    } finally {
      setBusy(false);
    }
  };

  return { file, error, busy, run };
}

// Post-it (PLAN.md §3.8) : déplaçable, redimensionnable quand il est choisi, double-clic pour écrire.
// Son nom (« Note 1 », double-clic pour renommer) est celui que voient les agents reliés par un lien Note.
export default function NoteNode({ id, data, selected }) {
  const t = useT();
  const { linkSource, renameRequest, editRequest } = useBoard();
  const { updateNodeData } = useReactFlow();
  const api = window.notes;
  const { file, error, busy, run } = useNoteFile(id, api);
  const { editing, startEditing, inputProps } = useEditableText(id, data, { request: !file && editRequest?.id === id ? editRequest.at : null });
  const editingText = !file && editing;
  const FileActionIcon = file ? Link2Off : Paperclip;
  const fileAction = t(file ? 'note.fileUnlink' : 'note.fileLink');
  const fileError = error || file?.error;

  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={100}
        isVisible={selected && !editingText}
        handleClassName="resize-handle"
        lineClassName="resize-line"
      />
      {/* Points d'accroche invisibles : sans eux, React Flow ne trace pas le lien Note (agent -> post-it) */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {/* nopan : le double-clic modifie la note au lieu de zoomer la map */}
      <div className={`note-node nopan ${selected ? 'selected' : ''} ${linkSource === id ? 'link-source' : ''}`} onDoubleClick={file ? undefined : startEditing}>
        {(data.label || api?.linkFile) && (
          <div className="note-header" onDoubleClick={(e) => e.stopPropagation()}>
            <div className="note-title">
              {data.label && (
                <TerminalTitle
                  name={data.label}
                  onRename={(label) => updateNodeData(id, { label: label || data.label })}
                  editRequest={renameRequest?.id === id ? renameRequest.at : null}
                />
              )}
            </div>
            {api?.linkFile && (
              <button className="note-file-action nodrag" type="button" title={fileAction} aria-label={fileAction} disabled={busy} onClick={() => run(file ? 'unlinkFile' : 'linkFile')}>
                <FileActionIcon size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {file && <div className="note-file-name" title={file.file}>{file.name}</div>}
        {fileError && <div className="note-file-error" role="status">{t(fileError)}</div>}
        {file ? (
          <div className="note-text note-file-text nowheel">
            {file.text ? <NoteText text={file.text} tasks={file.tasks} busy={busy} onToggle={(line) => run('toggleFileTask', line, file.revision)} /> : !fileError && t('note.fileEmpty')}
          </div>
        ) : editingText ? (
          <textarea className="note-input nodrag nowheel" placeholder={t('note.placeholder')} {...inputProps} />
        ) : (
          <div className={`note-text ${data.text ? '' : 'empty'}`}>{data.text ? <NoteText text={data.text} /> : t('note.empty')}</div>
        )}
      </div>
    </>
  );
}
