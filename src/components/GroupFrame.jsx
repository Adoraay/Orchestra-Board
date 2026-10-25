import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { GripHorizontal, Ungroup } from 'lucide-react';
import { boundsOf } from '../lib/layout.js';
import useT from '../hooks/useT.js';

export default function GroupFrame({ group, nodes, onMove, onRename, onUngroup, onSelect, enabled }) {
  const t = useT();
  const { getZoom } = useReactFlow();
  const start = useRef(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const bounds = boundsOf(nodes);
  if (!bounds) return null;
  const rename = () => { if (name.trim()) onRename(group.id, name.trim()); else setName(group.name); setEditing(false); };
  return <section className={`board-group ${enabled ? '' : 'inactive'}`} data-group-id={group.id} style={{ left: bounds.left - 18, top: bounds.top - 44, width: bounds.width + 36, height: bounds.height + 62 }}>
    <header className="board-group-header nodrag nopan" onPointerDown={(e) => {
      if (!enabled || editing || e.button !== 0 || e.target.closest('button:not(.board-group-name), input')) return;
      e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
      onSelect(group.members);
      start.current = { x: e.clientX, y: e.clientY, zoom: getZoom(), positions: new Map(nodes.map((node) => [node.id, node.position])) };
    }} onPointerMove={(e) => {
      if (!start.current) return;
      const initial = start.current;
      onMove(initial.positions, (e.clientX - initial.x) / initial.zoom, (e.clientY - initial.y) / initial.zoom);
    }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
      <GripHorizontal size={14} />
      {editing ? <input autoFocus maxLength={40} aria-label={t('layout.rename')} value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setName(group.name); setEditing(false); } }} /> : <button className="board-group-name" title={t('layout.moveHint')} onClick={() => onSelect(group.members)} onDoubleClick={() => { setName(group.name); setEditing(true); }}>{group.name}</button>}
      <button className="icon-button" title={t('layout.ungroup')} disabled={!enabled} onClick={() => onUngroup(group.id)}><Ungroup size={13} /></button>
    </header>
  </section>;
}
