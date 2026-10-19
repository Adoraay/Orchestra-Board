import { useEffect, useRef, useState } from 'react';
import useT from '../hooks/useT.js';
import { baseName } from '../lib/paths.js';

const MAX_NAME = 40;

// Titre d'une case : nom (celui de l'agent, ou celui choisi par double-clic) · dossier.
// Un nom vidé revient au nom de l'agent. editRequest change à chaque F2 sur la case : on passe en édition.
export default function TerminalTitle({ name, cwd, onRename, onEditStart, editRequest }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const cancel = useRef(false); // Échap : le blur qui suit ne doit pas enregistrer

  useEffect(() => {
    if (!editRequest) return;
    onEditStart?.();
    setEditing(true);
  }, [editRequest]);

  if (editing) {
    return (
      <input
        className="terminal-title-input nodrag"
        defaultValue={name}
        maxLength={MAX_NAME}
        autoFocus
        onFocus={(e) => e.target.select()}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (!cancel.current) onRename(e.target.value.trim());
          cancel.current = false;
          setEditing(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation(); // Suppr, V, P… ne doivent pas déclencher les raccourcis du tableau
          if (e.key === 'Escape') cancel.current = true;
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    );
  }

  return (
    <span
      className="terminal-title"
      title={t('terminal.renameHint')}
      onDoubleClick={() => {
        onEditStart?.();
        setEditing(true);
      }}
    >
      {name}
      {cwd && <span className="terminal-folder" title={cwd}> · {baseName(cwd)}</span>}
    </span>
  );
}
