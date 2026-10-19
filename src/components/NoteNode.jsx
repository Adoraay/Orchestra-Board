import { NodeResizer } from '@xyflow/react';
import useEditableText from '../hooks/useEditableText.js';
import useT from '../hooks/useT.js';

// Post-it (PLAN.md §3.8) : déplaçable, redimensionnable quand il est choisi, double-clic pour écrire.
export default function NoteNode({ id, data, selected }) {
  const t = useT();
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
          <textarea className="note-input nodrag nowheel" placeholder={t('note.placeholder')} {...inputProps} />
        ) : (
          <div className={`note-text ${data.text ? '' : 'empty'}`}>{data.text || t('note.empty')}</div>
        )}
      </div>
    </>
  );
}
