// Affichage court d'un chemin : le dossier personnel devient « ~ ».
export function displayPath(fullPath, homeDir) {
  if (!fullPath) return '';
  if (!homeDir || !fullPath.toLowerCase().startsWith(homeDir.toLowerCase())) return fullPath;
  const rest = fullPath.slice(homeDir.length);
  return /^([\\/]|$)/.test(rest) ? '~' + rest : fullPath;
}

export const baseName = (fullPath) => fullPath.split(/[\\/]/).filter(Boolean).pop() || fullPath;

// Dossier parent (« C:\a\b » -> « C:\a », « C:\a » -> « C:\ »).
export function parentOf(fullPath) {
  const trimmed = fullPath.replace(/[\\/]+$/, '');
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (index === -1) return trimmed;
  const parent = trimmed.slice(0, index);
  return /^[a-z]:$/i.test(parent) ? parent + '\\' : parent || trimmed.slice(0, 1);
}

// « folder » lui-même ou un chemin à l'intérieur (sans tenir compte de la casse, comme Windows).
export function isWithin(fullPath, folder) {
  if (!fullPath) return false;
  const a = fullPath.toLowerCase();
  const b = folder.toLowerCase();
  return a === b || a.startsWith(b + '\\') || a.startsWith(b + '/');
}

// Chemin réécrit après le renommage de « from » en « to » (inchangé s'il n'est pas dedans).
export const movePath = (fullPath, from, to) => (isWithin(fullPath, from) ? to + fullPath.slice(from.length) : fullPath);
