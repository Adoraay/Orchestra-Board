import { formationDimensions } from '../lib/layout.js';

export default function FormationIllustration({ formation, count }) {
  const { columns, rows } = formationDimensions(count, formation);
  const gap = 4;
  const width = 18;
  const height = 12;
  const fullWidth = columns * (width + gap) - gap + 8;
  const fullHeight = rows * (height + gap) - gap + 8;
  return <svg className="formation-illustration" viewBox={`0 0 ${fullWidth} ${fullHeight}`} aria-hidden="true" focusable="false">
    {Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, count - row * columns);
      return <rect key={index} x={(fullWidth - (inRow * width + (inRow - 1) * gap)) / 2 + (index % columns) * (width + gap)} y={4 + row * (height + gap)} width={width} height={height} rx="1.5" />;
    })}
  </svg>;
}
