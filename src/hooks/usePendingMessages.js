import { useEffect, useState } from 'react';

// Messages des liens à valider (brouillons), en file ou en cours de collage, tenus à jour par Node.
export default function usePendingMessages() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let changed = false;
    let disposed = false;
    const off = window.relay.onPending((next) => { changed = true; setList(next); });
    window.relay.pending().then((next) => { if (!disposed && !changed) setList(next); });
    return () => { disposed = true; off(); };
  }, []);
  return list;
}
