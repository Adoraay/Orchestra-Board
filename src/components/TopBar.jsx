import { ClipboardList, Folder, Inbox, Search, Settings, Users } from 'lucide-react';
import lockup from '../assets/orchestra-lockup.svg';
import lockupLight from '../assets/orchestra-lockup-light.svg';
import { useSettings } from '../context/SettingsContext.jsx';
import useT from '../hooks/useT.js';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import { displayPath } from '../lib/paths.js';
import BoardTabs from './BoardTabs.jsx';

// Seule barre en haut de la fenêtre (elle sert aussi à la déplacer) : logo et nom, onglets des tableaux,
// dossier actif (donné au prochain agent), paramètres, puis les boutons Windows.
export default function TopBar({ boards, boardsWithNews, renameRequest, onOpenSettings, onOpenTasks, onOpenInbox, onOpenTeams, onOpenSearch, blockerCount = 0 }) {
  const { activeFolder, homeDir } = useWorkspace();
  const { settings } = useSettings();
  const t = useT();
  const actions = [
    { className: 'sequence-open', Icon: ClipboardList, label: t('sequences.title'), title: t('sequences.title'), onClick: onOpenTasks },
    { className: 'search-toggle', Icon: Search, label: t('topbar.search'), title: t('search.open'), onClick: onOpenSearch },
    { className: 'teams-toggle', Icon: Users, label: t('topbar.team'), title: t('team.title'), onClick: onOpenTeams },
    { className: 'inbox-toggle', Icon: Inbox, label: t('topbar.inbox'), title: t('inbox.title'), onClick: onOpenInbox, count: blockerCount },
    { className: 'settings-toggle', Icon: Settings, label: t('topbar.settingsLabel'), title: t('topbar.settings'), onClick: onOpenSettings },
  ];

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

      <div className={`topbar-actions no-drag${settings.appearance.expandToolbarOnHover === true ? ' expand-on-hover' : ''}`}>
        {actions.map(({ className, Icon, label, title, onClick, count }) => (
          <button key={className} className={`icon-button topbar-action ${className}${count ? ' has-blockers' : ''}`} title={title} aria-label={title} onClick={onClick}>
            <span className="topbar-action-icon"><Icon size={17} />{count > 0 && <span className="inbox-count">{count}</span>}</span>
            <span className="topbar-action-label" aria-hidden="true">{label}</span>
          </button>
        ))}
      </div>
      <span className="topbar-separator" />
    </header>
  );
}
