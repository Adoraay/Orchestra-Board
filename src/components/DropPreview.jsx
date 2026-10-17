import { useViewport } from '@xyflow/react';
import AgentLogo from './AgentLogo.jsx';

// Rectangle en pointillés qui montre où la case sera créée pendant le glisser depuis le dock.
export default function DropPreview({ agent, position, size }) {
  const { zoom } = useViewport();
  const width = size.width * zoom;
  const height = size.height * zoom;

  return (
    <div
      className="drop-preview"
      style={{ left: position.x - width / 2, top: position.y - height / 2, width, height }}
    >
      <AgentLogo agent={agent} size={32} />
      <span className="drop-preview-name">{agent?.name}</span>
    </div>
  );
}
