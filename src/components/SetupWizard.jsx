import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import useT from '../hooks/useT.js';
import DockAgentsPicker from './DockAgentsPicker.jsx';
import FontSizeField from './FontSizeField.jsx';
import GlowFields from './GlowFields.jsx';
import GridField from './GridField.jsx';
import LanguageField from './LanguageField.jsx';
import ThemePicker from './ThemePicker.jsx';

// Assistant du tout premier lancement, avant la visite guidée (PLAN.md §3.21) : chaque choix est appliqué
// et enregistré tout de suite, comme dans les paramètres. « Passer » et « Terminer » lancent la visite.
const STEPS = [
  { id: 'welcome', content: () => <LanguageField labelKey="setup.language" /> },
  { id: 'theme', content: () => <ThemePicker recommended /> },
  { id: 'font', content: () => <FontSizeField /> },
  { id: 'grid', content: () => <GridField /> },
  { id: 'glow', content: () => <GlowFields /> },
  { id: 'agents', content: () => <DockAgentsPicker /> },
  { id: 'done' },
];

export default function SetupWizard({ onFinish }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const first = index === 0;
  const last = index === STEPS.length - 1;

  return createPortal(
    <div className="modal-backdrop">
      <div className="dialog setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header className="dialog-header">
          <span className="dialog-icon"><Sparkles size={18} /></span>
          <h1 id="setup-title">{t(`setup.${step.id}.title`)}</h1>
        </header>
        <p className="dialog-text">{t(`setup.${step.id}.text`)}</p>
        {step.content && <div className="setup-content settings-form">{step.content()}</div>}
        <footer className="setup-footer">
          <span className="setup-dots" aria-label={t('tutorial.progress', { n: index + 1, total: STEPS.length })}>
            {STEPS.map((s, i) => <span key={s.id} className={`setup-dot ${i === index ? 'active' : ''}`} />)}
          </span>
          {first && <button className="text-button" onClick={onFinish}>{t('tutorial.skip')}</button>}
          {!first && !last && <button className="text-button" onClick={() => setIndex(index - 1)}>{t('setup.back')}</button>}
          <button className="text-button primary" onClick={() => (last ? onFinish() : setIndex(index + 1))} autoFocus>
            {last ? t('tutorial.finish') : t('tutorial.next')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
