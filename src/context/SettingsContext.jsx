import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MISSING_AGENT, decorateAgent } from '../agents.js';

const SAVE_DELAY = 300; // ms : le sélecteur de couleur envoie une valeur à chaque mouvement

const SettingsContext = createContext(null);

// L'accent choisi est posé sur <body> : il remplace celui du thème pour toute l'interface,
// tandis que :root garde les valeurs de theme.css (lisibles pour « Réinitialiser »).
function applyAppearance({ accent }) {
  const root = document.body.style;
  if (accent) {
    root.setProperty('--accent', accent);
    root.setProperty('--accent-hover', `color-mix(in srgb, ${accent} 82%, white)`);
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--accent-hover');
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [customLogos, setCustomLogos] = useState({}); // nom du fichier -> data URL
  const saveTimer = useRef(null);

  useEffect(() => {
    Promise.all([window.settings.get(), window.agents.logos()]).then(([loaded, logos]) => {
      setCustomLogos(logos);
      setSettings(loaded);
    });
  }, []);

  useLayoutEffect(() => {
    if (settings) applyAppearance(settings.appearance);
  }, [settings]);

  const commit = (change) => {
    setSettings((current) => {
      const next = change(current);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => window.settings.set(next), SAVE_DELAY);
      return next;
    });
  };

  const value = useMemo(() => {
    if (!settings) return null;
    const agents = settings.agents.map((agent) => decorateAgent(agent, customLogos));
    return {
      settings,
      agents,
      visibleAgents: agents.filter((agent) => !agent.hidden),
      agentById: (id) => agents.find((agent) => agent.id === id) ?? MISSING_AGENT,
      // section = 'appearance' | 'general'
      updateSettings: (section, patch) =>
        commit((current) => ({ ...current, [section]: { ...current[section], ...patch } })),
      setAgents: (list) => commit((current) => ({ ...current, agents: list })),
      addCustomLogo: (file, dataUrl) => setCustomLogos((logos) => ({ ...logos, [file]: dataUrl })),
    };
  }, [settings, customLogos]);

  // On attend les paramètres pour éviter un flash de la couleur par défaut au démarrage.
  if (!value) return null;

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
