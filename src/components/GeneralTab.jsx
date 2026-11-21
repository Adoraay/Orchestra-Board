import { Compass, FolderInput, Home } from 'lucide-react';
import { useState } from 'react';
import WorkspaceRecovery from './WorkspaceRecovery.jsx';
import AboutSection from './AboutSection.jsx';
import LanguageField from './LanguageField.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { LINK_MODES } from '../lib/links.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import useT from '../hooks/useT.js';

const MAX_CONDUCTOR_AGENTS = 20; // = settingsStore.cjs
const MODEL = /^[a-z0-9][\w.\-[\]]{0,63}$/i; // = settingsStore.cjs
const ENGINES = ['claude', 'codex', 'antigravity'];

// Shells proposés : les noms propres ne se traduisent pas, les autres passent par shell.<id>.
const SHELLS = [
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

      <div className="field">
        <span className="field-label">{t('general.conductor')}</span>
        {ENGINES.map((engine) => (
          <label key={engine} className="mode-option">
            <input type="radio" name="conductor-engine" checked={settings.conductor.engine === engine} onChange={() => updateSettings('conductor', { engine })} />
            <span>
              <span className="mode-option-label">{t(`conductor.engine.${engine}`)}</span>
              <span className="hint">{t(`general.conductorEngine.${engine}`)}</span>
            </span>
          </label>
        ))}
        <label className="field-row">
          {t('general.conductorModel')}
          <input
            key={settings.conductor.model ?? ''}
            defaultValue={settings.conductor.model ?? ''}
            placeholder={t('general.conductorModelDefault')}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (!value || MODEL.test(value)) updateSettings('conductor', { model: value || null });
              else e.target.value = settings.conductor.model ?? '';
            }}
          />
        </label>
        <label className="field-row">
          {t('general.conductorMaxAgents')}
          <input
            type="number"
            min={1}
            max={MAX_CONDUCTOR_AGENTS}
            value={settings.conductor.maxAgents}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= MAX_CONDUCTOR_AGENTS) updateSettings('conductor', { maxAgents: value });
            }}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.conductor.tileTools} onChange={(e) => updateSettings('conductor', { tileTools: e.target.checked })} />
          {t('general.conductorTileTools')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.conductor.autoApply} onChange={(e) => updateSettings('conductor', { autoApply: e.target.checked })} />
          {t('general.conductorAutoApply')}
        </label>
        <span className="hint">{t('general.conductorAutoHint')}</span>
        <span className="hint">{t('general.conductorHint')}</span>
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
