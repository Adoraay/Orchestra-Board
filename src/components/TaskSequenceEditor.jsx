import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import useT from '../hooks/useT.js';

export const emptySequence = () => ({ title: '', afterAgent: null, steps: [{ target: '', prompt: '', includePrevious: false, approval: false }] });
export const sequenceTemplate = (task) => ({ title: task.title, afterAgent: task.afterAgent, steps: task.steps.map((step) => ({ ...step })) });

export default function TaskSequenceEditor({ draft, onChange, agents, disabled, run, onFocus }) {
  const t = useT();
  const patchStep = (index, patch) => onChange({ ...draft, steps: draft.steps.map((step, i) => i === index ? { ...step, ...patch } : step) });
  const move = (index, offset) => {
    const steps = [...draft.steps];
    [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]];
    if (!draft.afterAgent) steps[0] = { ...steps[0], includePrevious: false };
    onChange({ ...draft, steps });
  };
  const options = (value, immediate = false) => <>
    <option value="">{t(immediate ? 'sequences.immediately' : 'sequences.chooseAgent')}</option>
    {value && !agents.some((agent) => agent.id === value) && <option value={value}>{t('sequences.missingAgent')}</option>}
    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.boardName} · {t(agent.status === 'offline' ? 'sequences.offline' : `status.${agent.status}`)}</option>)}
  </>;
  return <div className="sequence-editor">
    <label className="field"><span>{t('sequences.name')}</span><input autoFocus value={draft.title} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder={t('sequences.namePlaceholder')} /></label>
    <label className="field"><span>{t('sequences.trigger')}</span><select disabled={disabled} value={draft.afterAgent || ''} onChange={(event) => onChange({ ...draft, afterAgent: event.target.value || null, steps: draft.steps.map((step, index) => index === 0 && !event.target.value ? { ...step, includePrevious: false } : step) })}>{options(draft.afterAgent, true)}</select></label>
    {draft.afterAgent && <p className="hint">{t('sequences.triggerHint')}</p>}
    {!agents.length && <p className="sequence-notice">{t('sequences.noAgents')}</p>}
    <div className="sequence-steps">
      {draft.steps.map((step, index) => {
        const done = run && index < run.index;
        const active = run && index === run.index && ['running', 'paused', 'approval'].includes(run.state);
        return <section className={`sequence-step ${done ? 'is-done' : ''} ${active ? 'is-current' : ''}`} key={index} aria-label={t('sequences.step', { n: index + 1 })}>
          <header className="sequence-step-header">
            <strong><span className="sequence-step-number">{index + 1}</span>{t('sequences.step', { n: index + 1 })}</strong>
            {done && <span className="sequence-state completed">{t('sequences.state.completed')}</span>}
            <div className="sequence-step-tools">
              {step.target && <button className="text-button" type="button" onClick={() => onFocus(step.target)}>{t('sequences.showAgent')}</button>}
              <button className="icon-button" type="button" disabled={disabled || index === 0} title={t('sequences.moveUp')} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
              <button className="icon-button" type="button" disabled={disabled || index === draft.steps.length - 1} title={t('sequences.moveDown')} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
              <button className="icon-button" type="button" disabled={disabled || draft.steps.length === 1} title={t('sequences.removeStep')} onClick={() => onChange({ ...draft, steps: draft.steps.filter((_, i) => i !== index).map((next, i) => i === 0 && !draft.afterAgent ? { ...next, includePrevious: false } : next) })}><Trash2 size={15} /></button>
            </div>
          </header>
          <label className="field"><span>{t('sequences.agent')}</span><select value={step.target} disabled={disabled} onChange={(event) => patchStep(index, { target: event.target.value })}>{options(step.target)}</select></label>
          <label className="field"><span>{t('sequences.prompt')}</span><textarea rows={4} value={step.prompt} maxLength={20000} disabled={disabled} placeholder={t('sequences.promptPlaceholder')} onChange={(event) => patchStep(index, { prompt: event.target.value })} /></label>
          <div className="sequence-step-options">
            {(index > 0 || draft.afterAgent) && <label><input type="checkbox" checked={step.includePrevious} disabled={disabled} onChange={(event) => patchStep(index, { includePrevious: event.target.checked })} />{t('sequences.includePrevious')}</label>}
            <label><input type="checkbox" checked={step.approval} disabled={disabled} onChange={(event) => patchStep(index, { approval: event.target.checked })} />{t('sequences.approval')}</label>
          </div>
          {run?.results?.[index] !== undefined && <details className="sequence-result"><summary>{t('sequences.response')}</summary><pre>{run.results[index] || t('sequences.emptyReply')}</pre></details>}
        </section>;
      })}
    </div>
    <button className="text-button sequence-add" disabled={disabled || draft.steps.length >= 50} onClick={() => onChange({ ...draft, steps: [...draft.steps, { target: draft.steps.at(-1)?.target || '', prompt: '', includePrevious: false, approval: false }] })}><Plus size={16} />{t('sequences.addStep')}</button>
  </div>;
}
