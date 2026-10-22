import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';
import MapPreview from './MapPreview.jsx';

const GRIDS = ['dots', 'lines', 'none'];

// Grille de la map, avec un aperçu.
export default function GridField() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const { grid } = settings.appearance;

  return (
    <div className="field">
      <span className="field-label">{t('appearance.grid')}</span>
      <div className="segmented" role="radiogroup" aria-label={t('appearance.grid')}>
        {GRIDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={grid === id}
            className={grid === id ? 'active' : ''}
            onClick={() => updateSettings('appearance', { grid: id })}
          >
            {t(`grid.${id}`)}
          </button>
        ))}
      </div>
      <MapPreview grid={grid} />
    </div>
  );
}
