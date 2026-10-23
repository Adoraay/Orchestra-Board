import { useEffect, useState } from 'react';
import { Bug, ExternalLink, RefreshCw } from 'lucide-react';
import mark from '../assets/orchestra-mark.svg';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

// « À propos », en bas de Paramètres › Général : version, auteur et liens du projet (ouverts par Node).
export default function AboutSection() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState(null); // null, 'checking', 'upToDate', 'found' ou un message d'erreur

  useEffect(() => {
    window.about.info().then((info) => setVersion(info.version));
  }, []);

  // Une version trouvée ouvre la fenêtre de mise à jour (événement update:available, écouté par App.jsx).
  const checkUpdates = async () => {
    setUpdateStatus('checking');
    const result = await window.updates.check(true);
    setUpdateStatus(result.error ?? (result.available ? 'found' : 'upToDate'));
  };
  const statusText = { checking: t('update.checking'), upToDate: t('update.upToDate'), found: null }[updateStatus] ?? updateStatus;

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
      <div className="field-row">
        <button className="text-button" onClick={checkUpdates} disabled={updateStatus === 'checking'}>
          <RefreshCw size={15} />
          {t('update.checkNow')}
        </button>
        {statusText && <span className="hint">{statusText}</span>}
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={settings.general.checkUpdates} onChange={(e) => updateSettings('general', { checkUpdates: e.target.checked })} />
        {t('general.checkUpdates')}
      </label>
      <span className="hint">{t('general.checkUpdatesHint')}</span>
    </div>
  );
}
