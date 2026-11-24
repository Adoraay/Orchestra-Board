// Nom de fichier ou de dossier valide sous Windows (explorateur, dossiers créés par le chef d'orchestre).
// t : traduction de l'appelant (ce module ne charge pas i18n, pour rester utilisable dans les tests).
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function checkName(name, t) {
  if (typeof name !== 'string') return { error: t('fs.nameInvalid') };
  const clean = name.trim();
  if (!clean || clean === '.' || clean === '..') return { error: t('fs.nameEmpty') };
  if (clean.length > 255) return { error: t('fs.nameTooLong') };
  if (/[<>:"/\\|?*\x00-\x1f]/.test(clean)) return { error: t('fs.nameChars') };
  if (/[. ]$/.test(clean)) return { error: t('fs.nameEnd') };
  if (RESERVED.test(clean)) return { error: t('fs.nameReserved', { name: clean }) };
  return { name: clean };
}

module.exports = { checkName };
