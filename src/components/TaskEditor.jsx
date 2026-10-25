import { useEffect, useRef, useState } from 'react';
import { FileDiff } from 'lucide-react';
import useT from '../hooks/useT.js';

export default function TaskEditor({ task, items, owners, onSaved, onRemoved, onFocus, onDiff }) {
  const t = useT();
  const [title, setTitle] = useState(task?.title ?? '');
  const [owner, setOwner] = useState(task?.owner ?? '');
  const [dependencies, setDependencies] = useState(task?.dependencies ?? []);
  const [result, setResult] = useState(task?.result ?? '');
  const [reason, setReason] = useState(task?.reason ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => setResult(task?.result ?? ''), [task?.result]);
  useEffect(() => setReason(task?.reason ?? ''), [task?.reason]);
  const perform = async (fn) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fn();
      if (response.error) setError(response.error);
      else if (response.value?.id) onSaved(response.value);
    } catch { setError(t('tasks.failed')); }
    finally { lock.current = false; setBusy(false); }
  };
  const editableAssignment = !task || (!task.startedAt && task.source === 'manual' && ['todo', 'blocked'].includes(task.state));
  const patch = { title, result, reason, ...(editableAssignment ? { owner: owner || null, dependencies } : {}) };
  const save = () => task ? window.tasks.update(task.id, patch) : window.tasks.create({ title, owner: owner || null, dependencies });
  const action = (name) => perform(async () => {
    const saved = await save();
    if (saved.error) return saved;
    return name === 'start' ? window.tasks.start(task.id) : window.tasks.action(task.id, name);
  });

  return <div className="task-editor settings-form">
    <label className="field"><span>{t('tasks.name')}</span><input className="task-title-input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label className="field"><span>{t('tasks.owner')}</span><select className="task-owner-input" disabled={!editableAssignment} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">{t('tasks.unassigned')}</option>{task?.owner && !owners.some((row) => row.id === task.owner) && <option value={task.owner}>{task.ownerName} — {t('tasks.ownerGone')}</option>}{owners.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.boardName})</option>)}</select></label>
    <fieldset className="task-dependencies" disabled={!editableAssignment}><legend>{t('tasks.dependencies')}</legend><div className="thin-scrollbar">{items.filter((row) => row.id !== task?.id).map((row) => <label className="checkbox" key={row.id}><input type="checkbox" checked={dependencies.includes(row.id)} onChange={(e) => setDependencies((values) => e.target.checked ? [...values, row.id] : values.filter((id) => id !== row.id))} />{row.title}<span className="hint">{t(`tasks.state.${row.state}`)}</span></label>)}{!items.some((row) => row.id !== task?.id) && <span className="hint">{t('tasks.noDependencies')}</span>}</div></fieldset>
    {task?.waitingFor.length > 0 && <p className="link-warning">{t('tasks.waitingFor', { names: task.waitingFor.map((id) => items.find((row) => row.id === id)?.title || id).join(', ') })}</p>}
    {task && <p className={`task-state ${task.state}`}>{t(`tasks.state.${task.state}`)} · #{task.id}</p>}
    <p className="hint">{t(task?.source === 'manual' || !task ? 'tasks.manualHint' : 'tasks.automaticHint')}</p>
    {task && <>
      <label className="field"><span>{t('tasks.result')}</span><textarea className="task-result-input" rows={5} maxLength={20000} value={result} onChange={(e) => setResult(e.target.value)} /></label>
      <label className="field"><span>{t('tasks.reason')}</span><textarea rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <p className="hint">{t('tasks.baselineHint')}</p>
      {task.baseline && <p className="hint">{t(`tasks.baseline.${task.baseline.state}`)}</p>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-actions">
      <button className="text-button primary" disabled={busy || !title.trim()} onClick={() => perform(save)}>{t(task ? 'tasks.save' : 'tasks.create')}</button>
      {task && <>
        {['todo', 'blocked'].includes(task.state) && task.source === 'manual' && <button className="text-button" disabled={busy || !owner || task.waitingFor.length > 0} onClick={() => action('start')}>{t('tasks.start')}</button>}
        {task.state === 'running' && <button className="text-button" disabled={busy} onClick={() => action('respond')}>{t('tasks.respond')}</button>}
        {task.state === 'responded' && <button className="text-button primary" disabled={busy || !result.trim()} onClick={() => action('validate')}>{t('tasks.validate')}</button>}
        {!['validated', 'cancelled', 'failed', 'interrupted'].includes(task.state) && <>
          {(task.source === 'manual' || ['running', 'responded'].includes(task.state)) && <button className="text-button danger" disabled={busy} onClick={() => action('fail')}>{t('tasks.fail')}</button>}
          <button className="text-button danger" disabled={busy} onClick={() => action('cancel')}>{t('tasks.cancel')}</button>
        </>}
        <button className="text-button" disabled={busy} onClick={() => onDiff(task)}><FileDiff size={14} />{t('tasks.diff')}</button>
        {owners.some((row) => row.id === task.owner) && <button className="text-button" onClick={() => onFocus(task.owner)}>{t('tasks.focus')}</button>}
        {!['review', 'queued', 'preparing', 'running'].includes(task.state) && <button className="text-button danger" disabled={busy} onClick={() => perform(async () => { const response = await window.tasks.remove(task.id); if (!response.error) onRemoved(); return response; })}>{t('tasks.remove')}</button>}
      </>}
    </div>
  </div>;
}
