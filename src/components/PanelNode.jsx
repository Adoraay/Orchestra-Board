import { NodeResizer, useReactFlow } from '@xyflow/react';
import { X } from 'lucide-react';
import LogView from './LogView.jsx';
import UsageView from './UsageView.jsx';
import { useBoard } from '../context/BoardContext.jsx';
import useT from '../hooks/useT.js';

// Utilisation ou Journal posé sur la map (PLAN.md §3.24) : se déplace par son en-tête, le contenu reste utilisable.
export default function PanelNode({ id, data, selected }) {
  const t = useT();
  const { focusAgent, boardList } = useBoard();
  const { updateNodeData, deleteElements } = useReactFlow();
  const remove = (
    <button className="icon-button" title={t('panel.remove')} onClick={() => deleteElements({ nodes: [{ id }] })}>
      <X size={14} />
    </button>
  );

  return (
    <>
      <NodeResizer minWidth={240} minHeight={200} isVisible={selected} handleClassName="resize-handle" lineClassName="resize-line" />
      <div className={`panel-node ${selected ? 'selected' : ''}`}>
        {data.panel === 'usage' ? (
          <UsageView active live agentId={data.agentId ?? 'claude-code'} onSelectAgent={(agentId) => updateNodeData(id, { agentId })} actions={remove} />
        ) : (
          <LogView active onFocus={focusAgent} boards={boardList} actions={remove} />
        )}
      </div>
    </>
  );
}
