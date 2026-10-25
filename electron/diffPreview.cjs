const MAX_TEXT = 200 * 1024;
const MAX_LINES = 2000;
const MAX_LINE = 4000;

// Limiter avant de créer les lignes React : un petit fichier rempli de sauts de ligne peut être énorme à rendre.
function diffPreview(text, { added = false, truncated = false } = {}) {
  truncated ||= text.length > MAX_TEXT;
  const head = text.slice(0, MAX_TEXT);
  const lines = head.split(/\r?\n/, MAX_LINES + 1);
  if (lines.length > MAX_LINES) { lines.length = MAX_LINES; truncated = true; }
  else if (lines.at(-1) === '') lines.pop();
  const result = lines.map((line) => {
    if (line.length > MAX_LINE) { truncated = true; line = line.slice(0, MAX_LINE); }
    return added ? '+' + line : line;
  });
  return { diff: result.join('\n'), truncated };
}

module.exports = { diffPreview, MAX_LINES };
