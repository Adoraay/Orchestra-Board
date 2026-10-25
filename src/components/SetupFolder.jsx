import { FolderOpen } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import useT from '../hooks/useT.js';

// Choix facultatif : aucun agent lancé et aucune équipe créée par la configuration.
export default function SetupFolder() {
  const t = useT();
  const { updateSettings } = useSettings();
  const { rootPath, homeDir, activeFolder, setActiveFolder } = useWorkspace();
  const folder = activeFolder || rootPath;
  const choose = async () => {
    const selected = await window.fs.pickFolder(folder);
    if (!selected) return;
    setActiveFolder(selected);
    updateSettings('general', { rootPath: selected });
  };
  return <div className="field setup-folder"><span>{t('setup.projectFolder')}</span><div className="field-row"><span className="hint">{folder ? displayPath(folder, homeDir) : t('topbar.none')}</span><button className="text-button" onClick={choose}><FolderOpen size={14} />{t('setup.chooseFolder')}</button></div><span className="hint">{t('setup.projectHint')}</span></div>;
}
