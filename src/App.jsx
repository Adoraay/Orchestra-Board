import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { Minimize2 } from 'lucide-react';
import AgentDock from './components/AgentDock.jsx';
import AgentLogo from './components/AgentLogo.jsx';
import AgentsBar from './components/AgentsBar.jsx';
import BoardToolbar from './components/BoardToolbar.jsx';
import DeleteDialog from './components/DeleteDialog.jsx';
import DrawingLayer from './components/DrawingLayer.jsx';
import DropPreview from './components/DropPreview.jsx';
import ExplorerPanel from './components/ExplorerPanel.jsx';
import FloatingEdge from './components/FloatingEdge.jsx';
import LinkPanel from './components/LinkPanel.jsx';
import LogPanel from './components/LogPanel.jsx';
import MiniMapNode from './components/MiniMapNode.jsx';
import NodeMenu from './components/NodeMenu.jsx';
import NoteNode from './components/NoteNode.jsx';
import QuitDialog from './components/QuitDialog.jsx';
import ResumeDialog from './components/ResumeDialog.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import TerminalNode from './components/TerminalNode.jsx';
import UsagePanel from './components/UsagePanel.jsx';
import TextNode from './components/TextNode.jsx';
import Tutorial from './components/Tutorial.jsx';
import UpdateDialog from './components/UpdateDialog.jsx';
import Toast from './components/Toast.jsx';
import WorkspaceRecovery from './components/WorkspaceRecovery.jsx';
import TeamTemplates from './components/TeamTemplates.jsx';
import BlockersInbox from './components/BlockersInbox.jsx';
import TopBar from './components/TopBar.jsx';
import TileSearch from './components/TileSearch.jsx';
import TasksDialog from './components/TasksDialog.jsx';
import LayoutToolbar from './components/LayoutToolbar.jsx';
import GroupsLayer from './components/GroupsLayer.jsx';
import { arrangeNodes, cleanGroups } from './lib/layout.js';
import { hasModifier } from './lib/platform.js';
import usePendingMessages from './hooks/usePendingMessages.js';
import { BoardContext } from './context/BoardContext.jsx';
import { useSettings } from './context/SettingsContext.jsx';
import { useWorkspace } from './context/WorkspaceContext.jsx';
import useBoardHistory from './hooks/useBoardHistory.js';
import useBoardShortcuts from './hooks/useBoardShortcuts.js';
import useBoxSelection from './hooks/useBoxSelection.js';
import useGridGlow from './hooks/useGridGlow.js';
import usePenDrawing from './hooks/usePenDrawing.js';
import useAgentNotifications from './hooks/useAgentNotifications.js';
import useAppShortcuts from './hooks/useAppShortcuts.js';
import useBoards from './hooks/useBoards.js';
import useT from './hooks/useT.js';
import { DEFAULT_LINK } from './lib/links.js';

const nodeTypes = { terminal: TerminalNode, note: NoteNode, text: TextNode };
const DUPLICATE_OFFSET = 40; // px : une copie apparaît en décalé de l'original
const NOTE_SIZE = { width: 270, height: 180 }; // plus large que haut : les lignes écrites par un agent restent lisibles
const edgeTypes = { floating: FloatingEdge };
const BOARD_HINTS = ['pen', 'note', 'text', 'link']; // outils avec un bandeau d'aide (board.hint.<outil>)
const NODE_SIZE = { width: 640, height: 400 };
const GRID_VARIANTS = { dots: BackgroundVariant.Dots, lines: BackgroundVariant.Lines };

// Nom par défaut d'une nouvelle case : « Claude Code 1 », « Claude Code 2 »… (plus petit numéro libre du tableau).
function numberedName(agentName, nodes) {
  const used = new Set(nodes.map((n) => n.data?.label));
  let n = 1;
  while (used.has(`${agentName} ${n}`)) n++;
  return `${agentName} ${n}`;
}

// Les tableaux sauvegardés sont chargés avant l'affichage : chaque map part de son état sauvegardé
// (et pas d'une étape que Ctrl+Z pourrait annuler).
export default function App() {
  const [saved, setSaved] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState(false);
  const t = useT();

  useEffect(() => {
    window.workspace.startup().then((result) => {
      if (result.recovery) setRecovery(true);
      else setSaved(result.workspace);
    }).catch(() => setError(true));
  }, []);

  if (error) return <p role="alert">{t('backup.failed')}</p>;
  if (recovery) return <WorkspaceRecovery recovery />;
  return saved ? <Workspace saved={saved} /> : null;
}

