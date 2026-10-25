// Les notes restaurées sont aussi des extrémités de liens, contrairement aux terminaux fermés.
export function restoreBoardHistory(nodes, snapshot) {
  const terminals = nodes.filter((node) => !['note', 'text'].includes(node.type)).map((node) => {
    const position = snapshot.positions?.find((entry) => entry.id === node.id)?.position;
    return position ? { ...node, position } : node;
  });
  const restored = [...terminals, ...snapshot.annotations];
  const ids = new Set(restored.map((node) => node.id));
  const groups = (snapshot.groups ?? []).map((group) => ({ ...group, members: group.members.filter((id) => ids.has(id)) })).filter((group) => group.members.length);
  return { nodes: restored, edges: snapshot.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)), strokes: snapshot.strokes, groups };
}
