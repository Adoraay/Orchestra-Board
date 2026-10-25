import { createContext, useContext } from 'react';

// Outil actif du tableau, case source du lien en cours, case survolée par « Branche », case dont
// la barre des branches est ouverte, dernier état de chaque lien, et case affichée en grand (maximized,
// avec l'emplacement maxSlot où son terminal est déplacé), lus par les cases et les liens.
export const BoardContext = createContext({
  tool: 'select',
  linkSource: null,
  branchTarget: null,
  branchPicker: null,
  setBranchPicker: () => {},
  linkEvents: {},
  pendingMessages: [],
  maximized: null,
  setMaximized: () => {},
  maxSlot: null,
});

export const useBoard = () => useContext(BoardContext);
