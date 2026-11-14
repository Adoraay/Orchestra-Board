// Place libre pour une nouvelle case du chef d'orchestre (sans import : testé par tests/conductor.test.cjs).
// Espaces des formations (layout.js) : 360 entre deux colonnes pour que l'étiquette d'un lien reste visible,
// 120 entre deux rangées.
const GAP_X = 360;
const GAP_Y = 120;
const MARGIN = 40; // jamais deux cases plus proches que ça
const MAX_TRIES = 50;

export function sizeOf(node) {
  return {
    width: node.measured?.width ?? node.width ?? node.style?.width ?? 640,
    height: node.measured?.height ?? node.height ?? node.style?.height ?? 400,
  };
}

// Coin haut gauche d'une case de taille « size » :
// - near (id d'une case) : sous elle, au centre puis alternativement à droite et à gauche, rangée après rangée
//   (un chef en haut, ses agents en éventail dessous) ;
// - sinon : à droite de tout ce qui existe, sur la première rangée libre ; origin (centre de la vue) si la map est vide.
export function autoPlace(nodes, size, { near = null, origin = { x: 0, y: 0 } } = {}) {
  const rects = nodes.map((n) => ({ x: n.position.x, y: n.position.y, ...sizeOf(n) }));
  const free = (x, y) =>
    !rects.some((r) => x < r.x + r.width + MARGIN && x + size.width + MARGIN > r.x && y < r.y + r.height + MARGIN && y + size.height + MARGIN > r.y);

  const anchor = near && nodes.find((n) => n.id === near);
  if (anchor) {
    const box = sizeOf(anchor);
    const center = anchor.position.x + box.width / 2;
    let y = anchor.position.y + box.height + GAP_Y;
    for (let row = 0; row < MAX_TRIES; row++, y += size.height + GAP_Y) {
      for (let k = 0; k < 9; k++) {
        const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        const x = center - size.width / 2 + step * (size.width + GAP_X);
        if (free(x, y)) return { x, y };
      }
    }
  }

  if (!rects.length) return { x: origin.x - size.width / 2, y: origin.y - size.height / 2 };
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  for (let row = 0; row < MAX_TRIES; row++) {
    for (let col = 0; col < MAX_TRIES; col++) {
      const x = right + GAP_X + col * (size.width + GAP_X);
      const y = top + row * (size.height + GAP_Y);
      if (free(x, y)) return { x, y };
    }
  }
  return { x: right + GAP_X, y: top };
}
