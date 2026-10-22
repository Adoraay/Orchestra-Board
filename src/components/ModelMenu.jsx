import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import useT from '../hooks/useT.js';

// Menu du bouton à côté d'un agent du dock : modèle des prochaines cases de cet agent.
// « Par défaut » = pas de --model, l'agent garde celui de sa configuration. Échap ou clic ailleurs le ferment.
export default function ModelMenu({ agent, anchor, current, onChoose, onClose }) {
  const t = useT();
  const ref = useRef(null);
  const [models, setModels] = useState(null);

  useEffect(() => {
    window.agents.models(agent.id).then(setModels);
  }, [agent.id]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target) && !anchor.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onClose);
    };
  }, [anchor, onClose]);

  const rect = anchor.getBoundingClientRect();
  const item = (id, label) => (
    <button key={id ?? 'default'} className="menu-item" role="menuitemradio" aria-checked={current === id} onClick={() => onChoose(id)}>
      <span className="menu-label">{label}</span>
      {current === id && <Check size={14} />}
    </button>
  );

  return (
    <div ref={ref} className="context-menu model-menu" role="menu" style={{ left: rect.right + 8, top: rect.top - 4 }}>
      <div className="menu-title">{t('model.title', { agent: agent.name })}</div>
      {item(null, t('model.default'))}
      {models?.length > 0 && <div className="menu-separator" />}
      {models?.map((m) => item(m.id, m.name))}
      {models?.length === 0 && <div className="menu-hint">{t('model.none')}</div>}
      {current && models && !models.some((m) => m.id === current) && item(current, current)}
    </div>
  );
}
