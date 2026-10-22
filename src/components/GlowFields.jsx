import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';
import MapPreview from './MapPreview.jsx';

// Accent du thème (sur :root, jamais remplacé), affiché quand aucune couleur n'est choisie.
const themeAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

// Effet de la grille autour de la souris : activé ou non, couleur, taille, et aperçu en direct.
export default function GlowFields() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const update = (patch) => updateSettings('appearance', patch);
  const { accent, grid, glow, glowColor, glowSize } = settings.appearance;

  return (
    <div className="field">
      <label className="checkbox">
        <input type="checkbox" checked={glow} onChange={(e) => update({ glow: e.target.checked })} />
        {t('appearance.glow')}
      </label>
      {glow && grid === 'none' && <span className="hint">{t('appearance.glowNoGrid')}</span>}
      {glow && (
        <div className="glow-settings">
          <div className="glow-controls">
            <div className="field">
              <span className="field-label">{t('appearance.glowColor')}</span>
              <div className="field-row">
                <input type="color" value={glowColor ?? accent ?? themeAccent()} onChange={(e) => update({ glowColor: e.target.value })} />
                <button className="text-button" disabled={!glowColor} onClick={() => update({ glowColor: null })}>
                  {t('appearance.glowAccent')}
                </button>
              </div>
            </div>
            <label className="field">
              <span className="field-label">{t('appearance.glowSize')}</span>
              <div className="field-row">
                <input type="range" min={40} max={240} step={10} value={glowSize} onChange={(e) => update({ glowSize: Number(e.target.value) })} />
                <span className="field-value">{glowSize} px</span>
              </div>
            </label>
          </div>
          <MapPreview grid={grid === 'none' ? 'dots' : grid} glow color={glowColor ?? 'var(--accent)'} size={glowSize} />
        </div>
      )}
    </div>
  );
}
