import { Gauge, ScrollText } from 'lucide-react';

// Panneaux du bord droit de la map qu'on peut poser sur le tableau (PLAN.md §3.24).
export const PANELS = {
  usage: { icon: Gauge, title: 'usage.title', size: { width: 300, height: 380 } },
  log: { icon: ScrollText, title: 'log.title', size: { width: 420, height: 520 } },
};

// Le panneau glissé est dans le nom du type : getData n'est pas lisible pendant dragover, types si.
const DRAG_PREFIX = 'application/x-orchestra-panel-';

// Image vide pour masquer le « fantôme » du navigateur : seul l'aperçu de la map doit se voir.
export const emptyDragImage = new Image();
emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function startPanelDrag(event, panel) {
  event.dataTransfer.setData(DRAG_PREFIX + panel, panel);
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
}

export function draggedPanel(dataTransfer) {
  const type = [...dataTransfer.types].find((name) => name.startsWith(DRAG_PREFIX));
  const panel = type?.slice(DRAG_PREFIX.length);
  return PANELS[panel] ? panel : null;
}
