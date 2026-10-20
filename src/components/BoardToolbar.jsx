import { MousePointer2, PenLine, Spline, StickyNote, Type } from 'lucide-react';
import useT from '../hooks/useT.js';

// Nom de chaque outil dans src/locales (tool.<id>).
export const TOOLS = [
  { id: 'select', key: 'V', icon: MousePointer2 },
  { id: 'pen', key: 'P', icon: PenLine },
  { id: 'note', key: 'N', icon: StickyNote },
  { id: 'text', key: 'T', icon: Type },
  { id: 'link', key: 'L', icon: Spline },
];

// Barre d'outils arrondie sur le bord gauche de la map (PLAN.md §3.8).
export default function BoardToolbar({ tool, onChange }) {
  const t = useT();
  return (
    <div className="board-toolbar" role="toolbar" aria-label={t('toolbar.label')} aria-orientation="vertical">
      {TOOLS.map(({ id, key, icon: Icon }) => (
        <button
          key={id}
          data-tool={id}
          className={`tool-button ${tool === id ? 'active' : ''}`}
          aria-pressed={tool === id}
          aria-label={t(`tool.${id}`)}
          onClick={() => onChange(id)}
        >
          <Icon size={17} />
          <span className="tooltip" role="tooltip">
            {t(`tool.${id}`)}
            <kbd>{key}</kbd>
          </span>
        </button>
      ))}
    </div>
  );
}
