import { useEffect, useState } from 'react';

const EMPTY = { history: [], running: false, live: '', pending: [] };

// Conversation du tableau avec le chef d'orchestre (PLAN.md §3.25) : historique, exécution en cours et texte
// en train d'arriver, actions proposées en attente de validation (aperçu), tenus à jour par Node (conductorSession.cjs).
export default function useConductorSession(boardId) {
  const [state, setState] = useState(EMPTY);
  useEffect(() => {
    let received = false;
    setState(EMPTY);
    const off = window.conductorSession.onEvent((id, event) => {
      if (id !== boardId) return;
      received = true;
      if (event.type === 'snapshot') setState({ history: event.history, running: event.running, live: event.live, pending: event.pending ?? [] });
      else if (event.type === 'delta') setState((s) => ({ ...s, live: s.live + event.text }));
      else if (event.type === 'pending') setState((s) => ({ ...s, pending: event.items }));
    });
    window.conductorSession.get(boardId).then((value) => { if (!received) setState(value); });
    return off;
  }, [boardId]);
  return state;
}
