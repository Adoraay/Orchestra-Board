// Markdown courant des réponses du chef d'orchestre : titres, listes, paragraphes, gras, italique, code.
// Construit des éléments React (aucun HTML interprété) ; une marque non refermée reste du texte simple.
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

function inline(text) {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('**') || part.startsWith('__')) return <strong key={i}>{inline(part.slice(2, -2))}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <em key={i}>{inline(part.slice(1, -1))}</em>;
  });
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export default function MarkdownText({ text }) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const code = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      i++;
      blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
    } else if (HEADING.test(line)) {
      blocks.push(<p key={blocks.length} className="md-heading">{inline(line.match(HEADING)[1])}</p>);
      i++;
    } else if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const pattern = ordered ? NUMBER : BULLET;
      const items = [];
      for (; i < lines.length && pattern.test(lines[i]); i++) items.push(<li key={items.length}>{inline(lines[i].match(pattern)[1])}</li>);
      blocks.push(ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    } else if (!line.trim()) {
      i++;
    } else {
      const paragraph = [];
      for (; i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !/^\s*```/.test(lines[i]); i++) {
        if (paragraph.length) paragraph.push(<br key={`br${i}`} />);
        paragraph.push(<span key={i}>{inline(lines[i])}</span>);
      }
      blocks.push(<p key={blocks.length}>{paragraph}</p>);
    }
  }
  return <div className="markdown">{blocks}</div>;
}
