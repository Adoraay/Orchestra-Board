import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, useReactFlow, useStoreApi } from '@xyflow/react';
import { GitBranch, History, MessageSquarePlus, RotateCcw, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import AgentLogo from './AgentLogo.jsx';
import BranchBar from './BranchBar.jsx';
import FinishBubble from './FinishBubble.jsx';
import StatusDot from './StatusDot.jsx';
import TerminalTitle from './TerminalTitle.jsx';
import { useBoard } from '../context/BoardContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useFloatingDrag from '../hooks/useFloatingDrag.js';
import useResizeMode from '../hooks/useResizeMode.js';
import useT from '../hooks/useT.js';
import { terminalFont, terminalTheme } from '../lib/terminalTheme.js';

// Un nœud de la map = une fenêtre avec un vrai terminal dedans.
export default function TerminalNode({ id, data, selected, dragging, positionAbsoluteX }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const { settings, agentById } = useSettings();
  const t = useT();
  const { tool, linkSource, branchTarget, branchPicker, setBranchPicker, resumeChoice, renameRequest } = useBoard();
  const { theme, accent, terminalFontSize } = settings.appearance;
  const [exited, setExited] = useState(false);
  const [status, setStatus] = useState('idle');
  const [finished, setFinished] = useState(false); // a fini et pas encore vu : lueur verte (PLAN.md §3.6)
  const [confirmingClose, setConfirmingClose] = useState(false);
  const { deleteElements, updateNodeData } = useReactFlow();
  const store = useStoreApi();
  const floating = useFloatingDrag(dragging, positionAbsoluteX);
  const { resizing, headerProps, stopResizing } = useResizeMode(selected);
  const agent = agentById(data.agentId);
  // Nom affiché partout (titre, bulle, notifications) : celui choisi par double-clic, sinon celui de l'agent.
  const name = data.label || agent.name;
  const nameRef = useRef(name);
  nameRef.current = name;
  // Dossier où tourne l'agent : le worktree de sa branche (PLAN.md §3.10), sinon le dossier choisi au dépôt.
  const runDir = data.worktree ?? data.cwd;
  const runDirRef = useRef(runDir);
  runDirRef.current = runDir;

  // Case restaurée au démarrage d'un agent qui sait reprendre (Claude Code) : rien n'est lancé avant le choix
  // fait au démarrage (ResumeDialog), ou celui fait dans la case avec « Voir le tableau ».
  const askResume = Boolean(data.restored && agent.resumeArgs);
  const askResumeAtMount = useRef(askResume);

  useEffect(() => {
    const term = new Terminal({
      fontSize: terminalFontSize,
      fontFamily: terminalFont(),
      theme: terminalTheme(),
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    // Copier / coller comme dans le Terminal Windows : Ctrl+C copie s'il y a une sélection (sinon il
    // interrompt), Ctrl+Maj+C copie, Ctrl+V et Ctrl+Maj+V laissent le navigateur coller (collage entre
    // crochets géré par xterm).
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return true;
      const key = event.key.toLowerCase();
      if (key === 'c' && (event.shiftKey || term.hasSelection())) {
        if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        if (!event.shiftKey) term.clearSelection();
        event.preventDefault();
        return false;
      }
      return key !== 'v';
    });

    // Clavier -> PTY, PTY -> écran. Si le terminal tournait déjà (tableau qu'on rouvre), on réaffiche
    // d'abord ses dernières sorties : ce qui arrive avant est déjà dedans, on le met de côté.
    let disposed = false;
    let ready = askResumeAtMount.current;
    const offInput = term.onData((d) => window.pty.write(id, d));
    const offData = window.pty.onData(id, (d) => ready && term.write(d));
    const offExit = window.pty.onExit(id, () => {
      setExited(true);
      setStatus('idle');
      setFinished(false);
    });
    const applyStatus = (info) => {
      if (!info) return;
      setStatus(info.status);
      setFinished(info.unseen);
    };
    const offStatus = window.pty.onStatus(id, applyStatus);

    termRef.current = term;
    fitRef.current = fit;
    if (!askResumeAtMount.current) {
      window.pty.create({ id, agentId: data.agentId, cwd: runDirRef.current, label: nameRef.current, cols: term.cols, rows: term.rows }).then((result) => {
        if (disposed) return;
        if (result?.buffer) term.write(result.buffer);
        applyStatus(result?.status);
        ready = true;
      });
    }

    // Quand la case change de taille, le terminal suit.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        window.pty.resize(id, term.cols, term.rows);
      } catch {}
    });
    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      offInput.dispose();
      offData();
      offExit();
      offStatus();
      term.dispose();
      termRef.current = null;
    };
    // Police et thème sont appliqués en direct par l'effet suivant, sans recréer le terminal.
  }, [id, data.agentId, data.cwd]);

  // Paramètres d'apparence changés : on met à jour le terminal existant.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = terminalTheme();
    if (term.options.fontSize !== terminalFontSize) {
      term.options.fontSize = terminalFontSize;
      try {
        fitRef.current.fit();
        window.pty.resize(id, term.cols, term.rows);
      } catch {}
    }
  }, [id, theme, accent, terminalFontSize]);

  const launch = (resume) => {
    const term = termRef.current;
    if (!term) return;
    updateNodeData(id, { restored: false });
    window.pty.create({ id, agentId: data.agentId, cwd: runDir, label: name, cols: term.cols, rows: term.rows, resume });
    term.focus();
  };

  // Choix « Reprendre » ou « Nouvelle discussion » au démarrage : la case l'applique d'elle-même.
  useEffect(() => {
    if (askResume && (resumeChoice === 'resume' || resumeChoice === 'new')) launch(resumeChoice === 'resume');
  }, [askResume, resumeChoice]);

  // Le processus s'est terminé : on relance l'agent dans la même case et le même dossier.
  const restart = () => {
    const term = termRef.current;
    if (!term) return;
    setExited(false);
    term.write('\r\n');
    window.pty.create({ id, agentId: data.agentId, cwd: runDir, label: name, cols: term.cols, rows: term.rows });
    term.focus();
  };

  // Branche choisie dans la barre : l'agent est relancé dans le worktree, sauf s'il y tourne déjà.
  const switchBranch = (dir, branch) => {
    setBranchPicker(null);
    updateNodeData(id, { branch, worktree: dir, restored: false });
    const term = termRef.current;
    if (dir === runDir || !term) return;
    window.pty.kill(id);
    setExited(false);
    setStatus('idle');
    setFinished(false);
    setConfirmingClose(false);
    term.reset();
    window.pty.create({ id, agentId: data.agentId, cwd: dir, label: name, cols: term.cols, rows: term.rows });
    term.focus();
  };

  const close = () => {
    window.pty.kill(id);
    deleteElements({ nodes: [{ id }] });
  };

  // Double-clic sur le titre : nom propre à cette case (vide = nom de l'agent), repris par les notifications.
  const rename = (label) => {
    updateNodeData(id, { label: label || undefined });
    window.pty.rename(id, label || agent.name);
  };

  // Paramètre « Confirmer avant de fermer une case qui travaille » : on demande dans la barre de titre.
  const busy = !exited && (status === 'working' || status === 'waiting');
  const pickingBranch = branchPicker === id;
  const requestClose = () => {
    if (busy && settings.general.confirmClose) setConfirmingClose(true);
    else close();
  };

  // Clic n'importe où (terminal compris) = case choisie. En capture, car xterm
  // intercepte les clics dans le terminal. Désélectionne aussi les autres cases.
  // Le clic vaut aussi « vu » pour un agent qui a fini.
  const select = () => {
    if (finished) window.pty.ack(id);
    if (tool !== 'link' && !selected) store.getState().addSelectedNodes([id]);
  };

  return (
    <>
      {/* Hors de .terminal-node : ses animations (transform + overflow) couperaient les poignées */}
      <NodeResizer
        minWidth={360}
        minHeight={220}
        isVisible={selected && resizing}
        handleClassName="resize-handle"
        lineClassName="resize-line"
      />
      {/* Requis par React Flow pour afficher les liens ; le tracé réel est calculé par FloatingEdge */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <FinishBubble agent={agent} name={name} finished={finished} />
      {pickingBranch && (
        <BranchBar dir={runDir} busy={busy} name={name} onClose={() => setBranchPicker(null)} onSwitched={switchBranch} />
      )}
      {data.branch && !pickingBranch && (
        <button
          className="branch-notch nodrag nopan"
          title={t('terminal.changeBranch')}
          onClick={() => tool === 'select' && setBranchPicker(id)}
        >
          <GitBranch size={12} />
          <span className="branch-name">{data.branch}</span>
        </button>
      )}

      <div
        ref={floating.ref}
        className={`terminal-node ${selected ? 'selected' : ''} ${dragging ? 'lifted' : ''} ${linkSource === id ? 'link-source' : ''} ${finished ? 'finished' : ''} ${branchTarget === id ? 'branch-target' : ''} ${floating.animClass}`}
        onAnimationEnd={floating.onAnimationEnd}
        onPointerDownCapture={select}
      >
        {/* Glisser = déplacer la case, vrai clic = mode redimensionnement, double-clic sur le nom = renommer.
            nopan : le double-clic ne zoome pas la map. */}
        <header
          className="terminal-header drag-handle nopan"
          {...headerProps}
          onPointerDown={(event) => {
            headerProps.onPointerDown(event);
            // Clic sur la barre de titre : le terminal perd le curseur, Suppr et F2 visent alors la case.
            if (event.currentTarget.parentElement.querySelector('.terminal-body')?.contains(document.activeElement)) {
              document.activeElement.blur();
            }
          }}
        >
          <AgentLogo agent={agent} size={18} />
          <TerminalTitle
            name={name}
            cwd={data.cwd}
            onRename={rename}
            onEditStart={stopResizing}
            editRequest={renameRequest?.id === id ? renameRequest.at : null}
          />
          {exited ? <span className="badge">{t('terminal.exited')}</span> : <StatusDot status={status} />}
          <span className="header-actions">
            {exited && (
              <button className="header-button nodrag" onClick={restart} title={t('common.restart')}>
                <RotateCcw size={13} />
                {t('common.restart')}
              </button>
            )}
            {confirmingClose ? (
              <span className="close-confirm nodrag">
                {t('terminal.closeConfirm', { name })}
                <button className="tab-confirm danger" onClick={close}>{t('common.close')}</button>
                <button className="tab-confirm" onClick={() => setConfirmingClose(false)}>{t('common.cancel')}</button>
              </span>
            ) : (
              <button className="close nodrag" onClick={requestClose} title={t('common.close')}><X size={15} /></button>
            )}
          </span>
        </header>

        {/* nodrag / nowheel : on peut sélectionner du texte et scroller sans bouger la map */}
        <div className="terminal-body nodrag nowheel" onPointerDown={stopResizing}>
          <div className="terminal-mount" ref={containerRef} />
          {askResume && resumeChoice === 'manual' && (
            <div className="resume-prompt">
              <p>{t('terminal.resumeQuestion', { name })}</p>
              <div className="resume-actions">
                <button className="text-button primary" onClick={() => launch(true)}>
                  <History size={15} />
                  {t('terminal.resume')}
                </button>
                <button className="text-button" onClick={() => launch(false)}>
                  <MessageSquarePlus size={15} />
                  {t('terminal.newConversation')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
