import { useState } from 'react';
import { ArrowRight, Send, Trash2, X } from 'lucide-react';
import useT from '../hooks/useT.js';

const MAX_MESSAGE = 20000; // comme electron/linkRelay.cjs

// Un message d'un lien qui n'est pas encore remis (PLAN.md §7, 3.1) : brouillon à valider (modifiable),
// message en file (annulable) ou en cours de collage (plus rappelable).
export default function PendingMessage({ item, onFocus }) {
  const t = useT();
  const [text, setText] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (result?.error) setError(result.error);
    } catch {
      setError(t('pending.failed'));
    } finally {
      setBusy(false);
    }
  };
  const name = (id, label) =>
    id && onFocus ? (
      <button className="log-case" onClick={() => onFocus(id)} title={t('log.focus')}>{label}</button>
    ) : (
      <span className="log-case">{label}</span>
    );

  return (
    <div className={`pending-message ${item.state}`}>
      <div className="log-entry-head">
        <span className="log-kind">{t(`pending.state.${item.state}`)}</span>
        <span className="muted">{t(`log.kind.${item.kind}`)}</span>
        {item.from && name(item.from, item.fromName)}
        <ArrowRight size={11} className="log-arrow" />
        {name(item.to, item.toName)}
      </div>
      {item.state === 'draft' ? (
        <textarea
          className="thin-scrollbar nowheel"
          rows={4}
          value={text}
          maxLength={MAX_MESSAGE}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('pending.edit')}
        />
      ) : (
        <div className="log-text">{item.text}</div>
      )}
      {error && <p className="link-warning" role="alert">{error}</p>}
      <div className="pending-actions">
        {item.state === 'draft' && (
          <>
            <button className="text-button primary" disabled={busy || !text.trim()} onClick={() => run(() => window.relay.approve(item.qid, text))}>
              <Send size={13} />
              {t('pending.send')}
            </button>
            <button className="text-button danger" disabled={busy} onClick={() => run(() => window.relay.discard(item.qid))}>
              <Trash2 size={13} />
              {t('pending.discard')}
            </button>
          </>
        )}
        {item.state === 'queued' && (
          <button className="text-button danger" disabled={busy} onClick={() => run(() => window.relay.cancel(item.qid))}>
            <X size={13} />
            {t('pending.cancel')}
          </button>
        )}
        {item.state === 'delivering' && <span className="hint">{t('pending.deliveringHint')}</span>}
      </div>
    </div>
  );
}
