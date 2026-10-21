import en from '../locales/en.js';
import fr from '../locales/fr.js';
import { isMac } from './platform.js';

// Langues de l'interface (PLAN.md §3.15). locale : format des dates et des nombres.
export const LANGUAGES = [
  { id: 'en', label: 'English', locale: 'en-US' },
  { id: 'fr', label: 'Français', locale: 'fr-FR' },
];

const DICTIONARIES = { en, fr };

// Texte d'une clé : une chaîne avec des {variables}, ou une fonction (pluriels, accords) qui reçoit les variables.
// Clé absente dans la langue choisie : on prend l'anglais, sinon la clé elle-même (visible, donc repérable).
// {mod} est toujours fourni : touche des raccourcis de l'app (« Ctrl+ », « Cmd+ » sur Mac).
export function translate(language, key, vars = {}) {
  const entry = DICTIONARIES[language]?.[key] ?? en[key];
  if (entry === undefined) return key;
  const all = { mod: isMac ? 'Cmd+' : 'Ctrl+', ...vars };
  const text = typeof entry === 'function' ? entry(all) : entry;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in all ? all[name] : match));
}

export const localeOf = (language) => LANGUAGES.find((l) => l.id === language)?.locale ?? 'en-US';
