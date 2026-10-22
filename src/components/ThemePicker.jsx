import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

// Chaque vignette porte data-theme : elle montre les vraies couleurs du thème (theme.css).
// Les noms d'apps ne se traduisent pas ; Standard et Clair passent par les traductions.
const THEMES = [
  { id: 'standard' },
  { id: 'light' },
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'vscode', name: 'VS Code' },
  { id: 'github', name: 'GitHub' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'nord', name: 'Nord' },
];

// recommended : pastille « recommandé » sur le thème Standard (assistant du premier lancement).
export default function ThemePicker({ recommended = false }) {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const { theme } = settings.appearance;

  return (
    <div className="field">
      <span className="field-label">{t('appearance.theme')}</span>
      <div className="theme-grid" role="radiogroup" aria-label={t('appearance.theme')}>
        {THEMES.map((item) => (
          <button
            key={item.id}
            className={`theme-card ${theme === item.id ? 'active' : ''}`}
            role="radio"
            aria-checked={theme === item.id}
            onClick={() => updateSettings('appearance', { theme: item.id })}
          >
            {recommended && item.id === 'standard' && <span className="theme-badge">{t('setup.recommended')}</span>}
            <span className="theme-preview" data-theme={item.id} aria-hidden="true">
              <span className="theme-preview-bar" />
              <span className="theme-preview-map">
                <span className="theme-preview-case">
                  <span className="theme-preview-title">
                    <span className="theme-preview-dot" />
                  </span>
                  <span className="theme-preview-terminal" />
                </span>
              </span>
            </span>
            <span className="theme-name">{item.name ?? t(`theme.${item.id}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
