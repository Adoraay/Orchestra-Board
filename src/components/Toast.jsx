import { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';

const DURATION = 3500; // ms

// Petit message discret en bas de la map, qui disparaît tout seul.
export default function Toast({ text, onDone }) {
  // Ref : un nouveau onDone à chaque rendu du parent ne doit pas relancer le minuteur.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), DURATION);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="toast" role="status">
      <Info size={14} />
      {text}
    </div>
  );
}
