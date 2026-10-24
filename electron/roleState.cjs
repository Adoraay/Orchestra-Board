function createRoleState({ emit = () => {}, running = () => false } = {}) {
  let saved = new Map();
  const active = new Map();
  const get = (id) => ({ savedRole: saved.get(id) ?? '', activeRole: active.has(id) ? active.get(id) : null, known: active.has(id), running: running(id), pending: active.has(id) && active.get(id) !== (saved.get(id) ?? '') });
  const notify = (id) => emit(id, get(id));
  function setWorkspace(workspace) {
    const next = new Map(workspace.boards.flatMap((board) => board.nodes.filter((node) => node.type === 'terminal').map((node) => [node.id, node.data.role ?? ''])));
    const changed = new Set([...saved.keys(), ...next.keys()].filter((id) => saved.get(id) !== next.get(id)));
    saved = next;
    for (const id of [...active.keys()]) if (!saved.has(id)) { active.delete(id); changed.add(id); }
    for (const id of changed) notify(id);
  }
  function start(id) {
    const role = saved.get(id) ?? '';
    active.set(id, role);
    notify(id);
    return role;
  }
  function clear(id) { active.delete(id); notify(id); }
  function setSaved(id, role) { saved.set(id, role.trim().slice(0, 2000)); notify(id); }
  return { get, start, clear, setWorkspace, setSaved };
}

module.exports = { createRoleState };
