const LABELS = {
  idle: 'Inactif',
  working: 'Travaille',
  waiting: 'Attend une réponse ou une permission',
  done: 'A fini',
};

// Pastille de statut d'un agent (PLAN.md §3.2) : gris, orange qui pulse, jaune, vert.
export default function StatusDot({ status }) {
  return <span className={`status-dot ${status}`} title={LABELS[status]} role="status" aria-label={LABELS[status]} />;
}
