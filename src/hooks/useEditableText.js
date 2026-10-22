import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';

// Texte d'un post-it ou d'un texte libre : double-clic pour modifier, Échap ou clic ailleurs pour finir.
// Un élément tout juste posé (data.autoEdit) s'ouvre directement en modification, comme à chaque nouvelle
// valeur de request (« Modifier le texte » du menu du clic droit).
export default function useEditableText(id, data, { onFinish, request } = {}) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(Boolean(data.autoEdit));
  const inputRef = useRef(null);

  useEffect(() => {
    if (data.autoEdit) updateNodeData(id, { autoEdit: false });
  }, [id, data.autoEdit, updateNodeData]);

  useEffect(() => {
    if (request) setEditing(true);
  }, [request]);

  useEffect(() => {
    if (!editing) return;
    // Attendre la fin du clic qui a créé l'élément, sinon le focus repart sur la map.
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const inputProps = {
    ref: inputRef,
    value: data.text ?? '',
    onChange: (e) => updateNodeData(id, { text: e.target.value }),
    onBlur: () => {
      setEditing(false);
      onFinish?.(data.text ?? '');
    },
    onKeyDown: (e) => {
      if (e.key === 'Escape') e.currentTarget.blur();
    },
  };

  return { editing, startEditing: () => setEditing(true), inputProps };
}
