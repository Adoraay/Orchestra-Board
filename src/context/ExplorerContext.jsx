import { createContext, useContext } from 'react';

// État partagé de l'explorateur entre le panneau et chaque ligne de l'arbre : dossiers à relire,
// élément en cours de renommage, dossier où l'on crée un sous-dossier, et les actions du menu.
export const ExplorerContext = createContext(null);

export const useExplorer = () => useContext(ExplorerContext);
