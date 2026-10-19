import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import { localeOf, translate } from '../lib/i18n.js';

// Traduction dans la langue des paramètres : t('clé', { variables }). t.locale sert aux dates et nombres.
export default function useT() {
  const { settings } = useSettings();
  const language = settings.general.language;
  return useMemo(() => {
    const t = (key, vars) => translate(language, key, vars);
    t.language = language;
    t.locale = localeOf(language);
    return t;
  }, [language]);
}
