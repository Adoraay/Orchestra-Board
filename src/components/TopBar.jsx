import { Folder, Settings, Users, Inbox } from 'lucide-react';
import lockup from '../assets/orchestra-lockup.svg';
import lockupLight from '../assets/orchestra-lockup-light.svg';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import BoardTabs from './BoardTabs.jsx';

// Seule barre en haut de la fenêtre (elle sert aussi à la déplacer) : logo et nom, onglets des tableaux,
// dossier actif (donné au prochain agent), paramètres, puis les boutons Windows.
export default function TopBar({ boards, boardsWithNews, renameRequest, onOpenSettings, onOpenTeams, onOpenInbox, blockerCount }) {
  const { activeFolder, homeDir } = useWorkspace();
  const { settings } = useSettings();
  const t = useT();

  return (
    <header className="topbar">
      <img className="topbar-lockup" src={settings.appearance.theme === 'light' ? lockupLight : lockup} alt="Orchestra" draggable={false} />
      <span className="topbar-separator" />

      <BoardTabs
        boards={boards.boards}
        activeId={boards.activeId}
        onSelect={boards.setActiveId}
        onCreate={boards.createBoard}
        onRename={boards.renameBoard}
        onDelete={boards.deleteBoard}
        agentCount={boards.agentCount}
        boardsWithNews={boardsWithNews}
        renameRequest={renameRequest}
      />

      <div className="topbar-folder no-drag" title={activeFolder || undefined}>
        <Folder size={15} />
        <span className="muted">{t('topbar.activeFolder')}</span>
        <span className={activeFolder ? 'topbar-path' : 'muted'}>
          {activeFolder ? displayPath(activeFolder, homeDir) : t('topbar.none')}
        </span>
      </div>

      <button className="icon-button no-drag" title={t('team.title')} onClick={onOpenTeams}><Users size={17} /></button>
      <button className={`icon-button no-drag inbox-toggle ${blockerCount ? 'has-blockers' : ''}`} title={t('inbox.title')} onClick={onOpenInbox}>
        <Inbox size={17} />{blockerCount > 0 && <span className="inbox-count">{blockerCount}</span>}
      </button>
      <button className="icon-button no-drag" title={t('topbar.settings')} onClick={onOpenSettings}>
        <Settings size={17} />
      </button>
      <span className="topbar-separator" />
    </header>
  );
}
