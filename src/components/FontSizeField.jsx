import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

// Taille de police des terminaux, avec un petit terminal d'exemple écrit à cette taille.
export default function FontSizeField() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const { terminalFontSize } = settings.appearance;

  return (
    <div className="field">
      <label className="field-label" htmlFor="terminal-font-size">{t('appearance.fontSize')}</label>
      <div className="field-row">
        <input
          id="terminal-font-size"
          type="range"
          min={10}
          max={24}
          value={terminalFontSize}
          onChange={(e) => updateSettings('appearance', { terminalFontSize: Number(e.target.value) })}
        />
        <span className="field-value">{terminalFontSize} px</span>
      </div>
      <div className="font-preview" style={{ fontSize: terminalFontSize }} aria-hidden="true">
        <div><span className="font-preview-prompt">&gt;</span> {t('appearance.fontSample1')}</div>
        <div className="font-preview-muted">{t('appearance.fontSample2')}</div>
      </div>
    </div>
  );
}
