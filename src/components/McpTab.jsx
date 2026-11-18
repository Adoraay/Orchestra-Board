import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';

const EMPTY_FORM = { id: '', type: 'http', url: '', command: '', args: '' };

export default function McpTab({ boardId, boardName, nodes, initialCardId }) {
  const t = useT();
  const { agentById } = useSettings();
  const [cardId, setCardId] = useState(initialCardId ?? '');
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const eligible = nodes.filter((node) => node.type === 'terminal' && agentById(node.data.agentId).hooks);

  useEffect(() => {
    let cancelled = false;
    window.mcpSettings.get(boardId, cardId || null).then((next) => {
      if (!cancelled && next) setConfig(next);
      if (!cancelled && !next) setError('saveFailed');
    }).catch(() => { if (!cancelled) setError('saveFailed'); });
    return () => { cancelled = true; };
  }, [boardId, cardId]);

  async function save(change) {
    setSaving(true);
    setError('');
    try {
      const result = await window.mcpSettings.save(boardId, cardId || null, change);
      if (result.error) {
        setError(result.error);
        return false;
      }
      setConfig(result.config);
      return true;
    } catch {
      setError('saveFailed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const inherited = Boolean(cardId && config?.card === null);
  const selection = config?.card ?? config?.board ?? [];
  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function addServer(event) {
    event.preventDefault();
    const args = form.args.split(/\r?\n/).filter(Boolean);
    if (await save({ add: { ...form, id: form.id.trim(), args } })) setForm(null);
  }

  return (
    <div className="settings-form mcp-settings">
      <label className="field">
        <span className="field-label">{t('mcp.scope')}</span>
        <select autoFocus value={cardId} disabled={saving} onChange={(event) => {
          setError('');
          setConfig(null);
          setCardId(event.target.value);
        }}>
          <option value="">{t('mcp.board', { name: boardName })}</option>
          {eligible.map((node) => <option key={node.id} value={node.id}>{node.data.label || agentById(node.data.agentId).name}</option>)}
        </select>
      </label>
      <p className="field-hint">{t('mcp.nextLaunch')}</p>
      {!config && !error && <p role="status">{t('mcp.loading')}</p>}
      {config && (
        <>
          {cardId && (
            <label className="check-row">
              <input type="checkbox" checked={inherited} disabled={saving} onChange={() => save({ selection: inherited ? config.board : null })} />
              {t('mcp.inherit')}
            </label>
          )}
          <fieldset className="field mcp-servers" disabled={saving}>
            <legend className="field-label">{t('mcp.servers')}</legend>
            <label className="check-row"><input type="checkbox" checked disabled /> Orchestra</label>
            {[...config.presets, ...config.custom].map(({ id, label }) => (
              <div className="field-row" key={id}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selection.includes(id)}
                    disabled={inherited}
                    onChange={() => save({ selection: selection.includes(id) ? selection.filter((server) => server !== id) : [...selection, id] })}
                  />
                  {label ?? id}
                </label>
                {!label && <button type="button" className="text-button danger" aria-label={t('mcp.removeNamed', { id })} onClick={() => save({ remove: id })}>{t('mcp.remove')}</button>}
              </div>
            ))}
          </fieldset>
          {form ? (
            <form className="field" onSubmit={addServer}>
              <label className="field"><span className="field-label">{t('mcp.serverId')}</span>
                <input autoFocus type="text" required maxLength={64} pattern={'[A-Za-z0-9_\\-]+'} value={form.id} onChange={(e) => updateForm('id', e.target.value)} />
              </label>
              <label className="field"><span className="field-label">{t('mcp.transport')}</span>
                <select value={form.type} onChange={(e) => updateForm('type', e.target.value)}><option value="http">HTTP</option><option value="stdio">stdio</option></select>
              </label>
              {form.type === 'http' ? (
                <label className="field"><span className="field-label">URL</span>
                  <input type="url" required value={form.url} onChange={(e) => updateForm('url', e.target.value)} />
                </label>
              ) : (
                <>
                  <label className="field"><span className="field-label">{t('mcp.command')}</span>
                    <input type="text" required value={form.command} onChange={(e) => updateForm('command', e.target.value)} />
                  </label>
                  <label className="field"><span className="field-label">{t('mcp.args')}</span>
                    <textarea rows={3} value={form.args} onChange={(e) => updateForm('args', e.target.value)} />
                  </label>
                </>
              )}
              <p className="field-hint">{t('mcp.credentials')}</p>
              <div className="field-row">
                <button type="submit" className="text-button primary" disabled={saving}>{t('mcp.add')}</button>
                <button type="button" className="text-button" onClick={() => { setForm(null); setError(''); }}>{t('common.cancel')}</button>
              </div>
            </form>
          ) : (
            <button type="button" className="text-button mcp-add" disabled={saving} onClick={() => setForm(EMPTY_FORM)}>{t('mcp.addCustom')}</button>
          )}
        </>
      )}
      {error && <p role="alert" className="link-warning">{t(`mcp.error.${error}`)}</p>}
    </div>
  );
}
