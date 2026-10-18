import { createContext, useContext, useEffect, useState } from 'react';
import { useSettings } from './SettingsContext.jsx';

// Racine de l'explorateur et dossier actif (celui donné au prochain agent lâché sur la map).
const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { settings, updateSettings } = useSettings();
  const [homeDir, setHomeDir] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);

  // La racine est un paramètre (Général) : sans choix, c'est le dossier personnel.
  const rootPath = settings.general.rootPath ?? homeDir;

  useEffect(() => {
    window.fs.homeDir().then(setHomeDir);
  }, []);

  const changeRoot = async () => {
    const picked = await window.fs.pickFolder(rootPath);
    if (picked) updateSettings('general', { rootPath: picked });
  };

  const resetRoot = () => updateSettings('general', { rootPath: null });

  return (
    <WorkspaceContext.Provider value={{ homeDir, rootPath, changeRoot, resetRoot, activeFolder, setActiveFolder }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
