// Affichage court d'un chemin : le dossier personnel devient « ~ ».
export function displayPath(fullPath, homeDir) {
  if (!fullPath) return '';
  if (!homeDir || !fullPath.toLowerCase().startsWith(homeDir.toLowerCase())) return fullPath;
  const rest = fullPath.slice(homeDir.length);
  return /^([\\/]|$)/.test(rest) ? '~' + rest : fullPath;
}

export const baseName = (fullPath) => fullPath.split(/[\\/]/).filter(Boolean).pop() || fullPath;
