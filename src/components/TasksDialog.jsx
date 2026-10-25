import { useEffect, useState } from 'react';
import { ClipboardList, Plus, X } from 'lucide-react';
import TaskEditor from './TaskEditor.jsx';
import ChangesDialog from './ChangesDialog.jsx';
import useT from '../hooks/useT.js';

export default function TasksDialog({ boards, content, onFocus, onClose }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [diffTask, setDiffTask] = useState(null);
  useEffect(() => {
    let changed = false;
    let disposed = false;
    const adopt = (value) => { setItems(value.tasks ?? []); setError(value.error ?? ''); };
    const off = window.tasks.onChanged((value) => { changed = true; adopt(value); });
    window.tasks.list().then((result) => { if (!disposed && !changed) { if (result.error) setError(result.error); else adopt(result.value); } }).catch(() => setError(t('tasks.failed')));
    const key = (event) => { if (event.key === 'Escape' && !document.querySelector('.changes-modal')) onClose(); };
    window.addEventListener('keydown', key);
    return () => { disposed = true; off(); window.removeEventListener('keydown', key); };
  }, [onClose]);
  const owners = boards.flatMap((board) => (content[board.id]?.nodes ?? []).filter((n) => n.type === 'terminal').map((n) => ({ id: n.id, name: n.data.label || n.data.agentId, boardName: board.name })));
  const selectedTask = items.find((item) => item.id === selected);

  return <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal tasks-modal" role="dialog" aria-modal="true" aria-labelledby="tasks-title">
      <header className="modal-header"><h1 id="tasks-title"><ClipboardList size={18} /> {t('tasks.title')}</h1><button className="icon-button" title={t('common.close')} onClick={onClose}><X size={17} /></button></header>
      <div className="modal-body thin-scrollbar">
        <p className="hint">{t('tasks.hint')}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="tasks-layout">
          <div className="task-list thin-scrollbar">
            <button className="text-button primary" onClick={() => setSelected(null)}><Plus size={14} />{t('tasks.new')}</button>
            <label className="field"><span>{t('tasks.filter')}</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">{t('tasks.all')}</option>{['todo', 'blocked', 'review', 'queued', 'preparing', 'running', 'responded', 'validated', 'failed', 'cancelled', 'interrupted'].map((state) => <option key={state} value={state}>{t(`tasks.state.${state}`)}</option>)}</select></label>
            {items.filter((task) => !filter || task.state === filter).map((task) => <button key={task.id} className={`task-item ${selected === task.id ? 'active' : ''}`} onClick={() => setSelected(task.id)}>
              <strong>{task.title}</strong><span className={`task-state ${task.state}`}>{t(`tasks.state.${task.state}`)}</span><span className="hint">{task.ownerName || t('tasks.unassigned')} · #{task.id.slice(0, 8)}</span>
            </button>)}
            {!items.length && <p className="hint">{t('tasks.empty')}</p>}
          </div>
          <TaskEditor key={selectedTask?.id ?? 'new'} task={selectedTask} items={items} owners={owners} onSaved={(task) => setSelected(task.id)} onRemoved={() => setSelected(null)} onFocus={onFocus} onDiff={setDiffTask} />
        </div>
      </div>
    </div>
    {diffTask && <ChangesDialog taskId={diffTask.id} id={diffTask.owner} name={diffTask.title} onClose={() => setDiffTask(null)} />}
  </div>;
}
