import { useReactFlow } from '@xyflow/react';
import useEditableText from '../hooks/useEditableText.js';

// Texte libre sur la map (PLAN.md §3.8) : sans fond, double-clic pour modifier, supprimé s'il est vidé.
export default function TextNode({ id, data, selected }) {
  const { deleteElements } = useReactFlow();
  const { editing, startEditing, inputProps } = useEditableText(id, data, {
    onFinish: (text) => {
      if (!text.trim()) deleteElements({ nodes: [{ id }] });
    },
  });

  return (
    <div className={`text-node nopan ${selected ? 'selected' : ''}`} onDoubleClick={startEditing}>
      {editing ? (
        <textarea className="text-input-free nodrag nowheel" placeholder="Texte" rows={1} {...inputProps} />
      ) : (
        <div className="text-content">{data.text}</div>
      )}
    </div>
  );
}
