import { FolderInput, Home } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';

const SHELLS = [
  { id: 'default', label: 'Par défaut (PowerShell)' },
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'pwsh', label: 'PowerShell 7 (pwsh)' },
  { id: 'cmd', label: 'Invite de commandes (cmd)' },
  { id: 'bash', label: 'Git Bash' },
];

export default function GeneralTab() {
  const { settings, updateSettings } = useSettings();
  const { rootPath, homeDir, changeRoot, resetRoot } = useWorkspace();
  const general = settings.general;
  const update = (patch) => updateSettings('general', patch);

  return (
    <div className="settings-form">
      <div className="field">
        <span className="field-label">Dossier racine de l'explorateur</span>
        <code className="path-display" title={rootPath ?? ''}>{displayPath(rootPath, homeDir) || '…'}</code>
        <div className="field-row">
          <button className="text-button" onClick={changeRoot}>
            <FolderInput size={15} />
            Changer
          </button>
          <button className="text-button" disabled={!general.rootPath} onClick={resetRoot}>
            <Home size={15} />
            Dossier personnel
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Shell des terminaux</span>
        <select value={general.shell} onChange={(e) => update({ shell: e.target.value })}>
          {SHELLS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="hint">S'applique aux prochaines cases (ou après « Relancer »).</span>
      </label>

      <div className="field">
        <span className="field-label">Comportement</span>
        <label className="checkbox">
          <input type="checkbox" checked={general.confirmClose} onChange={(e) => update({ confirmClose: e.target.checked })} />
          Confirmer avant de fermer une case qui travaille
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={general.notifySound} onChange={(e) => update({ notifySound: e.target.checked })} />
          Son quand un agent termine sa tâche
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={general.notifyDesktop} onChange={(e) => update({ notifyDesktop: e.target.checked })} />
          Notification Windows quand l'app n'est pas au premier plan
        </label>
      </div>
    </div>
  );
}
