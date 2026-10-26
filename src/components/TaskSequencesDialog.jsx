import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Copy, Pause, Play, Plus, Save, Square, Trash2, X } from 'lucide-react';
import TaskSequenceEditor, { emptySequence, sequenceTemplate } from './TaskSequenceEditor.jsx';
import useT from '../hooks/useT.js';

const activeStates = ['running', 'paused', 'approval'];

export default function TaskSequencesDialog({ onClose, onFocus, onHistory }) {
  const t = useT();
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(emptySequence);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const modal = useRef(null);
  const task = tasks.find((item) => item.id === selected);
  const run = task?.run;
  const active = activeStates.includes(run?.state);
  const dirty = JSON.stringify(draft) !== JSON.stringify(task ? sequenceTemplate(task) : emptySequence());
  const valid = draft.title.trim() && draft.steps.length && draft.steps.every((step) => step.target && step.prompt.trim());
  const disabled = busy || active || !loaded || Boolean(storageError);

  useEffect(() => {
    let disposed = false;
    let changed = false;
    let agentsChanged = false;
    const adopt = (value) => { setTasks(value.tasks); setStorageError(value.error || ''); };
    const off = window.taskSequences.onChanged((value) => { changed = true; adopt(value); });
    const offAgents = window.taskSequences.onAgents((value) => { agentsChanged = true; setAgents(value); });
    window.taskSequences.list().then((value) => {
      if (disposed) return;
      if (!changed) adopt(value);
      if (!agentsChanged) setAgents(value.agents);
      setLoaded(true);
    }).catch(() => { if (!disposed) setError(t('sequences.failed')); });
    return () => { disposed = true; off(); offAgents(); };
  }, []);

  const choose = (id) => {
    const next = tasks.find((item) => item.id === id);
    setSelected(next?.id || null);
    setDraft(next ? sequenceTemplate(next) : emptySequence());
    setError(''); setPending(null);
  };
  const request = (next) => {
    if (busy) return;
    if (dirty) setPending(next);
    else if (next.kind === 'close') onClose();
    else choose(next.id);
  };
  async function execute(fn) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await fn();
      if (result?.error) throw new Error(result.error);
      return result?.value;
    } catch (err) { setError(err.message || t('sequences.failed')); }
    finally { setBusy(false); }
  }
  const save = () => execute(async () => {
    const result = await window.taskSequences.save(draft, selected);
    if (!result.error) { setSelected(result.value.id); setDraft(sequenceTemplate(result.value)); }
    return result;
  });
  const start = () => execute(() => window.taskSequences.start(selected));
  const action = (name) => execute(() => window.taskSequences.action(selected, name));
  const confirm = async () => {
    const next = pending; setPending(null);
    if (next.kind === 'close') onClose();
    else if (next.kind === 'delete') await execute(async () => {
      const result = await window.taskSequences.remove(selected);
      if (!result.error) choose(null);
      return result;
    });
    else if (next.kind === 'restart') await start();
    else if (next.kind === 'focus') onFocus(next.id);
    else choose(next.id);
  };
  const keyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (pending) setPending(null); else request({ kind: 'close' }); }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')];
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
    if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
  };
  const focus = (id) => { if (dirty) setPending({ kind: 'focus', id }); else onFocus(id); };

  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) request({ kind: 'close' }); }}>
    <div ref={modal} className="modal sequences-modal" role="dialog" aria-modal="true" aria-labelledby="sequences-title" onKeyDown={keyDown}>
      <header className="modal-header"><h1 id="sequences-title"><ClipboardList size={19} />{t('sequences.title')}</h1><div className="sequence-header-actions">{onHistory && <button className="text-button sequence-history" disabled={busy || dirty} onClick={onHistory}>{t('sequences.trackingHistory')}</button>}<button className="icon-button" title={t('common.close')} onClick={() => request({ kind: 'close' })}><X size={18} /></button></div></header>
      <p className="sequence-intro">{t('sequences.intro')}</p>
      {(error || storageError) && <p className="form-error sequence-message" role="alert">{storageError || error}</p>}
      {pending && <div className="sequence-confirm" role="alert"><span>{t(pending.kind === 'delete' ? 'sequences.deleteConfirm' : pending.kind === 'restart' ? 'sequences.restartConfirm' : 'sequences.discardConfirm')}</span><button className="text-button" onClick={() => setPending(null)}>{t('common.cancel')}</button><button className="text-button danger" onClick={confirm}>{t(pending.kind === 'delete' ? 'common.delete' : pending.kind === 'restart' ? 'sequences.restart' : 'sequences.discard')}</button></div>}
      <div className="sequences-layout">
        <aside className="sequence-sidebar thin-scrollbar" aria-label={t('sequences.saved')}>
          <button className="text-button primary" disabled={busy || !loaded || Boolean(storageError)} onClick={() => request({ kind: 'select', id: null })}><Plus size={15} />{t('sequences.new')}</button>
          {!loaded && <p className="hint">{t('common.loading')}</p>}
          {loaded && !tasks.length && <p className="hint">{t('sequences.empty')}</p>}
          {tasks.map((item) => <button className={`sequence-list-item ${selected === item.id ? 'selected' : ''}`} aria-pressed={selected === item.id} key={item.id} disabled={busy} onClick={() => { if (item.id !== selected) request({ kind: 'select', id: item.id }); }}>
            <strong>{item.title}</strong><span className={`sequence-state ${item.run?.state || 'ready'}`}>{t(`sequences.state.${item.run?.state || 'ready'}`)}</span><small>{t('sequences.progress', { done: item.run?.index || 0, total: item.steps.length })}</small>
          </button>)}
        </aside>
        <div className="sequence-main thin-scrollbar">
          <div className="sequence-actions">
            <button className="text-button primary" disabled={disabled || !valid || !dirty && Boolean(selected)} onClick={save}><Save size={15} />{t('common.save')}</button>
            {selected && !active && <button className="text-button" disabled={busy || dirty || Boolean(storageError)} onClick={() => run?.state === 'interrupted' ? setPending({ kind: 'restart' }) : start()}><Play size={15} />{t(run ? 'sequences.restart' : 'sequences.start')}</button>}
            {run?.state === 'running' && <button className="text-button" disabled={busy || Boolean(storageError)} onClick={() => action('pause')}><Pause size={15} />{t('sequences.pause')}</button>}
            {run?.state === 'paused' && <button className="text-button primary" disabled={busy || Boolean(storageError)} onClick={() => action('resume')}><Play size={15} />{t('sequences.resume')}</button>}
            {run?.state === 'approval' && <button className="text-button primary" disabled={busy || Boolean(storageError)} onClick={() => action('approve')}><Play size={15} />{t('sequences.approve')}</button>}
            {active && <button className="text-button danger" disabled={busy || Boolean(storageError)} onClick={() => action('stop')}><Square size={15} />{t('sequences.stop')}</button>}
            {selected && <button className="text-button" disabled={busy || dirty || Boolean(storageError)} onClick={() => { setSelected(null); setDraft({ ...sequenceTemplate(task), title: t('sequences.copyName', { name: task.title }).slice(0, 120) }); }}><Copy size={15} />{t('sequences.duplicate')}</button>}
            {selected && <button className="icon-button" disabled={disabled} title={t('common.delete')} onClick={() => setPending({ kind: 'delete' })}><Trash2 size={16} /></button>}
          </div>
          {run && <div className={`sequence-run ${run.state}`} role="status" aria-live="polite">
            <strong>{t(`sequences.state.${run.state}`)} · {t('sequences.progress', { done: run.index, total: task.steps.length })}</strong>
            {active && <span>{t(run.state === 'approval' ? 'sequences.approvalHint' : `sequences.phase.${run.phase}`)}</span>}
            {run.state === 'interrupted' && <span>{t('sequences.interruptedHint')}</span>}
            {run.error && <span className="form-error">{run.error}</span>}
          </div>}
          <TaskSequenceEditor draft={draft} onChange={(next) => { setDraft(next); setError(''); }} agents={agents} disabled={disabled} run={dirty ? null : run} onFocus={focus} />
          <p className="hint sequence-footnote">{t('sequences.footnote')}</p>
        </div>
      </div>
    </div>
  </div>;
}
