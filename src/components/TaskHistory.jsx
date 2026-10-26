import { useEffect, useState } from 'react';
import { History, Plus } from 'lucide-react';
import TaskEditor from './TaskEditor.jsx';
import useT from '../hooks/useT.js';

// Regroupe les états du suivi en quelques filtres lisibles.
const GROUPS = {
  active: ['todo', 'blocked', 'review', 'queued', 'preparing', 'running'],
  review: ['responded'],
  done: ['validated'],
  stopped: ['failed', 'cancelled', 'interrupted'],
};

export default function TaskHistory({ boards, content, onFocus, onDiff }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    let changed = false;
    let disposed = false;
    const adopt = (value) => { setItems(value.tasks ?? []); setError(value.error ?? ''); };
    const off = window.tasks.onChanged((value) => { changed = true; adopt(value); });
    window.tasks.list().then((result) => { if (!disposed && !changed) { if (result.error) setError(result.error); else adopt(result.value); } }).catch(() => setError(t('tasks.failed')));
    return () => { disposed = true; off(); };
  }, []);
  const owners = boards.flatMap((board) => (content[board.id]?.nodes ?? []).filter((n) => n.type === 'terminal').map((n) => ({ id: n.id, name: n.data.label || n.data.agentId, boardName: board.name })));
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  const visible = filter === 'all' ? sorted : sorted.filter((task) => GROUPS[filter].includes(task.state));
  const current = creating ? null : items.find((item) => item.id === selected) ?? null;
  const time = (value) => new Date(value).toLocaleString(t.locale, { dateStyle: 'short', timeStyle: 'short' });

  return <div className="sequences-layout">
    <aside className="sequence-sidebar thin-scrollbar" aria-label={t('tasks.historyTab')}>
      <button className="text-button primary" onClick={() => { setCreating(true); setSelected(null); }}><Plus size={15} />{t('tasks.new')}</button>
      <div className="task-filters" role="group" aria-label={t('tasks.filter')}>
        {['all', ...Object.keys(GROUPS)].map((key) => {
          const count = key === 'all' ? items.length : items.filter((task) => GROUPS[key].includes(task.state)).length;
          return <button key={key} className={`task-filter ${filter === key ? 'active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(`tasks.filter.${key}`)}<span>{count}</span></button>;
        })}
      </div>
      {visible.map((task) => <button key={task.id} className={`task-item ${selected === task.id && !creating ? 'active' : ''}`} onClick={() => { setCreating(false); setSelected(task.id); }}>
        <strong>{task.title}</strong>
        <span className={`task-state ${task.state}`}><span className="task-dot" />{t(`tasks.state.${task.state}`)}</span>
        <small>{task.source === 'manual' ? task.ownerName || t('tasks.unassigned') : `${task.fromName || '?'} → ${task.ownerName || '?'}`} · {time(task.updatedAt)}</small>
      </button>)}
      {items.length > 0 && !visible.length && <p className="hint">{t('tasks.filterEmpty')}</p>}
    </aside>
    <div className="sequence-main thin-scrollbar">
      {error && <p className="form-error" role="alert">{error}</p>}
      {creating || current
        ? <TaskEditor key={current?.id ?? 'new'} task={current} items={items} owners={owners} onSaved={(task) => { setCreating(false); setSelected(task.id); }} onRemoved={() => setSelected(null)} onFocus={onFocus} onDiff={onDiff} />
        : <div className="task-empty">
          <History size={28} />
          <h2>{t(items.length ? 'tasks.pick' : 'tasks.emptyTitle')}</h2>
          <p>{t('tasks.explain1')}</p>
          <p>{t('tasks.explain2')}</p>
          <p>{t('tasks.explain3')}</p>
        </div>}
    </div>
  </div>;
}
