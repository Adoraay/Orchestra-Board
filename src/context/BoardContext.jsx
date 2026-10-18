import { createContext, useContext } from 'react';

// Outil actif du tableau et case source du lien en cours, lus par les cases de la map.
export const BoardContext = createContext({ tool: 'select', linkSource: null });

export const useBoard = () => useContext(BoardContext);