// Barre du haut avec les onglets des tableaux, tableau ouvert, explorateur et paramètres.
function Workspace({ saved }) {
  const boards = useBoards(saved);
  const { activeId, content, updateContent } = boards;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [blockers, setBlockers] = useState([]);
  useEffect(() => {
    let changed = false;
    let disposed = false;
    const off = window.blockers.onChange((entries) => { changed = true; setBlockers(entries); });
    window.blockers.get().then((entries) => { if (!disposed && !changed) setBlockers(entries); });
    return () => { disposed = true; off(); };
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const onBoardChange = useCallback((state) => updateContent(activeId, state), [activeId, updateContent]);
  // Post-it d'un autre tableau réécrit par un agent (lien Note) ; le tableau ouvert s'en charge lui-même.
  useEffect(
    () =>
      window.notes.onWrite((id, text) => {
        for (const [boardId, state] of Object.entries(content)) {
          if (boardId === activeId || !state.nodes.some((n) => n.id === id)) continue;
          updateContent(boardId, { ...state, nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)) });
        }
      }),
    [content, activeId, updateContent],
  );
  const { boardsWithNews, running, focusRequest, focusAgent, clearFocus } = useAgentNotifications(boards);
  const { settings, agentById, updateSettings } = useSettings();
  // Panneaux épinglés (PLAN.md §7, 3.4) : rouverts au lancement ; Journal prioritaire sur Utilisation (même bord).
  const pinned = settings.general.pinned;
  const pin = useCallback((panel, value) => updateSettings('general', { pinned: { ...settings.general.pinned, [panel]: value } }), [settings.general.pinned, updateSettings]);
  const [agentsBarOpen, setAgentsBarOpen] = useState(() => pinned.agentsBar);
  const [usageOpen, setUsageOpen] = useState(() => pinned.usage && !pinned.log);
  const [usageAgent, setUsageAgent] = useState('claude-code');
  const [logOpen, setLogOpen] = useState(() => pinned.log);
  // Utilisation et Journal partagent le bord droit de la map : un seul ouvert à la fois.
  const toggleUsage = useCallback(() => {
    setLogOpen(false);
    setUsageOpen((o) => !o);
  }, []);
  const toggleLog = useCallback(() => {
    setUsageOpen(false);
    setLogOpen((o) => !o);
  }, []);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [renameRequest, setRenameRequest] = useState(null); // tableau créé au clavier : on propose de le nommer
  const [launchRequest, setLaunchRequest] = useState(null); // « Lancer un agent ici » dans l'explorateur
  const clearLaunch = useCallback(() => setLaunchRequest(null), []);
  // Tutoriel (PLAN.md §3.21) : 'setup' (assistant de personnalisation) puis 'tour' au premier lancement,
  // 'tour' seul relancé depuis les paramètres.
  const [tutorial, setTutorial] = useState(() => (settings.general.tutorialDone ? null : 'setup'));
  const finishTutorial = useCallback(() => {
    setTutorial(null);
    updateSettings('general', { tutorialDone: true });
  }, [updateSettings]);
  const startTutorial = useCallback(() => {
    setSettingsOpen(false);
    setTutorial('tour');
  }, []);
  const startSetup = useCallback(() => {
    setSettingsOpen(false);
    setTutorial('setup');
  }, []);

  useAppShortcuts({
    toggleSettings: () => setSettingsOpen((o) => !o),
    cycleBoard: (step) => {
      const list = boards.boards;
      const index = list.findIndex((b) => b.id === activeId);
      boards.setActiveId(list[(index + step + list.length) % list.length].id);
    },
    goToBoard: (n) => {
      const list = boards.boards;
      const board = n === 9 ? list[list.length - 1] : list[n - 1];
      if (board) boards.setActiveId(board.id);
    },
    createBoard: () => setRenameRequest(boards.createBoard()),
    toggleExplorer: () => setExplorerOpen((o) => !o),
    toggleAgentsBar: () => setAgentsBarOpen((o) => !o),
    toggleUsage,
    toggleLog,
    toggleSearch: () => setSearchOpen((o) => !o),
  });

  // Démarrage : une seule question pour reprendre (ou non) les conversations de tous les agents restaurés.
  // 'pending' = question affichée, 'resume' / 'new' = appliqué à chaque case restaurée (même dans un tableau
  // ouvert plus tard), 'manual' = chaque case demande elle-même.
  const [resumable] = useState(() =>
    boards.boards.flatMap((b) =>
      content[b.id].nodes
        .filter((n) => n.type === 'terminal' && n.data.restored && agentById(n.data.agentId).resumeArgs)
        .map((n) => ({ id: n.id, boardId: b.id, name: n.data.label || agentById(n.data.agentId).name, agent: agentById(n.data.agentId) })),
    ),
  );
  const [resumeChoice, setResumeChoice] = useState(resumable.length ? 'pending' : 'manual');

  // Nouvelle version (PLAN.md §3.22) : vérifiée pendant l'écran de démarrage (5 s max côté Node), sa fenêtre
  // passe avant la personnalisation, le tutoriel et « Reprendre ? ». 'checking', null, ou les infos de la version.
  const [update, setUpdate] = useState('checking');
  useEffect(() => {
    const off = window.updates.onAvailable(setUpdate);
    window.updates.check().then((result) => setUpdate((u) => (u === 'checking' ? (result.available ? result : null) : u)));
    return off;
  }, []);
  const closeUpdate = useCallback(() => setUpdate(null), []);

  // Fermeture de la fenêtre pendant que des agents travaillent : Node envoie la liste, on demande.
  const [quitAgents, setQuitAgents] = useState(null);
  useEffect(() => window.appWindow.onConfirmQuit(setQuitAgents), []);
  const closeQuit = useCallback(() => setQuitAgents(null), []);
  const quitList = quitAgents?.map((a) => {
    const board = boards.boards.find((b) => content[b.id]?.nodes.some((n) => n.id === a.id));
    const node = board && content[board.id].nodes.find((n) => n.id === a.id);
    return { ...a, agent: agentById(node?.data.agentId), boardName: boards.boards.length > 1 ? board?.name : null };
  });

  // Panneaux posés sur la map : leur état vit ici, car la map est recréée à chaque changement de tableau.
  const overlays = (
    <>
      <UsagePanel open={usageOpen} onToggle={toggleUsage} agentId={usageAgent} onSelectAgent={setUsageAgent} pinned={pinned.usage} onPin={(v) => pin('usage', v)} />
      <LogPanel open={logOpen} onToggle={toggleLog} onFocus={focusAgent} boards={boards.boards} pinned={pinned.log} onPin={(v) => pin('log', v)} />
      <AgentsBar
        boards={boards.boards}
        content={content}
        activeId={activeId}
        running={running}
        open={agentsBarOpen}
        onToggle={() => setAgentsBarOpen((o) => !o)}
        onFocus={focusAgent}
        pinned={pinned.agentsBar}
        onPin={(v) => pin('agentsBar', v)}
      />
    </>
  );

  return (
    <div className="app">
      {boards.saveError && <div className="toast" role="alert">{t('backup.saveFailed')}</div>}
      <TopBar
        boards={boards}
        boardsWithNews={boardsWithNews}
        renameRequest={renameRequest}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTeams={() => setTeamsOpen(true)}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenTasks={() => setTasksOpen(true)}
        blockerCount={blockers.filter((entry) => !entry.resolved).length}
      />
      <div className="workspace">
        {/* Un ReactFlowProvider par tableau : changer d'onglet repart d'un état React Flow neuf. */}
        <ReactFlowProvider key={activeId}>
          <Board
            initial={content[activeId]}
            onChange={onBoardChange}
            focusRequest={focusRequest}
            onFocusDone={clearFocus}
            overlays={overlays}
            resumeChoice={resumeChoice}
            running={running}
            launchRequest={launchRequest}
            onLaunchDone={clearLaunch}
          />
        </ReactFlowProvider>
        <ExplorerPanel
          open={explorerOpen}
          onToggle={() => setExplorerOpen((o) => !o)}
          onLaunchAgent={(agentId, cwd) => setLaunchRequest({ agentId, cwd, at: Date.now() })}
        />
      </div>
      {settingsOpen && <SettingsModal onClose={closeSettings} onStartTutorial={startTutorial} onStartSetup={startSetup} />}
      {tasksOpen && <TasksDialog boards={boards.boards} content={content} onFocus={(id) => { setTasksOpen(false); focusAgent(id); }} onClose={() => setTasksOpen(false)} />}
      {teamsOpen && <TeamTemplates board={content[activeId]} getBoard={() => content[activeId]} boardName={boards.boards.find((b) => b.id === activeId)?.name || ''} onCreate={boards.addBoard} onClose={() => setTeamsOpen(false)} />}
      {searchOpen && (
        <TileSearch boards={boards.boards} content={content} activeId={activeId} onFocus={focusAgent} onClose={() => setSearchOpen(false)} />
      )}
      {inboxOpen && <BlockersInbox entries={blockers} onFocus={focusAgent} onClose={() => setInboxOpen(false)} />}
      {tutorial && resumeChoice !== 'pending' && !update && (
        tutorial === 'setup' ? (
          <SetupWizard onFinish={() => setTutorial('tour')} />
        ) : (
          <Tutorial board={content[activeId]} onFinish={finishTutorial} />
        )
      )}
      {resumeChoice === 'pending' && !update && (
        <ResumeDialog
          agents={resumable}
          boardCount={new Set(resumable.map((a) => a.boardId)).size}
          onChoose={setResumeChoice}
        />
      )}
      {update && update !== 'checking' && <UpdateDialog info={update} onClose={closeUpdate} />}
      {quitList && <QuitDialog agents={quitList} onCancel={closeQuit} onQuit={() => window.appWindow.quit()} />}
    </div>
  );
}

