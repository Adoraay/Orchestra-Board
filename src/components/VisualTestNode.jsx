import { useEffect, useState } from 'react';
import { NodeResizer, useReactFlow } from '@xyflow/react';
import { MonitorCheck, Play, Plus, X } from 'lucide-react';
import useT from '../hooks/useT.js';

const ACTIONS = ['click', 'fill', 'visible', 'text'];
const MAX_STEPS = 12;

function TestResult({ result, t }) {
  const { failure, detail, failedStep, status, expectedStatus, duration, errors, network, screenshot, finishedAt, url } = result;
  return (
    <section className="visual-test-result" aria-label={t('visualTest.lastRun')}>
      <div className="visual-test-summary" role="status">
        <strong className={failure ? 'visual-test-error' : 'visual-test-success'}>
          {t(failure ? 'visualTest.failed' : 'visualTest.passed')}
        </strong>
        {status != null && <span>HTTP {status}</span>}
        <time dateTime={new Date(finishedAt).toISOString()}>{new Date(finishedAt).toLocaleString()}</time>
        <span>{(duration / 1000).toFixed(1)} s</span>
      </div>
      <span className="visual-test-url" title={url}>{url}</span>
      {failure && <p className="visual-test-error">
        {t(`visualTest.failure.${failure}`, { status: status ?? '—', expectedStatus, step: failedStep ?? '—' })}
        {detail && <small>{detail}</small>}
      </p>}
      {screenshot && (
        <a className="visual-test-evidence" href={screenshot} download="visual-test.jpg" title={t('visualTest.download')}>
          <img src={screenshot} alt={t('visualTest.screenshot')} loading="lazy" draggable={false} />
        </a>
      )}
      {!!errors.length && <details>
        <summary>{t('visualTest.console', { count: errors.length })}</summary>
        <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
      </details>}
      {!!network.length && <details>
        <summary>{t('visualTest.network', { count: network.length })}</summary>
        <ul>{network.map((entry, index) => <li key={index}>
          <code>{entry.status ?? '—'} {entry.method}</code> {entry.url} {entry.failure}
        </li>)}</ul>
      </details>}
    </section>
  );
}

export default function VisualTestNode({ id, data, selected }) {
  const t = useT();
  const { updateNodeData } = useReactFlow();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const { url = '', expectedStatus, failOnConsole = true, steps = [], lastResult } = data;

  useEffect(() => {
    let disposed = false;
    let finished = false;
    const unsubscribe = window.visualTests.onFinished((nodeId) => {
      if (id !== nodeId) return;
      finished = true;
      setRunning(false);
    });
    window.visualTests.isRunning(id).then((busy) => {
      if (!disposed && !finished) setRunning(busy);
    }).catch(() => {});
    return () => { disposed = true; unsubscribe(); };
  }, [id]);

  const update = (patch) => { setError(''); updateNodeData(id, patch); };
  const updateStep = (index, patch) => update({ steps: steps.map((step, i) => i === index ? { ...step, ...patch } : step) });
  const addStep = () => update({ steps: [...steps, { id: crypto.randomUUID(), action: 'visible', target: '', value: '' }] });

  async function run(event) {
    event.preventDefault();
    if (running) return;
    setError('');
    setRunning(true);
    try {
      const started = await window.visualTests.start(id, { url, expectedStatus, failOnConsole, steps });
      if (started.running) return;
      setError(started.error);
    } catch {
      setError('unavailable');
    }
    setRunning(false);
  }

  return (
    <>
      <NodeResizer minWidth={420} minHeight={320} isVisible={selected} handleClassName="resize-handle" lineClassName="resize-line" />
      <div className={`visual-test-node panel-node ${selected ? 'selected' : ''}`}>
        <header className="visual-test-header">
          <MonitorCheck size={17} aria-hidden="true" />
          <h2>{t('tool.visualTest')}</h2>
          {running && <span role="status">{t('visualTest.running')}</span>}
        </header>
        <div className="visual-test-content nodrag nopan nowheel thin-scrollbar">
          <form onSubmit={run} noValidate>
            <details className="visual-test-setup" open={!lastResult || Boolean(error)}>
              <summary>{t('visualTest.setup')}</summary>
              <fieldset disabled={running}>
                <div className="visual-test-inputs">
                  <label>{t('visualTest.url')}
                    <input type="url" required value={url} maxLength={2048} placeholder="http://localhost:3000" onChange={(event) => update({ url: event.target.value })} />
                  </label>
                  <label>{t('visualTest.status')}
                    <input type="number" min={100} max={599} placeholder="200" value={expectedStatus ?? ''} onChange={(event) => update({ expectedStatus: event.target.value === '' ? null : event.target.valueAsNumber })} />
                  </label>
                </div>
                <label className="visual-test-check">
                  <input type="checkbox" checked={failOnConsole} onChange={(event) => update({ failOnConsole: event.target.checked })} />
                  {t('visualTest.failOnConsole')}
                </label>
                <ol className="visual-test-steps">
                  {steps.map((step, index) => (
                    <li key={`${step.id}-${index}`}>
                      <div className="visual-test-step">
                        <select aria-label={t('visualTest.action', { step: index + 1 })} value={step.action} onChange={(event) => updateStep(index, { action: event.target.value })}>
                          {ACTIONS.map((action) => <option key={action} value={action}>{t(`visualTest.action.${action}`)}</option>)}
                        </select>
                        <input aria-label={t('visualTest.target', { step: index + 1 })} placeholder="role:button:Continue" required maxLength={512} value={step.target} onChange={(event) => updateStep(index, { target: event.target.value })} />
                        <button type="button" className="icon-button" aria-label={t('visualTest.removeStep', { step: index + 1 })} onClick={() => update({ steps: steps.filter((_step, i) => i !== index) })}>
                          <X size={15} aria-hidden="true" />
                        </button>
                      </div>
                      {['fill', 'text'].includes(step.action) && (
                        <input className="visual-test-value" aria-label={t('visualTest.value', { step: index + 1 })} placeholder={t('visualTest.valuePlaceholder')} required={step.action === 'text'} maxLength={1000} value={step.value} onChange={(event) => updateStep(index, { value: event.target.value })} />
                      )}
                    </li>
                  ))}
                </ol>
                {!!steps.length && <small className="visual-test-help">{t('visualTest.targetHelp')}</small>}
                <button type="button" className="text-button" onClick={addStep} disabled={steps.length >= MAX_STEPS}>
                  <Plus size={15} aria-hidden="true" /> {t('visualTest.addStep')}
                </button>
              </fieldset>
            </details>
            {error && <p className="visual-test-error" role="alert">{t(`visualTest.failure.${error}`)}</p>}
            {running ? (
              <button type="button" className="text-button" onClick={() => window.visualTests.cancel(id)}>{t('common.cancel')}</button>
            ) : (
              <button type="submit" className="text-button primary">
                <Play size={15} aria-hidden="true" /> {t('visualTest.run')}
              </button>
            )}
          </form>
          {lastResult && <TestResult result={lastResult} t={t} />}
        </div>
      </div>
    </>
  );
}
