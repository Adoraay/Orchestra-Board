import useT from '../hooks/useT.js';

// Pastille de statut d'un agent (PLAN.md §3.2) : gris, orange qui pulse, jaune, vert.
export default function StatusDot({ status }) {
  const t = useT();
  const label = t(`status.${status}`);
  return <span className={`status-dot ${status}`} title={label} role="status" aria-label={label} />;
}
