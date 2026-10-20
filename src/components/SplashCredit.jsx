import useT from '../hooks/useT.js';

// Mention de l'auteur en bas de l'écran de démarrage. Posée par-dessus l'animation de design/ (utilisée
// telle quelle), elle apparaît puis disparaît en même temps qu'elle (styles.css, .splash-credit).
export default function SplashCredit() {
  const t = useT();
  return <div className="splash-credit" aria-hidden="true">{t('about.madeBy')}</div>;
}
