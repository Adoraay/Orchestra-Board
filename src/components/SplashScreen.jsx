import { useEffect, useState } from 'react';
import wordmark from '../assets/orchestra-wordmark.svg';
import './splash.css';

// Écran de démarrage : logo animé au centre, glisse à gauche et le nom sort de derrière lui,
// puis tout disparaît en fondu sur l'app (environ 5 s). L'app se charge déjà derrière.
export default function SplashScreen({ onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => { setVisible(false); onDone?.(); }, reduced ? 1500 : 4800);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="splash" role="presentation">
      <div className="splash-lockup">
        <svg className="splash-mark" viewBox="56 56 400 400" aria-hidden="true">
  <defs>
    <linearGradient id="spl-o1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#b8502f"/><stop offset="1" stopColor="#f0a27a"/></linearGradient>
    <linearGradient id="spl-o2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e88a62"/><stop offset="1" stopColor="#c96442"/></linearGradient>
    <radialGradient id="spl-glow"><stop offset="0" stopColor="#d97757" stopOpacity="0.35"/><stop offset="1" stopColor="#d97757" stopOpacity="0"/></radialGradient>
  </defs>
  <circle cx="256" cy="256" r="190" fill="url(#spl-glow)"/>
  <g transform="rotate(38 256 256)">
    <path d="M 88 256 A 168 70 0 1 1 424 256 A 168 70 0 1 1 88 256" fill="none" stroke="url(#spl-o2)" strokeWidth="12" opacity="0.85"/>
    <circle r="19" fill="#1f1e1d" stroke="#f0a27a" strokeWidth="8"><animateMotion dur="3.6s" begin="0s" repeatCount="indefinite" path="M 88 256 A 168 70 0 1 1 424 256 A 168 70 0 1 1 88 256"/></circle>
    <circle r="19" fill="#1f1e1d" stroke="#f0a27a" strokeWidth="8"><animateMotion dur="3.6s" begin="-1.2s" repeatCount="indefinite" path="M 88 256 A 168 70 0 1 1 424 256 A 168 70 0 1 1 88 256"/></circle>
    <circle r="19" fill="#1f1e1d" stroke="#f0a27a" strokeWidth="8"><animateMotion dur="3.6s" begin="-2.4s" repeatCount="indefinite" path="M 88 256 A 168 70 0 1 1 424 256 A 168 70 0 1 1 88 256"/></circle>
  </g>
  <g transform="rotate(-38 256 256)">
    <path d="M 84 256 A 172 78 0 1 1 428 256 A 172 78 0 1 1 84 256" fill="none" stroke="url(#spl-o1)" strokeWidth="26"/>
    <circle r="27" fill="#f4b08c"><animateMotion dur="5s" begin="0s" repeatCount="indefinite" path="M 84 256 A 172 78 0 1 1 428 256 A 172 78 0 1 1 84 256" keyPoints="1;0" keyTimes="0;1" calcMode="linear"/></circle>
    <circle r="19" fill="#1f1e1d" stroke="#f0a27a" strokeWidth="8"><animateMotion dur="5s" begin="-2.5s" repeatCount="indefinite" path="M 84 256 A 172 78 0 1 1 428 256 A 172 78 0 1 1 84 256" keyPoints="1;0" keyTimes="0;1" calcMode="linear"/></circle>
  </g>
  <circle cx="256" cy="256" r="15" fill="#ece9e2"/>
</svg>
        <div className="splash-name-window">
          <img className="splash-name" src={wordmark} alt="Orchestra" />
        </div>
      </div>
    </div>
  );
}
