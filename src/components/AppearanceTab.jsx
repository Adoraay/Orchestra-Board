import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';
import FontSizeField from './FontSizeField.jsx';
import GlowFields from './GlowFields.jsx';
import GridField from './GridField.jsx';
import ThemePicker from './ThemePicker.jsx';

// Accent du thème (sur :root, jamais remplacé), affiché quand aucune couleur n'est choisie.
const themeAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

// Thème, taille de police, grille et effet : mêmes composants que l'assistant du premier lancement.
export default function AppearanceTab() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const { accent } = settings.appearance;

  return (
    <div className="settings-form">
      <ThemePicker />

      <div className="field">
        <span className="field-label">{t('appearance.accent')}</span>
        <div className="field-row">
          <input
            type="color"
            value={accent ?? themeAccent()}
            onChange={(e) => updateSettings('appearance', { accent: e.target.value })}
          />
          <button className="text-button" disabled={!accent} onClick={() => updateSettings('appearance', { accent: null })}>
            {t('appearance.reset')}
          </button>
        </div>
      </div>

      <FontSizeField />
      <GridField />
      <GlowFields />
    </div>
  );
}
