import { useSettings } from '../context/SettingsContext.jsx';

const THEMES = [
  { id: 'standard', label: 'Standard' },
  { id: 'light', label: 'Clair (bientôt)', disabled: true },
];

const GRIDS = [
  { id: 'dots', label: 'Points' },
  { id: 'lines', label: 'Lignes' },
  { id: 'none', label: 'Aucune' },
];

// Accent du thème (sur :root, jamais remplacé), affiché quand aucune couleur n'est choisie.
const themeAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

export default function AppearanceTab() {
  const { settings, updateSettings } = useSettings();
  const updateAppearance = (patch) => updateSettings('appearance', patch);
  const { theme, accent, terminalFontSize, grid } = settings.appearance;

  return (
    <div className="settings-form">
      <label className="field">
        <span className="field-label">Thème</span>
        <select value={theme} onChange={(e) => updateAppearance({ theme: e.target.value })}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id} disabled={t.disabled}>{t.label}</option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="field-label">Couleur d'accent</span>
        <div className="field-row">
          <input
            type="color"
            value={accent ?? themeAccent()}
            onChange={(e) => updateAppearance({ accent: e.target.value })}
          />
          <button className="text-button" disabled={!accent} onClick={() => updateAppearance({ accent: null })}>
            Réinitialiser
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Taille de police des terminaux</span>
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
        <span className="field-label">Grille de la map</span>
        <div className="segmented" role="radiogroup">
          {GRIDS.map((g) => (
            <button
              key={g.id}
              role="radio"
              aria-checked={grid === g.id}
              className={grid === g.id ? 'active' : ''}
              onClick={() => updateAppearance({ grid: g.id })}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
