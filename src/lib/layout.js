export const nodeSize = (node) => ({
  width: node.measured?.width ?? node.style?.width ?? node.width ?? (node.type === 'terminal' ? 640 : 270),
  height: node.measured?.height ?? node.style?.height ?? node.height ?? (node.type === 'terminal' ? 400 : 180),
});

export function boundsOf(nodes) {
  if (!nodes.length) return null;
  const left = Math.min(...nodes.map((node) => node.position.x));
  const top = Math.min(...nodes.map((node) => node.position.y));
  const right = Math.max(...nodes.map((node) => node.position.x + nodeSize(node).width));
  const bottom = Math.max(...nodes.map((node) => node.position.y + nodeSize(node).height));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export const FORMATIONS = ['grid', 'rows3', 'rows4', 'columns2', 'row', 'column'];
export const FORMATION_GAP = { x: 360, y: 120 }; // place pour les étiquettes et validations des liens

export function formationDimensions(count, formation) {
  if (!FORMATIONS.includes(formation) || !Number.isInteger(count) || count < 1) return { columns: 0, rows: 0 };
  const desired = { grid: Math.ceil(Math.sqrt(count)), rows3: 3, rows4: 4, columns2: 2, row: count, column: 1 }[formation];
  const columns = Math.min(desired, count);
  return { columns, rows: Math.ceil(count / columns) };
}

// Ordre des cases conservé ; cellules assez grandes pour les terminaux et les annotations mélangés.
export function arrangeNodes(nodes, formation) {
  const chosen = nodes.filter((node) => node.selected);
  if (chosen.length < 2 || !FORMATIONS.includes(formation)) return nodes;
  const { columns } = formationDimensions(chosen.length, formation);
  const cellWidth = Math.max(...chosen.map((node) => nodeSize(node).width));
  const cellHeight = Math.max(...chosen.map((node) => nodeSize(node).height));
  const positions = new Map();
  const relative = chosen.map((node, index) => {
    const row = Math.floor(index / columns);
    const inRow = Math.min(columns, chosen.length - row * columns);
    const width = inRow * cellWidth + (inRow - 1) * FORMATION_GAP.x;
    const size = nodeSize(node);
    const position = {
      x: -width / 2 + (index % columns) * (cellWidth + FORMATION_GAP.x) + (cellWidth - size.width) / 2,
      y: row * (cellHeight + FORMATION_GAP.y) + (cellHeight - size.height) / 2,
    };
    return { ...node, position };
  });
  // Le centre réel de la sélection reste fixe, même avec une dernière rangée incomplète.
  const before = boundsOf(chosen);
  const after = boundsOf(relative);
  const dx = before.left + before.width / 2 - after.left - after.width / 2;
  const dy = before.top + before.height / 2 - after.top - after.height / 2;
  for (const node of relative) positions.set(node.id, { x: node.position.x + dx, y: node.position.y + dy });
  return nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id) } : node);
}

export function cleanGroups(groups, nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  return groups.map((group) => ({ ...group, members: group.members.filter((id) => ids.has(id)) })).filter((group) => group.members.length);
}
