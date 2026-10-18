import { useEffect, useState } from 'react';
import AgentLogo from './AgentLogo.jsx';

const VISIBLE_FOR = 5000; // ms

// Bulle « [agent] a terminé sa tâche » au-dessus de la case (PLAN.md §3.6).
// Elle s'efface seule au bout de 5 s ; la lueur verte, elle, reste jusqu'à ce que la case soit vue.
export default function FinishBubble({ agent, finished }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(finished);
    if (!finished) return;
    const timer = setTimeout(() => setVisible(false), VISIBLE_FOR);
    return () => clearTimeout(timer);
  }, [finished]);

  if (!visible) return null;
  return (
    <div className="finish-bubble" role="status">
      <AgentLogo agent={agent} size={16} />
      {agent.name} a terminé sa tâche
    </div>
  );
}
