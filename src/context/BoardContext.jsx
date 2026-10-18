import { createContext, useContext } from 'react';

// Outil actif du tableau, case source du lien en cours, case survolée par « Branche » et case dont
// la barre des branches est ouverte, lus par les cases de la map.
export const BoardContext = createContext({ tool: 'select', linkSource: null, branchTarget: null, branchPicker: null, setBranchPicker: () => {} });

export const useBoard = () => useContext(BoardContext);
