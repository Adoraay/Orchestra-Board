import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, StickyNote } from 'lucide-react';
import AgentLogo from './AgentLogo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';
import { displayPath } from '../lib/paths.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

const MAX_RESULTS = 30;
const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Recherche d'une case par son nom dans tous les tableaux (PLAN.md §7, 3.3) : Entrée ou clic ouvre son
// tableau et centre la map sur elle. Deux cases du même nom se distinguent par leur tableau et leur dossier.
export default function TileSearch({ boards, content, activeId, onFocus, onClose }) {
  const { agentById } = useSettings();
  const { homeDir } = useWorkspace();
  const t = useT();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const tiles = useMemo(
    () =>
      boards.flatMap((board) =>
        (content[board.id]?.nodes ?? [])
          .filter((n) => n.type === 'terminal' || n.type === 'note')
          .map((n) => {
            const agent = n.type === 'terminal' ? agentById(n.data.agentId) : null;
            const name = n.data.label || (agent ? agent.name : t('note.defaultName'));
            return { id: n.id, name, agent, board, dir: n.type === 'terminal' ? n.data.worktree ?? n.data.cwd : null };
          }),
      ),
    [boards, content, agentById, t],
  );

  const q = normalize(query.trim());
  const results = (q ? tiles.filter((tile) => normalize(tile.name).includes(q)) : tiles)
    // Le tableau ouvert d'abord, puis les noms qui commencent par la recherche.
    .sort((a, b) => (b.board.id === activeId) - (a.board.id === activeId) || normalize(b.name).startsWith(q) - normalize(a.name).startsWith(q))
    .slice(0, MAX_RESULTS);
  const current = Math.min(index, Math.max(0, results.length - 1));

  const choose = (tile) => {
    if (!tile) return;
    onFocus(tile.id);
    onClose();
  };

  return (
    <div className="search-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-palette" role="dialog" aria-label={t('search.title')}>
        <div className="search-field">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('search.placeholder')}
            aria-label={t('search.title')}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter') choose(results[current]);
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setIndex((current + step + results.length) % Math.max(1, results.length));
              }
            }}
          />
        </div>
        <ul className="search-results thin-scrollbar" role="listbox">
          {!results.length && <li className="hint search-empty">{q ? t('search.none') : t('search.noTiles')}</li>}
          {results.map((tile, i) => (
            <li key={tile.id} role="option" aria-selected={i === current}>
              <button className={`search-result ${i === current ? 'active' : ''}`} onClick={() => choose(tile)} onPointerEnter={() => setIndex(i)}>
                {tile.agent ? <AgentLogo agent={tile.agent} size={16} /> : <StickyNote size={16} />}
                <span className="search-name">{tile.name}</span>
                {tile.dir && <span className="search-dir muted">{displayPath(tile.dir, homeDir)}</span>}
                <span className={`search-board ${tile.board.id === activeId ? 'active' : ''}`}>{tile.board.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
