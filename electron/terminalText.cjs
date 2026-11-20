const { stripVTControlCharacters } = require('node:util');

function clean(text) {
  // ConPTY may start a new row by moving the cursor to column one instead of emitting CRLF.
  const rows = text.replace(/\x1b\[\d+;1[Hf]/g, '\n');
  return stripVTControlCharacters(rows)
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Common PowerShell, cmd and Bash prompts. Avoid treating an arbitrary line ending in ">" as a prompt.
const PROMPT = /^(?:PS(?: [^>]+)?>|(?:[A-Z]:\\|\\\\)[^>]*>|(?:[\w.-]+@[\w.-]+:[^\r\n]*|(?:bash|sh)-[\d.]+)[$#]|[$#%❯])$/i;

function shellPrompt(text, previous = '') {
  const last = clean(text).split('\n').at(-1).trimEnd();
  if (previous && last.endsWith(previous)) return previous;
  return PROMPT.test(last) ? last : '';
}

// Dernière ligne non terminée (curseur resté dessus) : vide si la sortie finit par un retour à la ligne.
function pendingLine(text) {
  const rows = stripVTControlCharacters(text.replace(/\x1b\[\d+;1[Hf]/g, '\n')).replace(/\r\n/g, '\n');
  const last = rows.slice(rows.lastIndexOf('\n') + 1);
  return last.slice(last.lastIndexOf('\r') + 1).replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim();
}

module.exports = { clean, pendingLine, shellPrompt };
