import { useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import useT from '../hooks/useT.js';

// Une validation à la fois : toujours le plus ancien brouillon de ce lien, avec sa destination.
export default function LinkReview({ draft, count }) {
  const t = useT();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (result?.error) setError(result.error);
    } catch {
      setError(t('pending.failed'));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="link-review-controls" onClick={(e) => e.stopPropagation()}>
      {count > 1 && <span className="hint">{t('pending.title', { n: count })}</span>}
      <span className="link-review-preview">{draft.text.slice(0, 400)}{draft.text.length > 400 ? '…' : ''}</span>
      {error && <span className="link-warning" role="alert">{error}</span>}
      <div className="pending-actions">
        <button className="text-button primary" disabled={busy} onClick={() => run(() => window.relay.approve(draft.qid, draft.text))}>
          <Send size={13} />{t('pending.send')}
        </button>
        <button className="text-button danger" disabled={busy} onClick={() => run(() => window.relay.discard(draft.qid))}>
          <Trash2 size={13} />{t('pending.discard')}
        </button>
      </div>
    </div>
  );
}
