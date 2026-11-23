import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { Minimize2 } from 'lucide-react';
import { BROWSER_DRAG_TYPE, BROWSER_SIZE, browserDropPosition } from '../electron/browserModel.mjs';
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
import PanelNode from './components/PanelNode.jsx';
import InteractiveBrowserNode from './components/InteractiveBrowserNode.jsx';
import VisualTestNode from './components/VisualTestNode.jsx';
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
import ConductorBar from './components/ConductorBar.jsx';
import ConductorComposing from './components/ConductorComposing.jsx';
import GhostEdge from './components/GhostEdge.jsx';
import GhostNode from './components/GhostNode.jsx';
import TopBar from './components/TopBar.jsx';
import TileSearch from './components/TileSearch.jsx';
import TaskSequencesDialog from './components/TaskSequencesDialog.jsx';
import LayoutToolbar from './components/LayoutToolbar.jsx';
import GroupsLayer from './components/GroupsLayer.jsx';
import FormationPreview from './components/FormationPreview.jsx';
import PermissionNotch from './components/PermissionNotch.jsx';
import { arrangeNodes, cleanGroups } from './lib/layout.js';
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
import useBoardOps, { NODE_SIZE, NOTE_SIZE, VISUAL_TEST_SIZE } from './hooks/useBoardOps.js';
import useConductorSession from './hooks/useConductorSession.js';
import { previewLayout } from './lib/autoPlace.js';
import { PLAN_ORIGIN, useConductorOps, useConductorRouter } from './hooks/useConductorBridge.js';
import useT from './hooks/useT.js';
import { numberedName } from './lib/boardOps.js';
import { PANELS, draggedPanel } from './lib/panels.js';

