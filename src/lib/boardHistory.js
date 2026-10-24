// Les notes restaurées sont aussi des extrémités de liens, contrairement aux terminaux fermés.
export function restoreBoardHistory(nodes, snapshot) {
  const terminals = nodes.filter((node) => !['note', 'text'].includes(node.type));
  const restored = [...terminals, ...snapshot.annotations];
  const ids = new Set(restored.map((node) => node.id));
  return { nodes: restored, edges: snapshot.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)), strokes: snapshot.strokes };
}
