import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileDiff, LocateFixed, Play, Save, Trash2, XCircle } from 'lucide-react';
import useT from '../hooks/useT.js';

const FINISHED = ['validated', 'cancelled', 'failed', 'interrupted'];
const ACTIVE = ['review', 'queued', 'preparing', 'running'];

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
  const manual = !task || task.source === 'manual';
  const editableAssignment = !task || (!task.startedAt && manual && ['todo', 'blocked'].includes(task.state));
  const sameDependencies = (task?.dependencies ?? []).length === dependencies.length && dependencies.every((id) => task.dependencies.includes(id));
  const dirty = task && (title !== task.title || result !== task.result || reason !== task.reason || (editableAssignment && (owner !== (task.owner ?? '') || !sameDependencies)));
  const patch = { title, result, reason, ...(editableAssignment ? { owner: owner || null, dependencies } : {}) };
  const save = () => task ? window.tasks.update(task.id, patch) : window.tasks.create({ title, owner: owner || null, dependencies });
  const action = (name) => perform(async () => {
    if (dirty) {
      const saved = await save();
      if (saved.error) return saved;
    }
    return name === 'start' ? window.tasks.start(task.id) : window.tasks.action(task.id, name);
  });
  const date = (value) => value ? new Date(value).toLocaleString(t.locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const ownerOption = owners.some((row) => row.id === task?.owner);
  const others = items.filter((row) => row.id !== task?.id);

  const assignment = <>
    <label className="field"><span>{t('tasks.owner')}</span><select className="task-owner-input" disabled={!editableAssignment} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">{t('tasks.unassigned')}</option>{task?.owner && !ownerOption && <option value={task.owner}>{task.ownerName} — {t('tasks.ownerGone')}</option>}{owners.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.boardName})</option>)}</select></label>
    <details className="task-more" open={dependencies.length > 0}>
      <summary>{t('tasks.dependencies')}</summary>
      <p className="hint">{t('tasks.dependenciesHint')}</p>
      <fieldset className="task-dependencies" disabled={!editableAssignment}><div className="thin-scrollbar">{others.map((row) => <label className="checkbox" key={row.id}><input type="checkbox" checked={dependencies.includes(row.id)} onChange={(e) => setDependencies((values) => e.target.checked ? [...values, row.id] : values.filter((id) => id !== row.id))} />{row.title}<span className={`task-state ${row.state}`}>{t(`tasks.state.${row.state}`)}</span></label>)}{!others.length && <span className="hint">{t('tasks.noDependencies')}</span>}</div></fieldset>
    </details>
  </>;

  if (!task) return <div className="task-editor settings-form">
    <h2 className="task-heading">{t('tasks.newTitle')}</h2>
    <p className="task-next">{t('tasks.newHint')}</p>
    <label className="field"><span>{t('tasks.name')}</span><input className="task-title-input" autoFocus maxLength={200} value={title} placeholder={t('tasks.namePlaceholder')} onChange={(e) => setTitle(e.target.value)} /></label>
    {assignment}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-actions">
      <button className="text-button primary" disabled={busy || !title.trim()} onClick={() => perform(save)}>{t('tasks.create')}</button>
    </div>
  </div>;

  const waiting = task.waitingFor.map((id) => items.find((row) => row.id === id)?.title || id).join(', ');
  return <div className="task-editor settings-form">
    <input className="task-title-input task-heading" aria-label={t('tasks.name')} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
    <div className={`task-status ${task.state}`} role="status">
      <span className={`task-state ${task.state}`}><span className="task-dot" />{t(`tasks.state.${task.state}`)}</span>
      <p className="task-next">{task.state === 'blocked' ? t('tasks.next.blocked', { names: waiting }) : t(`tasks.next.${task.state}${task.state === 'running' && manual ? 'Manual' : ''}`)}</p>
      {task.state === 'failed' && task.reason && <p className="task-next">{task.reason}</p>}
    </div>

    <dl className="task-facts">
      <div><dt>{t('tasks.from')}</dt><dd>{manual ? t('tasks.you') : task.fromName || '—'}</dd></div>
      <div><dt>{t('tasks.to')}</dt><dd>{task.ownerName || t('tasks.unassigned')}{task.owner && !ownerOption && <span className="hint"> · {t('tasks.ownerGone')}</span>}</dd></div>
      <div><dt>{t('tasks.type')}</dt><dd>{t(`tasks.source.${task.source}`)}</dd></div>
      <div><dt>{t('tasks.created')}</dt><dd>{date(task.createdAt)}</dd></div>
      {task.startedAt && <div><dt>{t('tasks.started')}</dt><dd>{date(task.startedAt)}</dd></div>}
    </dl>

    {editableAssignment && assignment}

    {task.prompt && <section className="task-block"><h3>{t('tasks.prompt')}</h3><pre className="thin-scrollbar">{task.prompt}</pre></section>}
    <label className="field"><span>{t(manual ? 'tasks.resultManual' : 'tasks.result')}</span><textarea className="task-result-input" rows={6} maxLength={20000} value={result} placeholder={t('tasks.resultPlaceholder')} onChange={(e) => setResult(e.target.value)} /></label>

    <details className="task-more" open={Boolean(task.reason) && task.state !== 'failed'}>
      <summary>{t('tasks.reason')}</summary>
      <textarea rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
    </details>

    <section className="task-block">
      <h3>{t('tasks.files')}</h3>
      <p className="hint">{task.baseline ? t(`tasks.baseline.${task.baseline.state}`) : t('tasks.baseline.none')}</p>
      <div className="task-row">
        <button className="text-button" disabled={busy} title={t('tasks.baselineHint')} onClick={() => onDiff(task)}><FileDiff size={14} />{t('tasks.diff')}</button>
        {ownerOption && <button className="text-button" onClick={() => onFocus(task.owner)}><LocateFixed size={14} />{t('tasks.focus')}</button>}
      </div>
    </section>

    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="task-actions">
      {['todo', 'blocked'].includes(task.state) && manual && <button className="text-button primary" disabled={busy || !owner || task.waitingFor.length > 0} title={!owner ? t('tasks.chooseOwner') : undefined} onClick={() => action('start')}><Play size={14} />{t('tasks.start')}</button>}
      {task.state === 'running' && <button className="text-button" disabled={busy} onClick={() => action('respond')}><ArrowRight size={14} />{t('tasks.respond')}</button>}
      {task.state === 'responded' && <button className="text-button primary" disabled={busy || !result.trim()} onClick={() => action('validate')}><CheckCircle2 size={14} />{t('tasks.validate')}</button>}
      {dirty && <button className="text-button" disabled={busy || !title.trim()} onClick={() => perform(save)}><Save size={14} />{t('tasks.save')}</button>}
      <span className="task-actions-spacer" />
      {!FINISHED.includes(task.state) && <>
        {(manual || ['running', 'responded'].includes(task.state)) && <button className="text-button danger" disabled={busy} onClick={() => action('fail')}><XCircle size={14} />{t('tasks.fail')}</button>}
        <button className="text-button danger" disabled={busy} onClick={() => action('cancel')}>{t('tasks.cancel')}</button>
      </>}
      {!ACTIVE.includes(task.state) && <button className="icon-button" disabled={busy} title={t('tasks.remove')} onClick={() => perform(async () => { const response = await window.tasks.remove(task.id); if (!response.error) onRemoved(); return response; })}><Trash2 size={15} /></button>}
    </div>
  </div>;
}
