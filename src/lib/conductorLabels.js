// Libellé d'une action du chef d'orchestre (« Je crée l'agent Backend (Claude Code) »), pour sa bulle et
// l'encart de construction. nameOf(id) : nom d'une case de la map (ou l'id/le nom tel quel).
const KNOWN_TOOLS = ['read_board', 'create_agent', 'create_link', 'update_link', 'remove_link', 'create_sticky', 'update_sticky', 'set_role', 'send_to', 'remove_agent', 'read_agent_output', 'arrange'];

export function toolLabel(t, entry, nameOf) {
  const input = entry.input ?? {};
  const vars = {
    name: input.name ?? '',
    type: input.type ? t(`conductor.type.${input.type}`) : '',
    from: nameOf(input.from),
    to: nameOf(input.to),
    agent: nameOf(input.agent),
    sticky: nameOf(input.sticky),
    layout: input.layout ? t(`conductor.layout.${input.layout}`) : '',
  };
  return KNOWN_TOOLS.includes(entry.tool) ? t(`conductor.tool.${entry.tool}`, vars) : t('conductor.tool.other', { tool: entry.tool });
}