const nodeTypes = { terminal: TerminalNode, note: NoteNode, text: TextNode, panel: PanelNode, visualTest: VisualTestNode, interactiveBrowser: InteractiveBrowserNode, ghost: GhostNode };
const DUPLICATE_OFFSET = 40; // px : une copie apparaît en décalé de l'original
const edgeTypes = { floating: FloatingEdge, ghost: GhostEdge };
const BOARD_HINTS = ['pen', 'note', 'text', 'link', 'visualTest']; // outils avec un bandeau d'aide (board.hint.<outil>)
const GRID_VARIANTS = { dots: BackgroundVariant.Dots, lines: BackgroundVariant.Lines };

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
  const conductor = useConductorRouter(boards);
  const [settingsOpen, setSettingsOpen] = useState(null);
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
  const closeSettings = useCallback(() => setSettingsOpen(null), []);
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
  useEffect(() => window.visualTests.onFinished((id, lastResult) => {
    if (!lastResult) return;
    for (const [boardId, state] of Object.entries(content)) {
      if (boardId === activeId || !state.nodes.some((node) => node.id === id && node.type === 'visualTest')) continue;
      const nodes = state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, lastResult } } : node);
      updateContent(boardId, { ...state, nodes });
    }
  }), [content, activeId, updateContent]);
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
  // Panneau posé sur la map : son tiroir n'a plus besoin de rester ouvert.
  const closePanelDrawer = useCallback((panel) => (panel === 'usage' ? setUsageOpen(false) : setLogOpen(false)), []);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [conductorOpen, setConductorOpen] = useState(false);
  const toggleConductor = useCallback(() => setConductorOpen((o) => !o), []);
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
    setSettingsOpen(null);
    setTutorial('tour');
  }, []);
  const startSetup = useCallback(() => {
    setSettingsOpen(null);
    setTutorial('setup');
  }, []);

  useAppShortcuts({
    toggleSettings: () => setSettingsOpen((open) => open ? null : {}),
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
    toggleConductor,
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
        onOpenSettings={() => setSettingsOpen({})}
        onOpenTeams={() => setTeamsOpen(true)}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenTasks={() => { boards.flushSave().then(() => setTasksOpen(true)).catch(() => setTasksOpen(true)); }}
        blockerCount={blockers.filter((entry) => !entry.resolved).length}
      />
      <PermissionNotch running={running} content={content} onFocus={focusAgent} />
      <div className="workspace">
        {/* Un ReactFlowProvider par tableau : changer d'onglet repart d'un état React Flow neuf. */}
        <ReactFlowProvider key={activeId}>
          <Board
            boardId={activeId}
            conductor={conductor}
            conductorOpen={conductorOpen}
            onToggleConductor={toggleConductor}
            initial={content[activeId]}
            onChange={onBoardChange}
            focusRequest={focusRequest}
            onFocusDone={clearFocus}
            overlays={overlays}
            resumeChoice={resumeChoice}
            running={running}
            launchRequest={launchRequest}
            onLaunchDone={clearLaunch}
            boardList={boards.boards}
            focusAgent={focusAgent}
            onPanelPlaced={closePanelDrawer}
            onOpenMcp={(cardId) => setSettingsOpen({ cardId })}
          />
        </ReactFlowProvider>
        <ExplorerPanel
          open={explorerOpen}
          onToggle={() => setExplorerOpen((o) => !o)}
          onLaunchAgent={(agentId, cwd) => setLaunchRequest({ agentId, cwd, at: Date.now() })}
        />
      </div>
      {settingsOpen && (
        <SettingsModal
          onClose={closeSettings}
          onStartTutorial={startTutorial}
          onStartSetup={startSetup}
          boardId={activeId}
          boardName={boards.boards.find((board) => board.id === activeId)?.name}
          nodes={content[activeId].nodes}
          mcpCardId={settingsOpen.cardId}
        />
      )}
      {tasksOpen && <TaskSequencesDialog boards={boards.boards} content={content} onFocus={(id) => { setTasksOpen(false); focusAgent(id); }} onClose={() => setTasksOpen(false)} />}
      {teamsOpen && <TeamTemplates boardId={activeId} board={content[activeId]} getBoard={() => content[activeId]} boardName={boards.boards.find((b) => b.id === activeId)?.name || ''} onCreate={boards.addBoard} onClose={() => setTeamsOpen(false)} />}
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
function Board({ boardId, conductor, conductorOpen, onToggleConductor, initial, onChange, focusRequest, onFocusDone, overlays, resumeChoice, running, launchRequest, onLaunchDone, boardList, focusAgent, onPanelPlaced, onOpenMcp }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [viewport, setViewport] = useState(initial.viewport);
  const [formationRequest, setFormationRequest] = useState(null);
  const [formationPreview, setFormationPreview] = useState(null);
  const { screenToFlowPosition, fitView, getNodes, setViewport: moveCamera } = useReactFlow();
  const ops = useBoardOps({ setNodes, setEdges });
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
    () => ({ boardId, tool, linkSource, branchTarget, branchPicker, setBranchPicker, linkEvents, pendingMessages, resumeChoice, renameRequest, editRequest, maximized, setMaximized, maxSlot, boardList, focusAgent, ops }),
    [boardId, tool, linkSource, branchTarget, branchPicker, linkEvents, pendingMessages, resumeChoice, renameRequest, editRequest, maximized, maxSlot, boardList, focusAgent, ops],
  );

  // F2 : renommer la case terminal choisie, ou celle dont le terminal a le curseur. En capture, pour que
  // le terminal ne reçoive pas la touche.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  useEffect(() => {
    const onKeyDown = (event) => {
      // Ctrl+Maj+M : agrandir ou remettre en place la case choisie (ou celle dont le terminal a le curseur).
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === 'KeyM') {
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
      if (tool !== 'link' || !['terminal', 'note', 'visualTest', 'interactiveBrowser'].includes(node.type)) return;
      if (!linkSource || linkSource === node.id) {
        setLinkSource(linkSource ? null : node.id);
        return;
      }
      // Règles du lien (Note, Terminal ou type par défaut) dans useBoardOps, partagées avec le chef d'orchestre.
      ops.addLink(linkSource, node.id);
      setLinkSource(null);
    },
    [tool, linkSource, ops],
  );

  // Post-it de ce tableau réécrit par un agent (lien Note).
  useEffect(
    () =>
      window.notes.onWrite((id, text) =>
        setNodes((nds) => (nds.some((n) => n.id === id) ? nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)) : nds)),
      ),
    [setNodes],
  );

  useEffect(() => window.visualTests.onFinished((id, lastResult) => {
    if (!lastResult) return;
    setNodes((nodes) => nodes.some((node) => node.id === id && node.type === 'visualTest')
      ? nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, lastResult } } : node)
      : nodes);
  }), [setNodes]);

  // Un seul lien choisi avec l'outil Sélection : son panneau de réglages s'ouvre (PLAN.md §3.5).
  const selectedEdges = edges.filter((e) => e.selected);
  const panelEdge = tool === 'select' && selectedEdges.length === 1 ? selectedEdges[0] : null;

  const liveGroups = useMemo(() => cleanGroups(groups, nodes), [groups, nodes]);
  const selectedCount = nodes.filter((node) => node.selected).length;
  const history = useBoardHistory({ nodes, edges, strokes, groups: liveGroups, setNodes, setEdges, setStrokes, setGroups });

  // Le contenu remonte à chaque changement : c'est ce qui est sauvegardé et relu quand on revient sur l'onglet.
  useEffect(() => {
    onChange({ nodes, edges, strokes, groups: liveGroups, viewport });
  }, [nodes, edges, strokes, liveGroups, viewport, onChange]);

  // Changements demandés par le chef d'orchestre (après l'effet ci-dessus : sa sauvegarde lit ce contenu).
  // Sur une map vide, ses cases partent du point (0, 0) de la map (jamais du centre de la vue, qui bouge avec la
  // caméra : l'aperçu et la validation doivent tomber au même endroit), puis la caméra les montre.
  const boardRef = useRef(null);
  // Cadrage des cases du chef d'orchestre : dans la partie de la map visible sous sa bulle quand elle est ouverte.
  const frameNodes = useCallback((ids) => {
    const board = boardRef.current;
    const bar = board?.querySelector('.conductor-bar');
    if (!bar) return fitView({ nodes: ids.map((id) => ({ id })), duration: 500, padding: 0.25, maxZoom: 1 });
    const chosen = new Set(ids);
    const boxes = getNodes().filter((n) => chosen.has(n.id)).map((n) => ({
      x: n.position.x, y: n.position.y, width: n.measured?.width ?? n.style?.width ?? 0, height: n.measured?.height ?? n.style?.height ?? 0,
    }));
    if (!boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - left;
    const height = Math.max(...boxes.map((b) => b.y + b.height)) - top;
    const area = board.getBoundingClientRect();
    const margin = 60;
    const y0 = bar.getBoundingClientRect().bottom - area.top + 24;
    const w = area.width - 2 * margin;
    const h = area.height - y0 - margin;
    if (w <= 0 || h <= 0 || !width || !height) return;
    const zoom = Math.max(0.1, Math.min(1, w / width, h / height));
    moveCamera({ x: margin + (w - width * zoom) / 2 - left * zoom, y: y0 + (h - height * zoom) / 2 - top * zoom, zoom }, { duration: 500 });
  }, [fitView, getNodes, moveCamera]);
  // Session du chef d'orchestre de ce tableau : conversation, exécution en cours, aperçu (PLAN.md §3.25).
  const conductorSession = useConductorSession(boardId);
  const conductorRunning = conductorSession.running;
  const runningRef = useRef(conductorRunning);
  runningRef.current = conductorRunning;
  // Pendant qu'il construit, ses nouvelles cases restent cachées derrière l'encart « Composition… » et apparaissent
  // ensemble, déjà disposées, à la fin. Hors exécution (validation d'un aperçu, case de test), la caméra les suit.
  const revealed = useRef([]);
  const buildingRef = useRef([]);
  const [building, setBuilding] = useState([]);
  const [appearing, setAppearing] = useState([]);
  const reveal = useCallback((ids, created) => {
    const now = Date.now();
    revealed.current = [...revealed.current.filter((entry) => now - entry.at < 60000), ...ids.filter(Boolean).map((id) => ({ id, at: now }))];
    if (runningRef.current) {
      if (created) setBuilding((buildingRef.current = [...buildingRef.current, created]));
      return;
    }
    setTimeout(() => frameNodes(revealed.current.map(({ id }) => id)), 120);
  }, [frameNodes]);
  useEffect(() => {
    if (conductorRunning || !buildingRef.current.length) return;
    setAppearing(buildingRef.current);
    buildingRef.current = [];
    setBuilding([]);
    setTimeout(() => frameNodes(revealed.current.map(({ id }) => id)), 120);
    setTimeout(() => setAppearing([]), 700);
  }, [conductorRunning, frameNodes]);
  useConductorOps({ boardId, bridge: conductor, ops, nodes, edges, getNodes, setNodes, setEdges, reveal, history });

  // Aperçu : ses propositions en fantômes, ajoutées à l'affichage seulement (jamais à l'état du tableau : ni
  // sauvegardées, ni dans Ctrl+Z), montrées une fois le plan fini ; les cases à retirer en pointillés rouges.
  // Un plan peut viser plusieurs tableaux (create_board) : chacun ne montre que ses propres fantômes.
  const boardPending = useMemo(() => conductorSession.pending.filter((item) => !item.boardId || item.boardId === boardId), [conductorSession.pending, boardId]);
  const preview = useMemo(
    () => (boardPending.length && !conductorRunning ? previewLayout(nodes, edges, boardPending, { origin: PLAN_ORIGIN, agentSize: NODE_SIZE, noteSize: NOTE_SIZE, cardSizes: { browser: BROWSER_SIZE, visual: VISUAL_TEST_SIZE } }) : null),
    [boardPending, conductorRunning, nodes, edges],
  );
  const shownNodes = useMemo(() => {
    if (!preview && !building.length && !appearing.length) return nodes;
    const hidden = new Set(building);
    const fresh = new Set(appearing);
    const shown = nodes.map((n) => {
      const className = hidden.has(n.id) ? 'conductor-hidden' : fresh.has(n.id) ? 'conductor-appear' : preview?.removing.has(n.id) ? 'pending-removal' : null;
      return className ? { ...n, className } : n;
    });
    if (!preview) return shown;
    const ghosts = preview.ghosts.map((g) => ({
      id: g.id, type: 'ghost', position: g.position, style: { width: g.size.width, height: g.size.height },
      draggable: false, selectable: false, connectable: false, focusable: false, data: { kind: g.kind, ...g.data },
    }));
    return [...shown, ...ghosts];
  }, [nodes, preview, building, appearing]);
  const shownEdges = useMemo(() => {
    const hidden = new Set(building);
    const shown = hidden.size
      ? edges.map((e) => (hidden.has(e.source) || hidden.has(e.target) ? { ...e, className: `${e.className ?? ''} conductor-hidden` } : e))
      : edges;
    if (!preview) return shown;
    return [...shown, ...preview.links.map((l) => ({ id: `ghost-${l.id}`, source: l.source, target: l.target, type: 'ghost', selectable: false, focusable: false, data: { mode: l.mode } }))];
  }, [edges, preview, building]);
  // Un nouveau plan proposé : la caméra le montre, dans la partie de la map visible sous la bulle.
  const ghostKey = preview?.ghosts.map((g) => g.id).join(',') ?? '';
  useEffect(() => {
    if (!ghostKey) return;
    const timer = setTimeout(() => frameNodes(ghostKey.split(',')), 150);
    return () => clearTimeout(timer);
  }, [ghostKey, frameNodes]);
  const composing = conductorRunning && (conductorSession.pending.length > 0 || building.length > 0);
  const lastAction = composing ? conductorSession.history.filter((e) => e.kind === 'tool').at(-1) : null;
  const tileName = useCallback(
    (ref) => {
      const node = ref && nodes.find((n) => n.id === ref);
      if (!node) return ref ?? '';
      return node.data.label || (node.type === 'note' ? t('note.defaultName') : agentById(node.data.agentId).name);
    },
    [nodes, agentById, t],
  );

  const terminalsOf = (list) => list
    .filter((n) => n.type === 'terminal')
    .map((n) => ({ id: n.id, name: n.data.label || agentById(n.data.agentId).name, agent: agentById(n.data.agentId), status: running[n.id]?.status }));

  // Ctrl+Z sur une validation du chef d'orchestre : ses agents sont retirés ; confirmation si l'un travaille.
  const [undoRequest, setUndoRequest] = useState(null);
  const undo = () => {
    const ids = new Set(history.undoTerminals());
    const terminals = terminalsOf(nodes.filter((n) => ids.has(n.id)));
    if (!terminals.some((term) => ['working', 'waiting'].includes(term.status))) return history.undo();
    setUndoRequest({ terminals, nodeIds: [], edgeIds: [] });
  };
  const cancelUndo = useCallback(() => setUndoRequest(null), []);

  // Suppr : tout ce qui est choisi (cases terminal comprises), après confirmation.
  // only : un seul élément, depuis son menu du clic droit (la sélection n'est alors pas touchée).
  const [deleteRequest, setDeleteRequest] = useState(null);
  const requestDelete = (only) => {
    const chosen = only ? [only] : nodes.filter((n) => n.selected);
    const chosenEdges = only ? [] : selectedEdges;
    const stroke = only ? null : selectedStroke;
    const terminals = terminalsOf(chosen);
    const selection = {
      terminals,
      links: chosenEdges.length,
      notes: chosen.filter((n) => n.type === 'note').length,
      texts: chosen.filter((n) => n.type === 'text').length,
      panels: chosen.filter((n) => n.type === 'panel').length,
      visualTests: chosen.filter((n) => n.type === 'visualTest').length,
      browsers: chosen.filter((n) => n.type === 'interactiveBrowser').length,
      strokes: stroke ? 1 : 0,
      nodeIds: chosen.map((n) => n.id),
      edgeIds: chosenEdges.map((e) => e.id),
      stroke,
    };
    if (selection.nodeIds.length || selection.links || selection.strokes) setDeleteRequest(selection);
  };
  const confirmDelete = () => {
    ops.removeElements({ nodeIds: deleteRequest.nodeIds, edgeIds: deleteRequest.edgeIds });
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
    onUndo: undo,
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
      setNodeMenu({ x: event.clientX, y: event.clientY, id: node.id, type: node.type, mcp: node.type === 'terminal' && Boolean(agentById(node.data.agentId).hooks) });
    },
    [tool, agentById],
  );

  // Copie décalée : une case copiée lance un nouvel agent (même agent, dossier, branche, rôle et modèle).
  const duplicate = (node) =>
    setNodes((nds) => {
      const { label, restored, autoEdit, lastResult, ...data } = node.data;
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
      case 'mcp':
        return onOpenMcp(node.id);
      case 'delete':
        return requestDelete(node);
    }
  };

  // Outils de placement : un clic sur la map pose l'élément, puis on repasse en Sélection.
  const onPaneClick = useCallback(
    (event) => {
      setSelectedStroke(null);
      setLinkSource(null);
      if (!['note', 'text', 'visualTest'].includes(tool)) return;

      ops.addAnnotation({ type: tool, point: screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
      setTool('select');
    },
    [tool, screenToFlowPosition, ops],
  );

  // getData n'est pas lisible pendant dragover : on garde l'agent glissé ici.
  const [draggedAgentId, setDraggedAgentId] = useState(null);
  const [draggingBranch, setDraggingBranch] = useState(false);
  const [previewPanel, setPreviewPanel] = useState(null); // languette glissée au-dessus de la map
  const [previewPos, setPreviewPos] = useState(null); // souris, relative à la map

  const endDrag = useCallback(() => {
    setDraggedAgentId(null);
    setDraggingBranch(false);
    setPreviewPanel(null);
    setBranchTarget(null);
    setPreviewPos(null);
  }, []);

  const onDragOver = useCallback(
    (event) => {
      if (event.dataTransfer.types.includes(BROWSER_DRAG_TYPE)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        return;
      }
      // « Branche » se lâche seulement sur une case terminal : elle s'allume au survol.
      if (draggingBranch) {
        event.preventDefault();
        const target = event.target.closest?.('.react-flow__node-terminal')?.dataset.id ?? null;
        event.dataTransfer.dropEffect = target ? 'link' : 'none';
        setBranchTarget(target);
        return;
      }
      // Languette glissée : pas de dépôt sur les languettes elles-mêmes (un clic un peu appuyé ne pose rien).
      const panel = draggedPanel(event.dataTransfer);
      const overTabs = panel && event.target.closest?.('.usage-wrap');
      if (!draggedAgentId && !panel) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = overTabs ? 'none' : panel ? 'copy' : 'move';
      setPreviewPanel(overTabs ? null : panel);
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
    setPreviewPanel(null);
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

  const { addTerminal } = ops;

  // Languette lâchée sur la map : case Utilisation ou Journal centrée sous la souris, déjà choisie.
  const addPanel = useCallback(
    (panel, center) => {
      const { size } = PANELS[panel];
      setNodes((nds) =>
        nds
          .map((n) => (n.selected ? { ...n, selected: false } : n))
          .concat({
            id: crypto.randomUUID(),
            type: 'panel',
            position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
            style: { ...size },
            selected: true,
            data: { panel },
          }),
      );
      onPanelPlaced(panel);
    },
    [setNodes, onPanelPlaced],
  );

  // « Lancer un agent ici » (clic droit dans l'explorateur) : nouvelle case au centre de la vue.
  useGridGlow(boardRef, glow && Boolean(GRID_VARIANTS[grid]), settings.appearance.glowSize);
  const addBrowser = useCallback((center) => {
    ops.addBrowser({ point: center });
    setTool('select');
  }, [ops]);

  const openBrowser = useCallback(() => {
    const browsers = nodesRef.current.filter((node) => node.type === 'interactiveBrowser');
    const browser = browsers.find((node) => node.selected) ?? browsers[0];
    if (browser) {
      setTool('select');
      setNodes((all) => all.map((node) => Boolean(node.selected) === (node.id === browser.id) ? node : { ...node, selected: node.id === browser.id }));
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400;
      fitView({ nodes: [{ id: browser.id }], duration, padding: 0.16, maxZoom: 1 });
    } else if (boardRef.current) {
      const { left, top, width, height } = boardRef.current.getBoundingClientRect();
      addBrowser(screenToFlowPosition({ x: left + width / 2, y: top + height / 2 }));
    }
  }, [addBrowser, fitView, screenToFlowPosition, setNodes]);
  useEffect(() => {
    if (!launchRequest || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    addTerminal({ agentId: launchRequest.agentId, cwd: launchRequest.cwd, center: screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) });
    onLaunchDone();
  }, [launchRequest, addTerminal, screenToFlowPosition, onLaunchDone]);

  // Lâcher un agent du dock = créer un terminal centré sous la souris, là où était l'aperçu.
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const browserCenter = browserDropPosition(event, screenToFlowPosition);
      if (browserCenter) {
        endDrag();
        addBrowser(browserCenter);
        return;
      }
      if (draggingBranch) {
        const nodeId = branchTarget;
        endDrag();
        if (nodeId) openBranchPicker(nodeId);
        return;
      }
      const panel = draggedPanel(event.dataTransfer);
      if (panel) {
        endDrag();
        addPanel(panel, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        return;
      }
      const agentId = draggedAgentId;
      endDrag();
      if (!agentId || agentById(agentId).id !== agentId) return;

      // L'agent démarre dans le dossier actif, sinon dans le dossier personnel.
      const cwd = activeFolder ?? homeDir;
      if (!activeFolder) setToast({ id: Date.now(), text: t('board.noFolder') });

      addTerminal({ agentId, cwd, center: screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
    },
    [draggedAgentId, draggingBranch, branchTarget, openBranchPicker, endDrag, screenToFlowPosition, addTerminal, addPanel, addBrowser, activeFolder, homeDir, agentById, t],
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
        onBrowserOpen={openBrowser}
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
            nodes={shownNodes}
            edges={shownEdges}
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
              if (tool === 'link') ops.removeLink(edge.id);
            }}
            onMoveEnd={(_event, v) => setViewport(v)}
            defaultViewport={initial.viewport ?? undefined}
            fitView={initial.fitAtStart === true}
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
            {formationPreview && tool === 'select' && selectedCount >= 2 && <FormationPreview nodes={nodes} formation={formationPreview} />}
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
        <ConductorBar boardId={boardId} session={conductorSession} open={conductorOpen} onToggle={onToggleConductor} nameOf={tileName} />
        {composing && <ConductorComposing boardRef={boardRef} action={lastAction} nameOf={tileName} />}
        {tool === 'select' && selectedCount >= 2 && <LayoutToolbar
          count={selectedCount}
          groupCount={liveGroups.length}
          canGroup={nodes.filter((node) => node.selected).every((node) => !liveGroups.some((group) => group.members.includes(node.id))) && liveGroups.length < 200}
          onPreview={setFormationPreview}
          onArrange={(formation) => { setFormationPreview(null); setNodes(arrangeNodes(nodes, formation)); setFormationRequest(nodes.filter((node) => node.selected).map((node) => node.id)); }}
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
            onChange={(patch) => ops.updateLink(panelEdge.id, patch)}
            onDelete={() => ops.removeLink(panelEdge.id)}
            onSwap={() => ops.swapLink(panelEdge.id)}
            onClose={() => setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)))}
          />
        )}
        {previewPos && draggedAgentId && (
          <DropPreview name={agentById(draggedAgentId).name} position={previewPos} size={NODE_SIZE}>
            <AgentLogo agent={agentById(draggedAgentId)} size={32} />
          </DropPreview>
        )}
        {previewPos && previewPanel && (() => {
          const { icon: Icon, title, size } = PANELS[previewPanel];
          return <DropPreview name={t(title)} position={previewPos} size={size}><Icon size={32} /></DropPreview>;
        })()}
        {toast && <Toast key={toast.id} text={toast.text} onDone={() => setToast(null)} />}
        {nodeMenu && <NodeMenu x={nodeMenu.x} y={nodeMenu.y} type={nodeMenu.type} mcp={nodeMenu.mcp} onAction={onNodeAction} onClose={closeNodeMenu} />}
        {deleteRequest && <DeleteDialog selection={deleteRequest} onCancel={cancelDelete} onConfirm={confirmDelete} />}
        {undoRequest && <DeleteDialog selection={undoRequest} onCancel={cancelUndo} onConfirm={() => { setUndoRequest(null); history.undo(); }} />}
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
