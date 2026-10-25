import { Compass, FolderInput, Home } from 'lucide-react';
import { useState } from 'react';
import WorkspaceRecovery from './WorkspaceRecovery.jsx';
import AboutSection from './AboutSection.jsx';
import LanguageField from './LanguageField.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { LINK_MODES } from '../lib/links.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import { isMac } from '../lib/platform.js';
import useT from '../hooks/useT.js';

// Shells proposés : les noms propres ne se traduisent pas, les autres passent par shell.<id>.
// Sur Mac, le shell par défaut est celui de l'utilisateur (zsh en général).
const SHELLS = isMac
  ? [{ id: 'default', label: 'shell.defaultMac' }, { id: 'bash', name: 'Bash' }, { id: 'pwsh', name: 'PowerShell (pwsh)' }]
  : [
      { id: 'default' },
      { id: 'powershell', name: 'Windows PowerShell' },
      { id: 'pwsh', name: 'PowerShell 7 (pwsh)' },
      { id: 'cmd' },
      { id: 'bash', name: 'Git Bash' },
    ];

export default function GeneralTab({ onStartTutorial, onStartSetup }) {
  const [backupsOpen, setBackupsOpen] = useState(false);
  const { settings, updateSettings } = useSettings();
  const { rootPath, homeDir, changeRoot, resetRoot } = useWorkspace();
  const general = settings.general;
  const update = (patch) => updateSettings('general', patch);
  const t = useT();

  return (
    <div className="settings-form">
      <LanguageField />

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
          {SHELLS.map((s) => <option key={s.id} value={s.id}>{s.name ?? t(s.label ?? `shell.${s.id}`)}</option>)}
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
          {t(isMac ? 'general.notifyDesktopMac' : 'general.notifyDesktop')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={general.trustFolders} onChange={(e) => update({ trustFolders: e.target.checked })} />
          {t('general.trustFolders')}
        </label>
        <span className="hint">{t('general.trustHint')}</span>
        <label className="checkbox">
          <input type="checkbox" checked={general.codexOrchestration} onChange={(e) => update({ codexOrchestration: e.target.checked })} />
          {t('general.codexOrchestration')}
        </label>
        <span className="hint">{t('general.codexOrchestrationHint')}</span>
      </div>

      <div className="field">
        <span className="field-label">{t('general.tutorial')}</span>
        <div className="field-row">
          <button className="text-button" onClick={onStartTutorial}>
            <Compass size={15} />
            {t('general.tutorialRestart')}
          </button>
          <button className="text-button" onClick={onStartSetup}>{t('general.setupRestart')}</button>
        </div>
        <span className="hint">{t('general.tutorialHint')}</span>
      </div>

      <div className="field">
        <span className="field-label">{t('backup.title')}</span>
        <button className="text-button" onClick={() => setBackupsOpen(true)}>{t('backup.open')}</button>
        <span className="hint">{t('backup.description')}</span>
      </div>
      {backupsOpen && <WorkspaceRecovery onClose={() => setBackupsOpen(false)} />}
      <AboutSection />
    </div>
  );
}
