import { boundsOf, nodeSize } from '../lib/layout.js';
import useT from '../hooks/useT.js';

const MODES = ['delegate', 'relay', 'terminal', 'note'];

// Point où le segment centre → centre sort du rectangle de la case.
function border(center, size, dx, dy) {
  const scale = Math.min(size.width / 2 / Math.abs(dx || 1e-9), size.height / 2 / Math.abs(dy || 1e-9));
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

// Schéma miniature d'un tableau : cases à leur place, agents et liens par type.
export default function TeamPreview({ board, agents }) {
  const t = useT();
  const nodes = board.nodes.filter((node) => node.position);
  const box = boundsOf(nodes);
  if (!box) return null;
  const pad = 70;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const center = (node) => { const size = nodeSize(node); return { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 }; };
  const modes = MODES.filter((mode) => board.edges.some((edge) => (edge.data?.mode ?? 'relay') === mode));

  return <figure className="team-diagram">
    <svg viewBox={`${box.left - pad} ${box.top - pad} ${box.width + pad * 2} ${box.height + pad * 2}`} role="img" aria-label={t('team.includes', { nodes: board.nodes.length, links: board.edges.length })}>
      <defs>{MODES.map((mode) => <marker key={mode} id={`team-arrow-${mode}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className={`team-arrow ${mode}`} /></marker>)}</defs>
      {board.edges.map((edge) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        const mode = edge.data?.mode ?? 'relay';
        const a = center(source);
        const b = center(target);
        const start = border(a, nodeSize(source), b.x - a.x, b.y - a.y);
        const end = border(b, nodeSize(target), a.x - b.x, a.y - b.y);
        return <line key={edge.id} className={`team-edge ${mode}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
          markerEnd={`url(#team-arrow-${mode})`} markerStart={edge.data?.bidirectional ? `url(#team-arrow-${mode})` : undefined} />;
      })}
      {nodes.map((node) => {
        const { width, height } = nodeSize(node);
        const note = node.type !== 'terminal';
        const agent = agents.find((entry) => entry.id === node.data.agentId);
        const label = node.data.label || agent?.name || t('team.note');
        // Largeur estimée du texte (tailles du CSS) : un nom trop long est resserré dans sa case.
        const fit = label.length * (note ? 56 : 84) * 0.55 > width * 0.86 ? { textLength: width * 0.86, lengthAdjust: 'spacingAndGlyphs' } : {};
        return <g key={node.id} className={`team-node ${note ? 'note' : ''}`}>
          <rect x={node.position.x} y={node.position.y} width={width} height={height} rx="22" />
          <text x={node.position.x + width / 2} y={node.position.y + height / 2 - (note ? 0 : 36)} textAnchor="middle" dominantBaseline="middle" className="team-node-label" {...fit}>{label}</text>
          {!note && <text x={node.position.x + width / 2} y={node.position.y + height / 2 + 64} textAnchor="middle" dominantBaseline="middle" className="team-node-agent">{agent?.name || node.data.agentId}</text>}
        </g>;
      })}
    </svg>
    {modes.length > 0 && <figcaption className="team-legend">{modes.map((mode) => <span key={mode} className={`team-legend-item ${mode}`}><i />{t(`link.mode.${mode}`)}</span>)}</figcaption>}
  </figure>;
}
