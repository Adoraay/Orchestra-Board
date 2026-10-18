import { NodeResizer } from '@xyflow/react';
import useEditableText from '../hooks/useEditableText.js';

// Post-it (PLAN.md §3.8) : déplaçable, redimensionnable quand il est choisi, double-clic pour écrire.
export default function NoteNode({ id, data, selected }) {
  const { editing, startEditing, inputProps } = useEditableText(id, data);

  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={100}
        isVisible={selected && !editing}
        handleClassName="resize-handle"
        lineClassName="resize-line"
      />
      {/* nopan : le double-clic modifie la note au lieu de zoomer la map */}
      <div className={`note-node nopan ${selected ? 'selected' : ''}`} onDoubleClick={startEditing}>
        {editing ? (
          <textarea className="note-input nodrag nowheel" placeholder="Écris ta note…" {...inputProps} />
        ) : (
          <div className={`note-text ${data.text ? '' : 'empty'}`}>{data.text || 'Double-clic pour écrire'}</div>
        )}
      </div>
    </>
  );
}
