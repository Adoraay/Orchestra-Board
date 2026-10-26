import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Group, LayoutGrid, X } from 'lucide-react';
import FormationIllustration from './FormationIllustration.jsx';
import { FORMATIONS, formationDimensions } from '../lib/layout.js';
import useT from '../hooks/useT.js';

export default function LayoutToolbar({ count, canGroup, groupCount, onArrange, onPreview, onGroup }) {
  const t = useT();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = () => { setOpen(false); onPreview(null); };
  useEffect(() => {
    if (!open && !naming) return;
    const outside = (event) => { if (!ref.current?.contains(event.target)) { close(); setNaming(false); } };
    const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); setNaming(false); } };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', key, true); };
  }, [open, naming]);
  useEffect(() => () => onPreview(null), []);
  // Avec peu de cases, plusieurs modèles donnent la même disposition : on ne garde que le premier.
  const choices = FORMATIONS.filter((formation, index) => {
    const { columns, rows } = formationDimensions(count, formation);
    return !FORMATIONS.slice(0, index).some((other) => {
      const previous = formationDimensions(count, other);
      return previous.columns === columns && previous.rows === rows;
    });
  });
  const startNaming = () => { setName(t('layout.defaultGroup', { n: groupCount + 1 })); setNaming(true); close(); };
  const submit = (event) => {
    event.preventDefault();
    if (!canGroup || !name.trim()) return;
    onGroup(name.trim()); setName(''); setNaming(false);
  };

  return <div ref={ref} className="layout-toolbar nodrag nopan nowheel" aria-label={t('layout.title')}>
    <span className="layout-count">{t('layout.selected', { n: count })}</span>
    <button className="text-button layout-toggle" aria-expanded={open} aria-controls="layout-choices" onClick={() => { if (open) close(); else { setOpen(true); setNaming(false); } }}><LayoutGrid size={15} />{t('formation.title')}<ChevronDown size={13} /></button>
    {naming
      ? <form className="layout-group-form" onSubmit={submit}>
        <input autoFocus value={name} maxLength={40} aria-label={t('layout.groupName')} onFocus={(e) => e.target.select()} onChange={(e) => setName(e.target.value)} />
        <button className="icon-button" disabled={!name.trim()} title={t('layout.group')}><Check size={16} /></button>
        <button className="icon-button" type="button" title={t('common.cancel')} onClick={() => setNaming(false)}><X size={15} /></button>
      </form>
      : <button className="text-button layout-group-toggle" disabled={!canGroup} title={canGroup ? t('layout.group') : t('layout.groupBlocked')} onClick={startNaming}><Group size={15} />{t('layout.groupButton')}</button>}
    {open && <div id="layout-choices" className="layout-choices thin-scrollbar" aria-label={t('formation.title')} onPointerLeave={() => onPreview(null)}>
      <span className="field-label">{t('formation.choose')}</span>
      <div className="formation-grid">{choices.map((formation) => {
        const dimensions = formationDimensions(count, formation);
        return <button key={formation} className="layout-choice" data-formation={formation} title={t(`formation.hint.${formation}`)}
          onPointerEnter={() => onPreview(formation)} onFocus={() => onPreview(formation)}
          onClick={() => { onArrange(formation); close(); }}>
          <FormationIllustration formation={formation} count={Math.min(count, formation === 'grid' ? 64 : 12)} />
          <span>{t(`formation.${formation}`)}</span><small>{t('formation.dimensions', dimensions)}</small>
        </button>;
      })}</div>
      <p className="hint">{t('formation.hint')}</p>
    </div>}
  </div>;
}
