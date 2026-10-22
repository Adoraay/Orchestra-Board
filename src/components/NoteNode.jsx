import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import { Circle, CircleCheck, CircleDot } from 'lucide-react';
import { useBoard } from '../context/BoardContext.jsx';
import useEditableText from '../hooks/useEditableText.js';
import useT from '../hooks/useT.js';
import TerminalTitle from './TerminalTitle.jsx';

// Lignes de statut, écrites à la main ou par un agent relié (lien Note) : « - [x] », « - [~] », « - [ ] ».
const STATUS_LINE = /^\s*[-*]\s*\[([ xX~])\]\s?(.*)$/;
const STATUS = { x: 'done', X: 'done', '~': 'doing', ' ': 'todo' };
const STATUS_ICONS = { done: CircleCheck, doing: CircleDot, todo: Circle };

function NoteText({ text }) {
  return text.split('\n').map((line, i) => {
    const match = STATUS_LINE.exec(line);
    if (!match) return <div key={i} className="note-line">{line || ' '}</div>;
    const status = STATUS[match[1]];
    const Icon = STATUS_ICONS[status];
    return (
      <div key={i} className={`note-line note-status ${status}`}>
        <Icon size={14} />
        <span>{match[2]}</span>
      </div>
    );
  });
}

// Post-it (PLAN.md §3.8) : déplaçable, redimensionnable quand il est choisi, double-clic pour écrire.
// Son nom (« Note 1 », double-clic pour renommer) est celui que voient les agents reliés par un lien Note.
export default function NoteNode({ id, data, selected }) {
  const t = useT();
  const { linkSource, renameRequest, editRequest } = useBoard();
  const { updateNodeData } = useReactFlow();
  const { editing, startEditing, inputProps } = useEditableText(id, data, { request: editRequest?.id === id ? editRequest.at : null });

  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={100}
        isVisible={selected && !editing}
        handleClassName="resize-handle"
        lineClassName="resize-line"
      />
      {/* Points d'accroche invisibles : sans eux, React Flow ne trace pas le lien Note (agent -> post-it) */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {/* nopan : le double-clic modifie la note au lieu de zoomer la map */}
      <div className={`note-node nopan ${selected ? 'selected' : ''} ${linkSource === id ? 'link-source' : ''}`} onDoubleClick={startEditing}>
        {data.label && (
          <div className="note-title" onDoubleClick={(e) => e.stopPropagation()}>
            <TerminalTitle
              name={data.label}
              onRename={(label) => updateNodeData(id, { label: label || data.label })}
              editRequest={renameRequest?.id === id ? renameRequest.at : null}
            />
          </div>
        )}
        {editing ? (
          <textarea className="note-input nodrag nowheel" placeholder={t('note.placeholder')} {...inputProps} />
        ) : (
          <div className={`note-text ${data.text ? '' : 'empty'}`}>{data.text ? <NoteText text={data.text} /> : t('note.empty')}</div>
        )}
      </div>
    </>
  );
}
