import { createContext, useContext } from 'react';

// Outil actif du tableau, case source du lien en cours, case survolée par « Branche », case dont
// la barre des branches est ouverte et dernier état de chaque lien, lus par les cases et les liens.
export const BoardContext = createContext({
  tool: 'select',
  linkSource: null,
  branchTarget: null,
  branchPicker: null,
  setBranchPicker: () => {},
  linkEvents: {},
});

export const useBoard = () => useContext(BoardContext);