// Un tableau : dock des agents et map. Remonté à chaque changement d'onglet.
function Board({ initial, onChange, focusRequest, onFocusDone, overlays, resumeChoice, running, launchRequest, onLaunchDone }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [viewport, setViewport] = useState(initial.viewport);
  const [formationRequest, setFormationRequest] = useState(null);
  const { screenToFlowPosition, fitView, deleteElements } = useReactFlow();
  useEffect(() => {
    if (!formationRequest) return;
    const frame = requestAnimationFrame(() => fitView({ nodes: formationRequest.map((id) => ({ id })), duration: 200, padding: 0.25, maxZoom: 1 }));
    return () => cancelAnimationFrame(frame);
  }, [formationRequest, fitView]);

  // Clic sur une notification Windows ou dans la barre des agents : on centre la map sur la case et on la
  // choisit (après sa mesure si le tableau vient de s'ouvrir). Demande effacée une fois servie.
  useEffect(() => {
    if (!focusRequest) return;
    const timer = setTimeout(() => {
      fitView({ nodes: [{ id: focusRequest.id }], duration: 400, padding: 0.3, maxZoom: 1 });
      setNodes((nds) => nds.map((n) => (Boolean(n.selected) === (n.id === focusRequest.id) ? n : { ...n, selected: n.id === focusRequest.id })));
      onFocusDone();
    }, 120);
    return () => clearTimeout(timer);
  }, [focusRequest, fitView, setNodes, onFocusDone]);
  const { activeFolder, homeDir } = useWorkspace();
  const [toast, setToast] = useState(null);
  const { settings, agentById } = useSettings();
  const t = useT();
  const grid = settings.appearance.grid;
  const glow = settings.appearance.glow;
  const light = settings.appearance.theme === 'light';

  // Barre d'outils (PLAN.md §3.8)
  const [tool, setTool] = useState('select');
  const [strokes, setStrokes] = useState(initial.strokes);
  const [groups, setGroups] = useState(initial.groups ?? []);
  const [selectedStroke, setSelectedStroke] = useState(null);
  const [linkSource, setLinkSource] = useState(null); // case cliquée en premier avec l'outil Lien
  const [branchTarget, setBranchTarget] = useState(null); // case survolée en glissant « Branche »
  const [branchPicker, setBranchPicker] = useState(null); // case dont la barre des branches est ouverte
  const [linkEvents, setLinkEvents] = useState({}); // id du lien -> dernier état de transmission
  const [renameRequest, setRenameRequest] = useState(null); // F2 : { id, at } de la case à renommer
  const [editRequest, setEditRequest] = useState(null); // « Modifier le texte » d'un post-it ou d'un texte : { id, at }
  const [maximized, setMaximized] = useState(null); // case dont le terminal est affiché en grand (PLAN.md §7, 3.3)
  const [maxSlot, setMaxSlot] = useState(null);
  const pendingMessages = usePendingMessages();
  const board = useMemo(
    () => ({ tool, linkSource, branchTarget, branchPicker, setBranchPicker, linkEvents, pendingMessages, resumeChoice, renameRequest, editRequest, maximized, setMaximized, maxSlot }),
    [tool, linkSource, branchTarget, branchPicker, linkEvents, pendingMessages, resumeChoice, renameRequest, editRequest, maximized, maxSlot],
  );

  // F2 : renommer la case terminal choisie, ou celle dont le terminal a le curseur. En capture, pour que
  // le terminal ne reçoive pas la touche.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  useEffect(() => {
    const onKeyDown = (event) => {
      // Cmd/Ctrl+Maj+M : agrandir la case choisie ou celle dont le terminal a le curseur.
      if (hasModifier(event) && event.shiftKey && !event.altKey && event.code === 'KeyM') {
        if (document.querySelector('.modal-backdrop, .dialog')) return;
        const focusedId = document.activeElement?.closest('.react-flow__node-terminal')?.dataset.id;
        const selected = nodesRef.current.filter((n) => n.selected && n.type === 'terminal');
        event.preventDefault();
        event.stopPropagation();
        setMaximized((current) => (current ? null : focusedId ?? (selected.length === 1 ? selected[0].id : null)));
        return;
      }
      if (event.key !== 'F2' || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      const focused = document.activeElement;
      if (focused?.matches('input, textarea, [contenteditable="true"]') && !focused.closest('.xterm')) return;
      if (focused?.closest('.explorer')) return; // F2 de l'explorateur : renommer le dossier ou fichier
      const selected = nodesRef.current.filter((n) => n.selected && n.type === 'terminal');
      const id = focused?.closest('.react-flow__node-terminal')?.dataset.id ?? (selected.length === 1 ? selected[0].id : null);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      setRenameRequest({ id, at: Date.now() });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(
    () => window.links.onEvent((id, event) => setLinkEvents((all) => ({ ...all, [id]: { ...event, at: Date.now() } }))),
    [],
  );
  const pen = usePenDrawing({ enabled: tool === 'pen', onStroke: (s) => setStrokes((all) => [...all, s]) });

  // Rectangle de sélection au clic droit (outil Sélection) : les cases touchées deviennent la sélection.
  const boxSelection = useBoxSelection({
    enabled: tool === 'select',
    onSelect: (ids) => {
      const chosen = new Set(ids);
      setNodes((nds) => nds.map((n) => (Boolean(n.selected) === chosen.has(n.id) ? n : { ...n, selected: chosen.has(n.id) })));
      setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setSelectedStroke(null);
    },
  });
  // Le stylo (clic gauche) et le rectangle (clic droit) écoutent les mêmes événements de la map.
  const pointerHandlers = Object.fromEntries(
    ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel'].map((name) => [
      name,
      (event) => {
        pen.handlers[name](event);
        boxSelection.handlers[name](event);
      },
    ]),
  );

  // Un trait choisi désélectionne cases et liens (et inversement, via onNodeClick / onEdgeClick).
  const selectStroke = useCallback(
    (id) => {
      setSelectedStroke(id);
      setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
    },
    [setNodes, setEdges],
  );

  const deleteStroke = useCallback((id) => {
    setStrokes((all) => all.filter((s) => s.id !== id));
    setSelectedStroke((current) => (current === id ? null : current));
  }, []);

  // Outil Lien : les terminaux ne doivent plus recevoir le clavier. « Relier à… » du menu d'une case passe
  // en mode Lien avec cette case déjà choisie comme source.
  const pendingLinkSource = useRef(null);
  useEffect(() => {
    setLinkSource(pendingLinkSource.current);
    pendingLinkSource.current = null;
    if (tool === 'link' && document.activeElement?.closest('.terminal-node')) document.activeElement.blur();
  }, [tool]);

  // Outil Lien : clic sur A (source, qui s'illumine) puis clic sur B = lien A -> B.
  const onNodeClick = useCallback(
    (_event, node) => {
      setSelectedStroke(null);
      if (tool !== 'link' || (node.type !== 'terminal' && node.type !== 'note')) return;
      if (!linkSource || linkSource === node.id) {
        setLinkSource(linkSource ? null : node.id);
        return;
      }
      const sourceNode = nodes.find((n) => n.id === linkSource);
      // Un agent relié à un post-it : lien Note, toujours de l'agent vers le post-it. Pas de lien entre deux
      // post-it, ni avec une case Terminal (elle n'a pas d'outils).
      const isNote = (n) => n?.type === 'note';
      if (isNote(sourceNode) || isNote(node)) {
        const [agentNode, noteNode] = isNote(node) ? [sourceNode, node] : [node, sourceNode];
        setLinkSource(null);
        if (isNote(agentNode) || agentNode?.data.agentId === 'shell') return;
        if (!noteNode.data.label) {
          setNodes((nds) => nds.map((n) => (n.id === noteNode.id ? { ...n, data: { ...n.data, label: numberedName(t('note.defaultName'), nds) } } : n)));
        }
        setEdges((eds) => addEdge({ source: agentNode.id, target: noteNode.id, type: 'floating', data: { ...DEFAULT_LINK, mode: 'note' } }, eds));
        return;
      }
      // Un agent relié à une case Terminal : lien Terminal, toujours de l'agent vers le terminal (PLAN.md §3.17).
      const isShell = (n) => n?.data.agentId === 'shell';
      const terminal = isShell(sourceNode) !== isShell(node);
      const [source, target] = terminal && isShell(sourceNode) ? [node.id, linkSource] : [linkSource, node.id];
      const mode = terminal ? 'terminal' : settings.general.linkMode;
      setEdges((eds) => addEdge({ source, target, type: 'floating', data: { ...DEFAULT_LINK, mode } }, eds));
      setLinkSource(null);
    },
    [tool, linkSource, nodes, setNodes, setEdges, settings.general.linkMode, t],
  );

  // Post-it de ce tableau réécrit par un agent (lien Note).
  useEffect(
    () =>
      window.notes.onWrite((id, text) =>
        setNodes((nds) => (nds.some((n) => n.id === id) ? nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)) : nds)),
      ),
    [setNodes],
  );

  // Un seul lien choisi avec l'outil Sélection : son panneau de réglages s'ouvre (PLAN.md §3.5).
  const selectedEdges = edges.filter((e) => e.selected);
  const panelEdge = tool === 'select' && selectedEdges.length === 1 ? selectedEdges[0] : null;
  const updateLink = useCallback(
    (id, patch) =>
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== id) return e;
          return { ...e, data: { ...DEFAULT_LINK, ...e.data, ...patch } };
        }),
      ),
    [setEdges],
  );

  const liveGroups = useMemo(() => cleanGroups(groups, nodes), [groups, nodes]);
  const history = useBoardHistory({ nodes, edges, strokes, groups: liveGroups, setNodes, setEdges, setStrokes, setGroups });

  // Le contenu remonte à chaque changement : c'est ce qui est sauvegardé et relu quand on revient sur l'onglet.
  useEffect(() => {
    onChange({ nodes, edges, strokes, groups: liveGroups, viewport });
  }, [nodes, edges, strokes, liveGroups, viewport, onChange]);

  // Suppr : tout ce qui est choisi (cases terminal comprises), après confirmation.
  // only : un seul élément, depuis son menu du clic droit (la sélection n'est alors pas touchée).
  const [deleteRequest, setDeleteRequest] = useState(null);
  const requestDelete = (only) => {
    const chosen = only ? [only] : nodes.filter((n) => n.selected);
    const chosenEdges = only ? [] : selectedEdges;
    const stroke = only ? null : selectedStroke;
    const terminals = chosen
      .filter((n) => n.type === 'terminal')
      .map((n) => ({ id: n.id, name: n.data.label || agentById(n.data.agentId).name, agent: agentById(n.data.agentId), status: running[n.id]?.status }));
    const selection = {
      terminals,
      links: chosenEdges.length,
      notes: chosen.filter((n) => n.type === 'note').length,
      texts: chosen.filter((n) => n.type === 'text').length,
      strokes: stroke ? 1 : 0,
      nodeIds: chosen.map((n) => n.id),
      edgeIds: chosenEdges.map((e) => e.id),
      stroke,
    };
    if (terminals.length || selection.links || selection.notes || selection.texts || selection.strokes) setDeleteRequest(selection);
  };
  const confirmDelete = () => {
    for (const t of deleteRequest.terminals) window.pty.kill(t.id);
    // deleteElements retire aussi les liens attachés aux cases supprimées.
    deleteElements({ nodes: deleteRequest.nodeIds.map((id) => ({ id })), edges: deleteRequest.edgeIds.map((id) => ({ id })) });
    if (deleteRequest.stroke) {
      setStrokes((all) => all.filter((s) => s.id !== deleteRequest.stroke));
      setSelectedStroke(null);
    }
    setDeleteRequest(null);
  };
  const cancelDelete = useCallback(() => setDeleteRequest(null), []);

  useBoardShortcuts({
    onTool: setTool,
    onFitView: () => fitView({ duration: 400, padding: 0.15, maxZoom: 1 }),
    onUndo: history.undo,
    onRedo: history.redo,
    onEscape: () => {
      if (linkSource) return setLinkSource(null); // premier Échap : annule la source
      setTool('select');
      setSelectedStroke(null);
    },
    onDelete: () => requestDelete(),
  });

  // Clic droit sur un post-it, un texte, ou la barre de titre d'une case (le terminal garde son propre clic droit).
  const [nodeMenu, setNodeMenu] = useState(null); // { x, y, id, type }
  const closeNodeMenu = useCallback(() => setNodeMenu(null), []);
  const onNodeContextMenu = useCallback(
    (event, node) => {
      if (tool !== 'select') return;
      if (node.type === 'terminal' && !event.target.closest('.terminal-header')) return;
      event.preventDefault();
      setNodeMenu({ x: event.clientX, y: event.clientY, id: node.id, type: node.type });
    },
    [tool],
  );

  // Copie décalée : une case copiée lance un nouvel agent (même agent, dossier, branche, rôle et modèle).
  const duplicate = (node) =>
    setNodes((nds) => {
      const { label, restored, autoEdit, ...data } = node.data;
      if (node.type === 'terminal') data.label = numberedName(agentById(node.data.agentId).name, nds);
      if (node.type === 'note') data.label = numberedName(t('note.defaultName'), nds);
      return nds
        .map((n) => (n.selected ? { ...n, selected: false } : n))
        .concat({
          ...(node.dragHandle && { dragHandle: node.dragHandle }),
          id: crypto.randomUUID(),
          type: node.type,
          position: { x: node.position.x + DUPLICATE_OFFSET, y: node.position.y + DUPLICATE_OFFSET },
          style: { ...node.style },
          selected: true,
          data,
        });
    });

  const onNodeAction = (action) => {
    const node = nodes.find((n) => n.id === nodeMenu.id);
    setNodeMenu(null);
    if (!node) return;
    switch (action) {
      case 'rename':
        // Un ancien post-it sans nom en reçoit un, puis passe en modification.
        if (node.type === 'note' && !node.data.label) {
          setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, label: numberedName(t('note.defaultName'), nds) } } : n)));
        }
        return setRenameRequest({ id: node.id, at: Date.now() });
      case 'edit':
        return setEditRequest({ id: node.id, at: Date.now() });
      case 'duplicate':
        return duplicate(node);
      case 'focus':
        return fitView({ nodes: [{ id: node.id }], duration: 400, padding: 0.3, maxZoom: 1 });
      case 'link':
        pendingLinkSource.current = node.id;
        return setTool('link');
      case 'delete':
        return requestDelete(node);
    }
  };

  // Outils Post-it et Texte : un clic sur la map pose l'élément, puis on repasse en Sélection.
  const onPaneClick = useCallback(
    (event) => {
      setSelectedStroke(null);
      setLinkSource(null);
      if (tool !== 'note' && tool !== 'text') return;

      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const note = tool === 'note';
      setNodes((nds) =>
        nds
          .map((n) => (n.selected ? { ...n, selected: false } : n))
          .concat({
            id: crypto.randomUUID(),
            type: tool,
            position: note ? { x: p.x - NOTE_SIZE.width / 2, y: p.y - NOTE_SIZE.height / 2 } : { x: p.x, y: p.y - 14 },
            style: note ? { ...NOTE_SIZE } : undefined,
            selected: true,
            data: { text: '', autoEdit: true, ...(note && { label: numberedName(t('note.defaultName'), nds) }) },
          }),
      );
      setTool('select');
    },
    [tool, screenToFlowPosition, setNodes, t],
  );

  // getData n'est pas lisible pendant dragover : on garde l'agent glissé ici.
  const [draggedAgentId, setDraggedAgentId] = useState(null);
  const [draggingBranch, setDraggingBranch] = useState(false);
  const [previewPos, setPreviewPos] = useState(null); // souris, relative à la map

  const endDrag = useCallback(() => {
    setDraggedAgentId(null);
    setDraggingBranch(false);
    setBranchTarget(null);
    setPreviewPos(null);
  }, []);

  const onDragOver = useCallback(
    (event) => {
      // « Branche » se lâche seulement sur une case terminal : elle s'allume au survol.
      if (draggingBranch) {
        event.preventDefault();
        const target = event.target.closest?.('.react-flow__node-terminal')?.dataset.id ?? null;
        event.dataTransfer.dropEffect = target ? 'link' : 'none';
        setBranchTarget(target);
        return;
      }
      if (!draggedAgentId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setPreviewPos((p) => (p && p.x === x && p.y === y ? p : { x, y }));
    },
    [draggedAgentId, draggingBranch],
  );

  const onDragLeave = useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setPreviewPos(null);
    setBranchTarget(null);
  }, []);

  // « Branche » lâché sur une case : barre des branches si son dossier est un dépôt Git.
  const openBranchPicker = useCallback(
    (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      window.git.isRepo(node.data.worktree ?? node.data.cwd).then((result) => {
        if (result.error) setToast({ id: Date.now(), text: result.error });
        else setBranchPicker(nodeId);
      });
    },
    [nodes],
  );

  // Nouvelle case terminal centrée sur « center » (coordonnées de la map).
  const addTerminal = useCallback(
    (agentId, cwd, center) =>
      setNodes((nds) =>
        nds.concat({
          id: crypto.randomUUID(),
          type: 'terminal',
          position: { x: center.x - NODE_SIZE.width / 2, y: center.y - NODE_SIZE.height / 2 },
          dragHandle: '.drag-handle',
          style: { ...NODE_SIZE },
          data: { agentId, cwd, label: numberedName(agentById(agentId).name, nds), ...(settings.models[agentId] && { model: settings.models[agentId] }) },
        }),
      ),
    [setNodes, agentById, settings.models],
  );

  // « Lancer un agent ici » (clic droit dans l'explorateur) : nouvelle case au centre de la vue.
  const boardRef = useRef(null);
  useGridGlow(boardRef, glow && Boolean(GRID_VARIANTS[grid]), settings.appearance.glowSize);
  useEffect(() => {
    if (!launchRequest || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    addTerminal(launchRequest.agentId, launchRequest.cwd, screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    onLaunchDone();
  }, [launchRequest, addTerminal, screenToFlowPosition, onLaunchDone]);

  // Lâcher un agent du dock = créer un terminal centré sous la souris, là où était l'aperçu.
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (draggingBranch) {
        const nodeId = branchTarget;
        endDrag();
        if (nodeId) openBranchPicker(nodeId);
        return;
      }
      const agentId = draggedAgentId;
      endDrag();
      if (!agentId || agentById(agentId).id !== agentId) return;

      // L'agent démarre dans le dossier actif, sinon dans le dossier personnel.
      const cwd = activeFolder ?? homeDir;
      if (!activeFolder) setToast({ id: Date.now(), text: t('board.noFolder') });

      addTerminal(agentId, cwd, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [draggedAgentId, draggingBranch, branchTarget, openBranchPicker, endDrag, screenToFlowPosition, addTerminal, activeFolder, homeDir, agentById, t],
  );

  const maximizedNode = maximized && nodes.find((n) => n.id === maximized && n.type === 'terminal');
  const maximizedName = maximizedNode ? maximizedNode.data.label || agentById(maximizedNode.data.agentId).name : '';

  return (
    <>
      <AgentDock
        draggedAgentId={draggedAgentId}
        draggingBranch={draggingBranch}
        onDragStart={setDraggedAgentId}
        onBranchDragStart={() => setDraggingBranch(true)}
        onDragEnd={endDrag}
      />
      <main
        ref={boardRef}
        className={`board tool-${tool}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        {...pointerHandlers}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BoardContext.Provider value={board}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeClick={() => setSelectedStroke(null)}
            onEdgeContextMenu={(event, edge) => {
              // Outil Lien : clic droit sur un lien = le supprimer (comme les traits du stylo).
              event.preventDefault();
              if (tool === 'link') setEdges((eds) => eds.filter((e) => e.id !== edge.id));
            }}
            onMoveEnd={(_event, v) => setViewport(v)}
            defaultViewport={initial.viewport ?? undefined}
            nodesDraggable={tool === 'select'}
            nodesConnectable={false}
            elementsSelectable={tool === 'select'}
            panOnDrag={tool === 'pen' ? [1] : true}
            minZoom={0.1}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            proOptions={{ hideAttribution: true }}
            colorMode={settings.appearance.theme === 'light' ? 'light' : 'dark'}
          >
            {/* Thème Clair : points un peu plus gros, sinon peu visibles sur le fond clair */}
            {GRID_VARIANTS[grid] && <Background variant={GRID_VARIANTS[grid]} gap={24} size={grid === 'dots' && light ? 1.8 : undefined} />}
            {GRID_VARIANTS[grid] && glow && (
              <Background
                id="glow"
                className="grid-glow"
                variant={GRID_VARIANTS[grid]}
                gap={24}
                size={grid === 'dots' ? (light ? 2.8 : 2.2) : undefined}
                lineWidth={1.5}
                color={settings.appearance.glowColor ?? 'var(--accent)'}
                bgColor="transparent"
              />
            )}
            <Controls position="bottom-left" />
            <GroupsLayer groups={liveGroups} nodes={nodes} enabled={tool === 'select'}
              onSelect={(ids) => setNodes((all) => all.map((node) => ({ ...node, selected: ids.includes(node.id) })))}
              onMove={(positions, dx, dy) => setNodes((all) => all.map((node) => positions.has(node.id) ? { ...node, position: { x: positions.get(node.id).x + dx, y: positions.get(node.id).y + dy } } : node))}
              onRename={(id, name) => setGroups((all) => all.map((group) => group.id === id ? { ...group, name } : group))}
              onUngroup={(id) => setGroups((all) => all.filter((group) => group.id !== id))} />
            <MiniMap position="bottom-right" pannable zoomable nodeComponent={MiniMapNode} />
            <DrawingLayer
              strokes={strokes}
              draft={pen.draft}
              selectedId={selectedStroke}
              selectable={tool === 'select'}
              erasable={tool === 'select' || tool === 'pen'}
              onSelect={selectStroke}
              onDelete={deleteStroke}
            />
          </ReactFlow>
        </BoardContext.Provider>
        <BoardToolbar tool={tool} onChange={setTool} />
        {tool === 'select' && nodes.filter((node) => node.selected).length >= 2 && <LayoutToolbar
          count={nodes.filter((node) => node.selected).length}
          canGroup={nodes.filter((node) => node.selected).every((node) => !liveGroups.some((group) => group.members.includes(node.id))) && liveGroups.length < 200}
          onArrange={(formation) => { setNodes(arrangeNodes(nodes, formation)); setFormationRequest(nodes.filter((node) => node.selected).map((node) => node.id)); }}
          onGroup={(name) => setGroups((all) => [...all, { id: 'group-' + crypto.randomUUID(), name, members: nodes.filter((node) => node.selected).map((node) => node.id) }])} />}
        {BOARD_HINTS.includes(tool) && (
          <div className="board-hint" role="status">
            {tool === 'link' && linkSource ? t('board.hint.linkTarget') : t(`board.hint.${tool}`)}
            {tool === 'link' && <kbd>{t('key.Esc')}</kbd>}
          </div>
        )}
        {boxSelection.box && <div className="selection-box" style={boxSelection.box} />}
        {overlays}
        {panelEdge && (
          <LinkPanel
            key={panelEdge.id}
            edge={panelEdge}
            nodes={nodes}
            event={linkEvents[panelEdge.id]}
            onChange={(patch) => updateLink(panelEdge.id, patch)}
            onDelete={() => setEdges((eds) => eds.filter((e) => e.id !== panelEdge.id))}
            onSwap={() =>
              setEdges((eds) => eds.map((e) => (e.id === panelEdge.id ? { ...e, source: e.target, target: e.source } : e)))
            }
            onClose={() => setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)))}
          />
        )}
        {previewPos && draggedAgentId && (
          <DropPreview agent={agentById(draggedAgentId)} position={previewPos} size={NODE_SIZE} />
        )}
        {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(null)} />}
        {nodeMenu && <NodeMenu x={nodeMenu.x} y={nodeMenu.y} type={nodeMenu.type} onAction={onNodeAction} onClose={closeNodeMenu} />}
        {deleteRequest && <DeleteDialog selection={deleteRequest} onCancel={cancelDelete} onConfirm={confirmDelete} />}
        {maximizedNode && (
          <section className="terminal-max" aria-label={maximizedName}>
            <header className="terminal-max-header">
              <AgentLogo agent={agentById(maximizedNode.data.agentId)} size={18} />
              <span className="terminal-max-title">{maximizedName}</span>
              <span className="hint">{t('terminal.restoreHint')}</span>
              <button className="text-button" onClick={() => setMaximized(null)}>
                <Minimize2 size={14} />
                {t('terminal.restore')}
              </button>
            </header>
            <div className="terminal-max-body terminal-body" ref={setMaxSlot} />
          </section>
        )}
      </main>
    </>
  );
}
