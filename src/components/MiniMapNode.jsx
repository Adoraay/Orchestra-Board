import { useInternalNode } from '@xyflow/react';
import { useSettings } from '../context/SettingsContext.jsx';

// Une case dans la minimap : le rectangle habituel, avec le logo de l'agent au centre pour les terminaux
// (initiales sur sa couleur de secours s'il n'a pas de logo).
export default function MiniMapNode({ id, x, y, width, height, borderRadius, className, shapeRendering, selected }) {
  const node = useInternalNode(id);
  const { agentById } = useSettings();
  const rect = (
    <rect
      className={`react-flow__minimap-node ${selected ? 'selected' : ''} ${className}`}
      x={x}
      y={y}
      rx={borderRadius}
      ry={borderRadius}
      width={width}
      height={height}
      shapeRendering={shapeRendering}
    />
  );
  if (node?.type !== 'terminal') return rect;

  const agent = agentById(node.data.agentId);
  const size = Math.min(width, height) * 0.5;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return (
    <g>
      {rect}
      {agent.logo ? (
        <image href={agent.logo} x={cx - size / 2} y={cy - size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <>
          <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} rx={size * 0.2} style={{ fill: agent.color ?? 'var(--text-muted)' }} />
          <text className="minimap-initials" x={cx} y={cy} fontSize={size * 0.4} textAnchor="middle" dominantBaseline="central">
            {agent.initials}
          </text>
        </>
      )}
    </g>
  );
}
