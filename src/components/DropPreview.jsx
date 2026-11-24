import { useViewport } from '@xyflow/react';

// Rectangle en pointillés qui montre où la case sera créée pendant le glisser (agent du dock ou panneau).
export default function DropPreview({ name, position, size, children }) {
  const { zoom } = useViewport();
  const width = size.width * zoom;
  const height = size.height * zoom;

  return (
    <div
      className="drop-preview"
      style={{ left: position.x - width / 2, top: position.y - height / 2, width, height }}
    >
      {children}
      <span className="drop-preview-name">{name}</span>
    </div>
  );
}
