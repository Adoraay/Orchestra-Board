import { useEffect, useRef, useState } from 'react';

const MAX_ENTRIES = 500; // comme electron/activityLog.cjs
const views = new Set(); // Node ne prévient pas d'un effacement : la languette et les cases se tiennent à jour ici

// Entrées du journal, gardées à jour. onEntry : appelé à chaque nouvelle entrée.
export default function useActivityLog(onEntry) {
  const [entries, setEntries] = useState([]);
  const onEntryRef = useRef(onEntry);
  onEntryRef.current = onEntry;

  useEffect(() => {
    let cancelled = false;
    views.add(setEntries);
    window.activityLog.get().then((list) => !cancelled && setEntries(list));
    const off = window.activityLog.onEntry((entry) => {
      setEntries((list) => [...list.slice(-(MAX_ENTRIES - 1)), entry]);
      onEntryRef.current?.(entry);
    });
    return () => {
      cancelled = true;
      views.delete(setEntries);
      off();
    };
  }, []);

  const clear = async () => {
    const list = await window.activityLog.clear();
    views.forEach((update) => update(list));
  };

  return { entries, clear };
}
