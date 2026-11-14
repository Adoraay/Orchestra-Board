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

const overlapsAny = (box, nodes) =>
  nodes.some((n) => {
    const r = { x: n.position.x, y: n.position.y, ...sizeOf(n) };
    return box.x < r.x + r.width + MARGIN && box.x + box.width + MARGIN > r.x && box.y < r.y + r.height + MARGIN && box.y + box.height + MARGIN > r.y;
  });

// Rangée centrée sous une case : ses agents déjà placés (siblingIds, encore alignés) plus une nouvelle case.
// Renvoie [{ id, x, y }] (id null = la nouvelle case), ou null si la rangée ne tient pas sans chevauchement.
export function centeredRow(nodes, anchorId, siblingIds, size) {
  const anchor = nodes.find((n) => n.id === anchorId);
  const siblings = siblingIds.map((id) => nodes.find((n) => n.id === id));
  if (!anchor || !siblings.length || siblings.some((s) => !s)) return null;
  const y = siblings[0].position.y;
  if (siblings.some((s) => s.position.y !== y)) return null;
  const items = [...siblings].sort((a, b) => a.position.x - b.position.x).map((n) => ({ id: n.id, ...sizeOf(n) }));
  items.push({ id: null, ...size });
  const total = items.reduce((sum, item) => sum + item.width, 0) + GAP_X * (items.length - 1);
  let x = anchor.position.x + sizeOf(anchor).width / 2 - total / 2;
  const placed = items.map((item) => {
    const box = { id: item.id, x, y, width: item.width, height: item.height };
    x += item.width + GAP_X;
    return box;
  });
  const others = nodes.filter((n) => !siblingIds.includes(n.id));
  if (placed.some((box) => overlapsAny(box, others))) return null;
  return placed.map(({ id, x: px, y: py }) => ({ id, x: px, y: py }));
}

// Disposition demandée par le chef d'orchestre pour des cases du tableau (ids) :
// - pyramid : rangées centrées les unes sous les autres ; en haut « top » (ou les cases sans lien entrant dans le
//   groupe), puis chaque rangée = les cases reliées à la précédente ; un chef et deux agents = un triangle symétrique ;
// - row, column, grid : une ligne, une colonne, une grille presque carrée.
// Le groupe garde son centre horizontal et son haut. Renvoie Map(id -> { x, y }).
export function arrangeShape(nodes, edges, ids, layout, top = null) {
  const chosen = ids.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
  if (!chosen.length) return new Map();
  const centerOf = (n) => n.position.x + sizeOf(n).width / 2;
  const byX = (a, b) => a.position.x - b.position.x || a.position.y - b.position.y;
  const byY = (a, b) => a.position.y - b.position.y || a.position.x - b.position.x;
  let levels;
  if (layout === 'row') levels = [[...chosen].sort(byX)];
  else if (layout === 'column') levels = [...chosen].sort(byY).map((n) => [n]);
  else if (layout === 'grid') {
    const sorted = [...chosen].sort(byY);
    const cols = Math.ceil(Math.sqrt(sorted.length));
    levels = [];
    for (let i = 0; i < sorted.length; i += cols) levels.push(sorted.slice(i, i + cols).sort(byX));
  } else {
    const inGroup = new Set(chosen.map((n) => n.id));
    const links = edges.filter((e) => inGroup.has(e.source) && inGroup.has(e.target));
    const roots = top && inGroup.has(top) ? [top] : chosen.filter((n) => !links.some((e) => e.target === n.id)).map((n) => n.id);
    const level = new Map((roots.length ? roots : [chosen[0].id]).map((id) => [id, 0]));
    const queue = [...level.keys()];
    while (queue.length) {
      const id = queue.shift();
      for (const e of links) {
        const next = e.source === id ? e.target : e.target === id ? e.source : null;
        if (next && !level.has(next)) { level.set(next, level.get(id) + 1); queue.push(next); }
      }
    }
    const last = Math.max(...level.values()) + 1;
    for (const n of chosen) if (!level.has(n.id)) level.set(n.id, last);
    levels = [];
    for (const n of chosen) (levels[level.get(n.id)] ??= []).push(n);
    levels = levels.filter(Boolean).map((row) => row.sort(byX));
  }
  const topNode = top && chosen.find((n) => n.id === top);
  const cx = topNode ? centerOf(topNode) : (Math.min(...chosen.map((n) => n.position.x)) + Math.max(...chosen.map((n) => n.position.x + sizeOf(n).width))) / 2;
  let y = Math.min(...chosen.map((n) => n.position.y));
  const positions = new Map();
  for (const row of levels) {
    const width = row.reduce((sum, n) => sum + sizeOf(n).width, 0) + GAP_X * (row.length - 1);
    let x = cx - width / 2;
    for (const n of row) {
      positions.set(n.id, { x, y });
      x += sizeOf(n).width + GAP_X;
    }
    y += Math.max(...row.map((n) => sizeOf(n).height)) + GAP_Y;
  }
  return positions;
}
