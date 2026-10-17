// Logo officiel si présent dans src/assets/agents/, sinon initiales sur la couleur de secours.
export default function AgentLogo({ agent, size = 26 }) {
  if (agent?.logo) {
    return <img className="agent-logo" src={agent.logo} alt="" width={size} height={size} draggable={false} />;
  }
  return (
    <span
      className="agent-logo fallback"
      style={{ background: agent?.color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {agent?.initials}
    </span>
  );
}
