import { useEffect, useRef, useState } from 'react';
import { GitBranch, Search } from 'lucide-react';
import useT from '../hooks/useT.js';

// Barre des branches sous une case (PLAN.md §3.10) : locales puis distantes, l'actuelle en orange.
// La liste locale s'affiche tout de suite, puis elle est mise à jour après un fetch.
export default function BranchBar({ dir, busy, name, onClose, onSwitched }) {
  const t = useT();
  const [branches, setBranches] = useState(null); // { current, local, remote }
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null); // branche à confirmer : l'agent travaille
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  const alive = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    alive.current = true;
    const apply = (result) => {
      if (!alive.current) return;
      if (result.error) setError(result.error);
      else setBranches(result);
    };
    window.git.listBranches(dir, false).then((result) => {
      apply(result);
      if (!result.error) window.git.listBranches(dir, true).then(apply);
    });
    return () => {
      alive.current = false;
    };
  }, [dir]);

  // Clic à côté ou Échap : on ferme. En capture, car xterm et React Flow stoppent certains événements.
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onCloseRef.current();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  const switchTo = async (branch) => {
    setPending(null);
    setError(null);
    setCreating(true);
    const result = await window.git.ensureWorktree(dir, branch);
    if (!alive.current) return;
    setCreating(false);
    if (result.error) setError(result.error);
    else onSwitched(result.path, result.branch);
  };

  // Branche actuelle du dossier : rien à relancer, on la note seulement sur la case.
  const choose = (branch) => {
    if (branch === branches.current) onSwitched(dir, branch);
    else if (busy) setPending(branch);
    else switchTo(branch);
  };

  const filter = query.trim().toLowerCase();
  const matches = (b) => b.toLowerCase().includes(filter);
  const local = branches?.local.filter(matches) ?? [];
  const remote = branches?.remote.filter(matches) ?? [];

  const row = (branch, isRemote) => (
    <li key={branch}>
      <button
        className={`branch-row ${isRemote ? 'remote' : ''} ${branch === branches.current ? 'current' : ''}`}
        onClick={() => choose(branch)}
      >
        <GitBranch size={13} />
        <span className="branch-name">{branch}</span>
      </button>
    </li>
  );

  return (
    <div ref={ref} className="branch-bar nodrag nowheel nopan">
      <label className="branch-search">
        <Search size={13} />
        <input
          autoFocus
          value={query}
          placeholder={t('branch.search')}
          disabled={creating}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation(); // V, P, Suppr… ne doivent pas déclencher les raccourcis du tableau
            const first = local[0] ?? remote[0];
            if (e.key === 'Enter' && first && !pending) choose(first);
          }}
        />
      </label>

      {error && <p className="branch-message error">{error}</p>}
      {creating && <p className="branch-message">{t('branch.preparing')}</p>}
      {!branches && !error && <p className="branch-message">{t('branch.loading')}</p>}

      {pending ? (
        <div className="branch-confirm">
          {t('branch.confirm', { name, branch: pending })}
          <button className="tab-confirm danger" onClick={() => switchTo(pending)}>{t('common.restart')}</button>
          <button className="tab-confirm" onClick={() => setPending(null)}>{t('common.cancel')}</button>
        </div>
      ) : (
        branches && !creating && (
          <ul className="branch-list thin-scrollbar">
            {local.map((b) => row(b, false))}
            {remote.map((b) => row(b, true))}
            {!local.length && !remote.length && <li className="branch-message">{t('branch.none')}</li>}
          </ul>
        )
      )}
    </div>
  );
}
