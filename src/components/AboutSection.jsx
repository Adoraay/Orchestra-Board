import { useEffect, useState } from 'react';
import { Bug, ExternalLink } from 'lucide-react';
import mark from '../assets/orchestra-mark.svg';
import useT from '../hooks/useT.js';

// « À propos », en bas de Paramètres › Général : version, auteur et liens du projet (ouverts par Node).
export default function AboutSection() {
  const t = useT();
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.about.info().then((info) => setVersion(info.version));
  }, []);

  return (
    <div className="field about">
      <span className="field-label">{t('general.about')}</span>
      <div className="about-card">
        <img className="about-mark" src={mark} alt="" />
        <div className="about-text">
          <span className="about-name">Orchestra {version}</span>
          <span className="hint">
            {t('about.developedBy')}{' '}
            <button className="about-link" onClick={() => window.about.open('author')}>Adoraay</button>
          </span>
        </div>
      </div>
      <div className="field-row">
        <button className="text-button" onClick={() => window.about.open('repo')}>
          <ExternalLink size={15} />
          {t('about.repository')}
        </button>
        <button className="text-button" onClick={() => window.about.open('issues')}>
          <Bug size={15} />
          {t('about.feedback')}
        </button>
      </div>
    </div>
  );
}
