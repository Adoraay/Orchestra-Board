import { useSettings } from '../context/SettingsContext.jsx';
import { LANGUAGES } from '../lib/i18n.js';
import useT from '../hooks/useT.js';

// Langue de l'interface, appliquée en direct (Paramètres › Général et première étape de l'assistant).
export default function LanguageField({ labelKey = 'general.language' }) {
  const { settings, updateSettings } = useSettings();
  const t = useT();

  return (
    <label className="field">
      <span className="field-label">{t(labelKey)}</span>
      <select value={settings.general.language} onChange={(e) => updateSettings('general', { language: e.target.value })}>
        {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}
