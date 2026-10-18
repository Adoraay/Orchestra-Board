// Réglages d'un nouveau lien (PLAN.md §3.5, §3.11), validés côté Node par electron/workspaceStore.cjs.
// En Transmission, sans consigne, un lien n'est pas encore configuré et ne transmet rien.
export const DEFAULT_LINK = { mode: 'relay', bidirectional: false, prompt: '', maxTurns: 3, enabled: true };
export const MAX_TURNS = 20;

export const LINK_MODES = [
  {
    id: 'relay',
    label: 'Transmission',
    description: "Quand la source a fini, sa dernière réponse est envoyée automatiquement à la cible, avec ta consigne.",
  },
  {
    id: 'delegate',
    label: 'Délégation',
    description: "Rien d'automatique : la source voit la cible dans ses outils et décide elle-même quand lui écrire. La réponse lui revient directement.",
  },
];
