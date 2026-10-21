// macOS : Cmd à la place de Ctrl pour les raccourcis, feux tricolores à gauche de la barre du haut.
export const isMac = window.appWindow.platform === 'darwin';

// Touche des raccourcis de l'app : Cmd sur Mac, Ctrl ailleurs (jamais les deux).
export const hasModifier = (event) => (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';
