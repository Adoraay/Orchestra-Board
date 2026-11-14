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

// Place d'un agent créé par le chef d'orchestre : rangée recentrée sous « near » s'il y a déjà des agents
// (siblingIds), sinon une place libre. Renvoie { position, moved: Map(id -> position des agents recentrés) }.
export function placeAgent(nodes, siblingIds, near, size, origin) {
  const row = near && siblingIds.length ? centeredRow(nodes, near, siblingIds, size) : null;
  if (!row) return { position: autoPlace(nodes, size, { near, origin }), moved: new Map() };
  const fresh = row.find((box) => !box.id);
  return { position: { x: fresh.x, y: fresh.y }, moved: new Map(row.filter((box) => box.id).map((box) => [box.id, { x: box.x, y: box.y }])) };
}

// Aperçu d'un plan du chef d'orchestre (actions en attente, dans l'ordre) : mêmes calculs que leur application,
// pour que les fantômes soient là où les cases arriveront. Renvoie les cases fantômes (créations, et nouvelle
// place des cases existantes déplacées), les liens proposés et les cases à retirer.
export function previewLayout(nodes, edges, pending, { origin, agentSize, noteSize }) {
  let work = nodes.map(({ id, position, style, measured, width, height }) => ({ id, position, style, measured, width, height }));
  const children = new Map();
  const ghosts = new Map();
  const links = [];
  const removing = new Set();
  const move = (moved) => { work = work.map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id) } : n)); };
  for (const item of pending) {
    if (item.type === 'create_agent') {
      const siblings = item.near ? children.get(item.near) ?? [] : [];
      const { position, moved } = placeAgent(work, siblings, item.near, agentSize, origin);
      move(moved);
      work.push({ id: item.tempId, position, style: { ...agentSize } });
      if (item.near) children.set(item.near, [...siblings, item.tempId]);
      ghosts.set(item.tempId, { kind: item.kind, data: { agentId: item.agentId, label: item.name, role: item.role, prompt: item.prompt, branch: item.branch } });
    } else if (item.type === 'create_sticky') {
      work.push({ id: item.tempId, position: autoPlace(work, noteSize, { near: item.near, origin }), style: { ...noteSize } });
      ghosts.set(item.tempId, { kind: 'sticky', data: { label: item.name, text: item.text } });
    } else if (item.type === 'create_link') {
      links.push({ id: item.tempId, source: item.source, target: item.target, mode: item.data.mode });
    } else if (item.type === 'remove_agent') {
      removing.add(item.target);
    } else if (item.type === 'arrange') {
      const positions = arrangeShape(work, [...edges, ...links], item.targets, item.layout, item.top);
      move(new Map([...positions, ...besideGroup(work, positions, item.companions ?? [])]));
    }
  }
  const real = new Map(nodes.map((n) => [n.id, n]));
  const result = [];
  for (const n of work) {
    if (ghosts.has(n.id)) result.push({ id: n.id, ...ghosts.get(n.id), position: n.position, size: sizeOf(n) });
    else if (real.has(n.id) && (real.get(n.id).position.x !== n.position.x || real.get(n.id).position.y !== n.position.y)) {
      result.push({ id: `move-${n.id}`, kind: 'move', of: n.id, data: {}, position: n.position, size: sizeOf(n) });
    }
  }
  return { ghosts: result, links, removing };
}

// Post-it qui accompagnent un groupe disposé (companionIds) : en colonne à sa droite, alignés sur son haut.
// positions : nouvelles places du groupe (arrangeShape). Renvoie Map(id -> position) des post-it.
export function besideGroup(nodes, positions, companionIds) {
  const placed = new Map();
  const group = nodes.filter((n) => positions.has(n.id));
  const notes = companionIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
  if (!group.length || !notes.length) return placed;
  const right = Math.max(...group.map((n) => positions.get(n.id).x + sizeOf(n).width));
  let y = Math.min(...group.map((n) => positions.get(n.id).y));
  for (const note of notes) {
    placed.set(note.id, { x: right + GAP_Y, y });
    y += sizeOf(note).height + MARGIN;
  }
  return placed;
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
