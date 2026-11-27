// macOS : Cmd à la place de Ctrl pour les raccourcis, feux tricolores à gauche de la barre du haut.
export const isMac = window.appWindow.platform === 'darwin';
// Windows seulement : PowerShell, cmd, Explorateur, corbeille de Windows. Linux suit le plus souvent macOS.
export const isWindows = window.appWindow.platform === 'win32';

// Touche des raccourcis de l'app : Cmd sur Mac, Ctrl ailleurs (jamais les deux).
export const hasModifier = (event) => (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';
