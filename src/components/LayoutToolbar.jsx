import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Group, LayoutGrid } from 'lucide-react';
import FormationIllustration from './FormationIllustration.jsx';
import { FORMATIONS, formationDimensions } from '../lib/layout.js';
import useT from '../hooks/useT.js';

export default function LayoutToolbar({ count, canGroup, onArrange, onGroup }) {
  const t = useT();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return <div ref={ref} className="layout-toolbar nodrag nopan nowheel" aria-label={t('layout.title')}>
    <span className="hint">{t('layout.selected', { n: count })}</span>
    <button className="text-button layout-toggle" aria-expanded={open} aria-controls="layout-choices" onClick={() => setOpen((value) => !value)}><LayoutGrid size={15} />{t('formation.title')}<ChevronDown size={13} /></button>
    <form onSubmit={(e) => { e.preventDefault(); if (canGroup && name.trim()) { onGroup(name.trim()); setName(''); } }}>
      <input value={name} maxLength={40} placeholder={t('layout.groupName')} aria-label={t('layout.groupName')} onChange={(e) => setName(e.target.value)} disabled={!canGroup} />
      <button className="icon-button" disabled={!canGroup || !name.trim()} title={t('layout.group')}><Group size={17} /></button>
    </form>
    {open && <div id="layout-choices" className="layout-choices thin-scrollbar" aria-label={t('formation.title')}>
      <span className="field-label">{t('formation.choose')}</span>
      <div className="formation-grid">{FORMATIONS.map((formation) => {
        const dimensions = formationDimensions(count, formation);
        return <button key={formation} className="layout-choice" data-formation={formation} title={t(`formation.hint.${formation}`)} onClick={() => { onArrange(formation); setOpen(false); }}>
          <FormationIllustration formation={formation} count={Math.min(count, formation === 'grid' ? 64 : 12)} />
          <span>{t(`formation.${formation}`)}</span><small>{t('formation.dimensions', dimensions)}</small>
        </button>;
      })}</div>
      <p className="hint">{t('formation.hint')}</p>
    </div>}
  </div>;
}
