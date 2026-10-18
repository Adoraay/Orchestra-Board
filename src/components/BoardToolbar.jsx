import { MousePointer2, PenLine, Spline, StickyNote, Type } from 'lucide-react';

export const TOOLS = [
  { id: 'select', label: 'Sélection', key: 'V', icon: MousePointer2 },
  { id: 'pen', label: 'Stylo', key: 'P', icon: PenLine },
  { id: 'note', label: 'Post-it', key: 'N', icon: StickyNote },
  { id: 'text', label: 'Texte', key: 'T', icon: Type },
  { id: 'link', label: 'Lien', key: 'L', icon: Spline },
];

// Barre d'outils arrondie sur le bord gauche de la map (PLAN.md §3.8).
export default function BoardToolbar({ tool, onChange }) {
  return (
    <div className="board-toolbar" role="toolbar" aria-label="Outils du tableau" aria-orientation="vertical">
      {TOOLS.map(({ id, label, key, icon: Icon }) => (
        <button
          key={id}
          className={`tool-button ${tool === id ? 'active' : ''}`}
          aria-pressed={tool === id}
          aria-label={label}
          onClick={() => onChange(id)}
        >
          <Icon size={17} />
          <span className="tooltip" role="tooltip">
            {label}
            <kbd>{key}</kbd>
          </span>
        </button>
      ))}
    </div>
  );
}
