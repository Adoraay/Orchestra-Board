const fs = require('fs');
const path = require('path');

function canonical(value) {
  const real = fs.realpathSync(value);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

async function sharedWorktrees(workspace, root, caller, resolveRoot) {
  const cache = new Map();
  const target = canonical(root);
  const nodes = workspace.boards.flatMap((board) => board.nodes.filter((node) => node.type === 'terminal' && node.id !== caller).map((node) => ({ id: node.id, name: node.data.label || node.data.agentId, boardName: board.name, cwd: node.data.worktree ?? node.data.cwd })));
  const matches = [];
  let cursor = 0;
  const check = async (node) => {
    try {
      if (typeof node.cwd !== 'string' || !path.isAbsolute(node.cwd)) return null;
      const cwd = canonical(node.cwd);
      if (!cache.has(cwd)) cache.set(cwd, Promise.resolve(resolveRoot(cwd)));
      const other = await cache.get(cwd);
      if (canonical(other) !== target) return null;
      return { id: node.id, name: node.name, boardName: node.boardName };
    } catch { return null; }
  };
  // Un grand tableau ne doit pas lancer un processus Git par case en même temps.
  await Promise.all(Array.from({ length: Math.min(4, nodes.length) }, async () => {
    while (cursor < nodes.length) {
      const index = cursor++;
      matches[index] = await check(nodes[index]);
    }
  }));
  return matches.filter(Boolean);
}

module.exports = { sharedWorktrees };
