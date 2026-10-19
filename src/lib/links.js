// Réglages d'un nouveau lien (PLAN.md §3.5, §3.11), validés côté Node par electron/workspaceStore.cjs.
// En Transmission, sans consigne, un lien n'est pas encore configuré et ne transmet rien.
export const DEFAULT_LINK = { mode: 'relay', bidirectional: false, prompt: '', maxTurns: 3, enabled: true };
export const MAX_TURNS = 20;

// Types de lien : nom et explication dans src/locales (link.mode.<id> et link.mode.<id>.description).
export const LINK_MODES = ['relay', 'delegate'];
