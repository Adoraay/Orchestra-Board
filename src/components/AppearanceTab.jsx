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

const GRIDS = ['dots', 'lines', 'none'];

// Accent du thème (sur :root, jamais remplacé), affiché quand aucune couleur n'est choisie.
const themeAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

export default function AppearanceTab() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const updateAppearance = (patch) => updateSettings('appearance', patch);
  const { theme, accent, terminalFontSize, grid } = settings.appearance;

  return (
    <div className="settings-form">
      <div className="field">
        <span className="field-label">{t('appearance.theme')}</span>
        <div className="theme-grid" role="radiogroup" aria-label={t('appearance.theme')}>
          {THEMES.map((item) => (
            <button
              key={item.id}
              className={`theme-card ${theme === item.id ? 'active' : ''}`}
              role="radio"
              aria-checked={theme === item.id}
              onClick={() => updateAppearance({ theme: item.id })}
            >
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

      <div className="field">
        <span className="field-label">{t('appearance.accent')}</span>
        <div className="field-row">
          <input
            type="color"
            value={accent ?? themeAccent()}
            onChange={(e) => updateAppearance({ accent: e.target.value })}
          />
          <button className="text-button" disabled={!accent} onClick={() => updateAppearance({ accent: null })}>
            {t('appearance.reset')}
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">{t('appearance.fontSize')}</span>
        <div className="field-row">
          <input
            type="range"
            min={10}
            max={24}
            value={terminalFontSize}
            onChange={(e) => updateAppearance({ terminalFontSize: Number(e.target.value) })}
          />
          <span className="field-value">{terminalFontSize} px</span>
        </div>
      </label>

      <div className="field">
        <span className="field-label">{t('appearance.grid')}</span>
        <div className="segmented" role="radiogroup" aria-label={t('appearance.grid')}>
          {GRIDS.map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={grid === id}
              className={grid === id ? 'active' : ''}
              onClick={() => updateAppearance({ grid: id })}
            >
              {t(`grid.${id}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
