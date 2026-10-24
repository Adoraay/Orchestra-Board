import { useEffect, useState } from 'react';
import { FolderOpen, Trash2, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import useT from '../hooks/useT.js';

export default function TeamTemplates({ board, getBoard, boardName, onCreate, onClose }) {
  const t = useT();
  const { agents, settings } = useSettings();
  const { activeFolder, rootPath } = useWorkspace();
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('use');
  const [name, setName] = useState(boardName);
  const [folder, setFolder] = useState(activeFolder || rootPath || '');
  const [installed, setInstalled] = useState({});
  const [replacements, setReplacements] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    const result = await window.teams.list();
    if (result.error) { setError(result.error); return; }
    setTemplates(result.value);
    setSelected((id) => result.value.some((item) => item.id === id) ? id : result.value[0]?.id ?? '');
  };
  useEffect(() => { refresh().catch(() => setError(t('team.failed'))); }, [settings.general.language]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(agents.map(async (agent) => [agent.id, !agent.command || (await window.agents.testCommand(agent.command).catch(() => ({ ok: false }))).ok]))
      .then((pairs) => { if (!cancelled) setInstalled(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [agents]);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const template = templates.find((item) => item.id === selected);
  const sourceIds = [...new Set(template?.board.nodes.filter((node) => node.type === 'terminal').map((node) => node.data.agentId) ?? [])];
  const compatible = (sourceId, agent) => {
    if (sourceId === 'shell') return agent.id === 'shell';
    const ids = new Set(template.board.nodes.filter((node) => node.type === 'terminal' && node.data.agentId === sourceId).map((node) => node.id));
    const needsHooks = template.board.nodes.some((node) => ids.has(node.id) && node.data.role) || template.board.edges.some((edge) => ids.has(edge.source) || (ids.has(edge.target) && (edge.data.mode === 'delegate' || edge.data.bidirectional)));
    return !needsHooks || Boolean(agent.hooks);
  };
  const choice = (id) => {
    if (Object.hasOwn(replacements, id)) return replacements[id];
    const agent = agents.find((entry) => entry.id === id);
    return agent && installed[id] && compatible(id, agent) ? id : '';
  };

  const perform = async (action) => {
    setBusy(true); setError('');
    try { await action(); } catch { setError(t('team.failed')); }
    finally { setBusy(false); }
  };
  const create = () => perform(async () => {
    const result = await window.teams.create(selected, folder, Object.fromEntries(sourceIds.map((id) => [id, choice(id)])));
    if (result.error) { setError(result.error); return; }
    if (!await onCreate(result.value.name, result.value.board)) { setError(t('team.boardLimit')); return; }
    onClose();
  });
  const save = () => perform(async () => {
    const result = await window.teams.save(name, getBoard());
    if (result.error) { setError(result.error); return; }
    await refresh(); setSelected(result.value.id); setReplacements({}); setConfirmDelete(false); setTab('use');
  });
  const remove = () => perform(async () => {
    const result = await window.teams.remove(selected);
    if (result.error) { setError(result.error); return; }
    setConfirmDelete(false); setReplacements({}); await refresh();
  });

  return <div className="modal-backdrop" onPointerDown={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
    <div className="modal team-modal" role="dialog" aria-modal="true" aria-labelledby="team-title">
      <header className="modal-header">
        <h1 id="team-title">{t('team.title')}</h1>
        <button className="icon-button" onClick={onClose} disabled={busy} title={t('common.close')}><X size={17} /></button>
      </header>
      <nav className="tabs" role="tablist">
        {['use', 'save'].map((id) => <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setError(''); }}>{t(`team.${id}Tab`)}</button>)}
      </nav>
      <div className="modal-body thin-scrollbar">
        {tab === 'save' ? <div className="settings-form">
          <p className="hint">{t('team.saveHint')}</p>
          <label className="field"><span>{t('team.name')}</span><input type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="text-button primary" disabled={busy || !name.trim() || !board.nodes.length} onClick={save}>{t('team.saveBoard')}</button>
        </div> : <>
          <div className="team-layout">
            <div className="team-list" role="list" aria-label={t('team.title')}>
              {templates.map((item) => <button key={item.id} className={`team-item ${item.id === selected ? 'active' : ''}`} onClick={() => { setSelected(item.id); setReplacements({}); setConfirmDelete(false); setError(''); }}>
                <span>{item.name}</span><span className="hint">{t(item.builtin ? 'team.recipe' : 'team.personal')}</span>
              </button>)}
            </div>
            {template && <div className="team-details settings-form">
              <p className="hint">{t('team.createHint')}</p>
              <label className="field"><span>{t('team.folder')}</span><div className="field-row">
                <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} />
                <button className="icon-button" title={t('team.pickFolder')} onClick={async () => { const picked = await window.fs.pickFolder(folder); if (picked) setFolder(picked); }}><FolderOpen size={16} /></button>
              </div></label>
              {sourceIds.map((id) => <label className="field" key={id}><span>{agents.find((agent) => agent.id === id)?.name || id}</span>
                <select value={choice(id)} onChange={(e) => setReplacements((current) => ({ ...current, [id]: e.target.value }))}>
                  <option value="">{t('team.chooseAgent')}</option>
                  {agents.filter((agent) => compatible(id, agent)).map((agent) => <option key={agent.id} value={agent.id} disabled={!installed[agent.id]}>{agent.name}{!installed[agent.id] ? ` — ${t('team.notInstalled')}` : ''}</option>)}
                </select>
              </label>)}
              <p className="hint">{t('team.includes', { nodes: template.board.nodes.length, links: template.board.edges.length })}</p>
              <div className="team-preview">{template.board.nodes.map((node) => <div key={node.id}><strong>{node.data.label || node.data.agentId || t('team.note')}</strong>{node.data.role && <p className="hint">{node.data.role}</p>}</div>)}</div>
            </div>}
          </div>
          <div className="dialog-actions">
            {template && !template.builtin && (confirmDelete ? <>
              <span className="hint">{t('team.deleteConfirm')}</span>
              <button className="text-button danger" disabled={busy} onClick={remove}>{t('common.yes')}</button>
              <button className="text-button" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
            </> : <button className="text-button" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />{t('team.delete')}</button>)}
            <button className="text-button primary" disabled={busy || !template || !folder.trim() || sourceIds.some((id) => !choice(id))} onClick={create}>{t('team.create')}</button>
          </div>
        </>}
        {error && <p role="alert" className="form-error">{error}</p>}
      </div>
    </div>
  </div>;
}
