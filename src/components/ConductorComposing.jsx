import { WandSparkles } from 'lucide-react';
import useT from '../hooks/useT.js';
import { toolLabel } from '../lib/conductorLabels.js';

// Encart « Composition de l'orchestre… » au centre de la partie visible de la map (sous la bulle si elle est
// ouverte), pendant que le chef d'orchestre construit : ses cases apparaissent ensemble une fois le plan fini.
// Derrière, une petite scène en boucle (cases qui apparaissent en pyramide, liens qui se tracent, post-it).
// Barre de titre de chaque petite case, qui apparaît juste après elle.
const TITLE_BARS = [{ x: 132, y: 34, delay: '0.25s' }, { x: 64, y: 134, delay: '0.7s' }, { x: 200, y: 134, delay: '1s' }];
const HEIGHT = 280; // = .conductor-composing (styles.css)
const GAP = 16; // px d'écart avec la bulle et le bas de la map

export default function ConductorComposing({ boardRef, action, nameOf }) {
  const t = useT();
  const board = boardRef.current?.getBoundingClientRect();
  const bar = boardRef.current?.querySelector('.conductor-bar')?.getBoundingClientRect();
  // Centré dans la place libre ; réduit s'il n'y tient pas, pour ne jamais passer sous la bulle ni sortir de la map.
  const above = board && bar ? bar.bottom - board.top : 0;
  const room = board ? board.height - above - 2 * GAP : HEIGHT;
  const scale = Math.max(0.5, Math.min(1, room / HEIGHT));
  const style = board ? { top: `${above + (board.height - above) / 2}px`, transform: `translate(-50%, -50%) scale(${scale})` } : { top: '50%' };
  return (
    <div className="conductor-composing" role="status" style={style}>
      <svg className="composing-scene" viewBox="0 0 320 200" aria-hidden="true">
        <path className="composing-link" style={{ animationDelay: '1.1s' }} d="M160 66 C160 92 92 96 92 124" />
        <path className="composing-link" style={{ animationDelay: '1.3s' }} d="M160 66 C160 92 228 96 228 124" />
        <path className="composing-link" style={{ animationDelay: '1.9s' }} d="M196 45 C226 45 236 40 252 40" />
        <rect className="composing-tile" style={{ animationDelay: '0s' }} x="124" y="24" width="72" height="42" rx="6" />
        <rect className="composing-tile" style={{ animationDelay: '0.45s' }} x="56" y="124" width="72" height="42" rx="6" />
        <rect className="composing-tile" style={{ animationDelay: '0.75s' }} x="192" y="124" width="72" height="42" rx="6" />
        <rect className="composing-note" style={{ animationDelay: '1.6s' }} x="252" y="24" width="34" height="32" rx="3" />
        {TITLE_BARS.map(({ x, y, delay }) => (
          <rect key={x} className="composing-bar" style={{ animationDelay: delay }} x={x} y={y} width="34" height="4" rx="2" />
        ))}
      </svg>
      <WandSparkles size={30} className="conductor-composing-icon" />
      <strong>{t('conductor.composing')}</strong>
      {action && <span>{toolLabel(t, action, nameOf)}</span>}
    </div>
  );
}
