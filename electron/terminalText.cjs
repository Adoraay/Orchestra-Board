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

module.exports = { clean, shellPrompt };
