import { FolderInput, Home } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { LINK_MODES } from '../lib/links.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import { LANGUAGES } from '../lib/i18n.js';
import useT from '../hooks/useT.js';

// Shells proposés : les noms propres ne se traduisent pas, les autres passent par shell.<id>.
const SHELLS = [
  { id: 'default' },
  { id: 'powershell', name: 'Windows PowerShell' },
  { id: 'pwsh', name: 'PowerShell 7 (pwsh)' },
  { id: 'cmd' },
  { id: 'bash', name: 'Git Bash' },
];

export default function GeneralTab() {
  const { settings, updateSettings } = useSettings();
  const { rootPath, homeDir, changeRoot, resetRoot } = useWorkspace();
  const general = settings.general;
  const update = (patch) => updateSettings('general', patch);
  const t = useT();

  return (
    <div className="settings-form">
      <label className="field">
        <span className="field-label">{t('general.language')}</span>
        <select value={general.language} onChange={(e) => update({ language: e.target.value })}>
          {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>

      <div className="field">
        <span className="field-label">{t('general.root')}</span>
        <code className="path-display" title={rootPath ?? ''}>{displayPath(rootPath, homeDir) || '…'}</code>
        <div className="field-row">
          <button className="text-button" onClick={changeRoot}>
            <FolderInput size={15} />
            {t('general.change')}
          </button>
          <button className="text-button" disabled={!general.rootPath} onClick={resetRoot}>
            <Home size={15} />
            {t('general.home')}
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">{t('general.shell')}</span>
        <select value={general.shell} onChange={(e) => update({ shell: e.target.value })}>
          {SHELLS.map((s) => <option key={s.id} value={s.id}>{s.name ?? t(`shell.${s.id}`)}</option>)}
        </select>
        <span className="hint">{t('general.shellHint')}</span>
      </label>

      <div className="field">
        <span className="field-label">{t('general.linkMode')}</span>
        {LINK_MODES.map((mode) => (
          <label key={mode} className="mode-option">
            <input type="radio" name="link-mode" checked={general.linkMode === mode} onChange={() => update({ linkMode: mode })} />
            <span>
              <span className="mode-option-label">{t(`link.mode.${mode}`)}</span>
              <span className="hint">{t(`link.mode.${mode}.description`)}</span>
            </span>
          </label>
        ))}
        <span className="hint">{t('general.linkModeHint')}</span>
      </div>

      <div className="field">
        <span className="field-label">{t('general.behavior')}</span>
        <label className="checkbox">
          <input type="checkbox" checked={general.confirmClose} onChange={(e) => update({ confirmClose: e.target.checked })} />
          {t('general.confirmClose')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={general.notifySound} onChange={(e) => update({ notifySound: e.target.checked })} />
          {t('general.notifySound')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={general.notifyDesktop} onChange={(e) => update({ notifyDesktop: e.target.checked })} />
          {t('general.notifyDesktop')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={general.trustFolders} onChange={(e) => update({ trustFolders: e.target.checked })} />
          {t('general.trustFolders')}
        </label>
        <span className="hint">{t('general.trustHint')}</span>
      </div>
    </div>
  );
}
