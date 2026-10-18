import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

const MAX_NAME = 40;

// Onglets des tableaux (pages) dans la barre du haut : clic = ouvrir, double-clic = renommer.
export default function BoardTabs({ boards, activeId, onSelect, onCreate, onRename, onDelete, agentCount }) {
  const [renaming, setRenaming] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const cancelRename = useRef(false); // Échap : le blur qui suit ne doit pas enregistrer

  const create = () => setRenaming(onCreate()); // nouveau tableau : on propose tout de suite de le nommer

  return (
    <nav className="board-tabs no-scrollbar" aria-label="Tableaux">
      {boards.map((board) => {
        const active = board.id === activeId;

        if (confirming === board.id) {
          const count = agentCount(board.id);
          return (
            <div key={board.id} className="board-tab confirming">
              <span>Supprimer{count ? ` et fermer ${count} agent${count > 1 ? 's' : ''}` : ''} ?</span>
              <button className="tab-confirm danger" onClick={() => { onDelete(board.id); setConfirming(null); }}>Oui</button>
              <button className="tab-confirm" onClick={() => setConfirming(null)}>Non</button>
            </div>
          );
        }

        if (renaming === board.id) {
          return (
            <input
              key={board.id}
              className="board-tab rename"
              defaultValue={board.name}
              maxLength={MAX_NAME}
              autoFocus
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && !cancelRename.current) onRename(board.id, name);
                cancelRename.current = false;
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelRename.current = true;
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
              }}
            />
          );
        }

        return (
          <div
            key={board.id}
            className={`board-tab ${active ? 'active' : ''}`}
            role="tab"
            aria-selected={active}
            title="Double-clic pour renommer"
            onClick={() => onSelect(board.id)}
            onDoubleClick={() => setRenaming(board.id)}
          >
            <span className="board-tab-name">{board.name}</span>
            {boards.length > 1 && (
              <button
                className="tab-close"
                title="Supprimer le tableau"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(board.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      <button className="icon-button tab-add" title="Nouveau tableau" onClick={create}>
        <Plus size={16} />
      </button>
    </nav>
  );
}
