import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, X } from 'lucide-react';
import useT from '../hooks/useT.js';

const GAP = 14; // px entre l'élément montré et la bulle
const MARGIN = 12; // px gardés au bord de la fenêtre
const RING = 6; // px de halo autour de l'élément

const tiles = (board) => board.nodes.filter((n) => n.type === 'terminal');

// Étapes de la visite (PLAN.md §3.21) : élément montré (sélecteur CSS) et condition qui fait passer à la
// suite toute seule. Le bouton « Suivant » reste toujours possible : la visite ne bloque jamais.
const STEPS = [
  { id: 'agent', anchor: '.dock', done: (b) => tiles(b).length >= 1 },
  { id: 'second', anchor: '.dock', done: (b) => tiles(b).length >= 2 },
  { id: 'link', anchor: '[data-tool="link"]', done: (b) => b.edges.length >= 1 },
  { id: 'linkType', anchor: '.link-label, .react-flow__edge', done: (b) => b.edges.some((e) => e.selected) },
  { id: 'role', anchor: '.case-tabs', done: (b) => tiles(b).some((n) => n.data.role) },
  { id: 'log', anchor: '.log-wrap .usage-tab' },
  { id: 'done' },
];

// Rectangle visible du premier élément qui correspond, ou null.
function findRect(selector) {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

// Bulle à droite de l'élément s'il y a la place, sinon à gauche, sinon dessous ; centrée en bas sans élément.
function placeBubble(rect, bubble) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampY = (y) => Math.min(Math.max(MARGIN, y), vh - bubble.height - MARGIN);
  const clampX = (x) => Math.min(Math.max(MARGIN, x), vw - bubble.width - MARGIN);
  if (!rect) return { left: (vw - bubble.width) / 2, top: vh - bubble.height - 48 };
  const centerY = rect.top + rect.height / 2 - bubble.height / 2;
  if (rect.right + GAP + bubble.width <= vw - MARGIN) return { left: rect.right + GAP, top: clampY(centerY) };
  if (rect.left - GAP - bubble.width >= MARGIN) return { left: rect.left - GAP - bubble.width, top: clampY(centerY) };
  return { left: clampX(rect.left + rect.width / 2 - bubble.width / 2), top: clampY(rect.bottom + GAP) };
}

// Tutoriel : fenêtre de bienvenue (premier lancement), puis visite guidée en bulles posées sur l'interface.
// welcome : commencer par la fenêtre de bienvenue (sinon la visite démarre tout de suite, depuis les paramètres).
export default function Tutorial({ board, welcome, onFinish }) {
  const t = useT();
  const [index, setIndex] = useState(welcome ? -1 : 0);
  const [rect, setRect] = useState(null);
  const [position, setPosition] = useState(null);
  const bubbleRef = useRef(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  // L'élément montré bouge (map, panneaux qui s'ouvrent, fenêtre redimensionnée) : on le suit.
  useEffect(() => {
    if (!step) return;
    const update = () => setRect(findRect(step.anchor));
    update();
    const timer = setInterval(update, 250);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', update);
    };
  }, [step]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const next = placeBubble(rect, bubble.getBoundingClientRect());
    setPosition((current) => (current && current.left === next.left && current.top === next.top ? current : next));
  }, [rect, index]);

  // Action faite : étape suivante.
  useEffect(() => {
    if (step?.done?.(board)) setIndex((i) => i + 1);
  }, [board, step]);

  if (index === -1) {
    return createPortal(
      <div className="modal-backdrop">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
          <header className="dialog-header">
            <span className="dialog-icon"><Compass size={18} /></span>
            <h1 id="tutorial-title">{t('tutorial.welcomeTitle')}</h1>
          </header>
          <p className="dialog-text">{t('tutorial.welcomeText')}</p>
          <div className="dialog-actions">
            <button className="text-button" onClick={onFinish}>{t('tutorial.skip')}</button>
            <button className="text-button primary" onClick={() => setIndex(0)} autoFocus>{t('tutorial.start')}</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
      {rect && (
        <div
          className="tutorial-ring"
          style={{ left: rect.left - RING, top: rect.top - RING, width: rect.width + RING * 2, height: rect.height + RING * 2 }}
        />
      )}
      <div
        ref={bubbleRef}
        className="tutorial-bubble"
        role="dialog"
        aria-labelledby="tutorial-step-title"
        style={position ?? { visibility: 'hidden' }}
      >
        <header className="tutorial-header">
          <span id="tutorial-step-title" className="tutorial-title">{t(`tutorial.${step.id}.title`)}</span>
          <button className="icon-button" onClick={onFinish} title={t('tutorial.quit')}><X size={15} /></button>
        </header>
        <p className="tutorial-text">{t(`tutorial.${step.id}.text`)}</p>
        <footer className="tutorial-footer">
          <span className="tutorial-progress">{t('tutorial.progress', { n: index + 1, total: STEPS.length })}</span>
          {!last && <button className="text-button" onClick={onFinish}>{t('tutorial.quit')}</button>}
          <button className="text-button primary" onClick={() => (last ? onFinish() : setIndex(index + 1))}>
            {last ? t('tutorial.finish') : t('tutorial.next')}
          </button>
        </footer>
      </div>
    </>,
    document.body,
  );
}
