import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, useReactFlow, useStoreApi } from '@xyflow/react';
import { History, MessageSquarePlus, RotateCcw, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import AgentLogo from './AgentLogo.jsx';
import StatusDot from './StatusDot.jsx';
import { useBoard } from '../context/BoardContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import useFloatingDrag from '../hooks/useFloatingDrag.js';
import useResizeMode from '../hooks/useResizeMode.js';
import { baseName } from '../lib/paths.js';
import { terminalFont, terminalTheme } from '../lib/terminalTheme.js';

// Un nœud de la map = une fenêtre avec un vrai terminal dedans.
export default function TerminalNode({ id, data, selected, dragging, positionAbsoluteX }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const { settings, agentById } = useSettings();
  const { tool, linkSource } = useBoard();
  const { accent, terminalFontSize } = settings.appearance;
  const [exited, setExited] = useState(false);
  const [status, setStatus] = useState('idle');
  const { deleteElements, updateNodeData } = useReactFlow();
  const store = useStoreApi();
  const floating = useFloatingDrag(dragging, positionAbsoluteX);
  const { resizing, headerProps, stopResizing } = useResizeMode(selected);
  const agent = agentById(data.agentId);

  // Case restaurée au démarrage d'un agent qui sait reprendre (Claude Code) : on demande avant de lancer.
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

    // Clavier -> PTY, PTY -> écran. Si le terminal tournait déjà (tableau qu'on rouvre), on réaffiche
    // d'abord ses dernières sorties : ce qui arrive avant est déjà dedans, on le met de côté.
    let disposed = false;
    let ready = askResumeAtMount.current;
    const offInput = term.onData((d) => window.pty.write(id, d));
    const offData = window.pty.onData(id, (d) => ready && term.write(d));
    const offExit = window.pty.onExit(id, () => {
      setExited(true);
      setStatus('idle');
    });
    const offStatus = window.pty.onStatus(id, (info) => info && setStatus(info.status));

    termRef.current = term;
    fitRef.current = fit;
    if (!askResumeAtMount.current) {
      window.pty.create({ id, agentId: data.agentId, cwd: data.cwd, cols: term.cols, rows: term.rows }).then((result) => {
        if (disposed) return;
        if (result?.buffer) term.write(result.buffer);
        if (result?.status) setStatus(result.status.status);
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
  }, [id, accent, terminalFontSize]);

  const launch = (resume) => {
    const term = termRef.current;
    if (!term) return;
    updateNodeData(id, { restored: false });
    window.pty.create({ id, agentId: data.agentId, cwd: data.cwd, cols: term.cols, rows: term.rows, resume });
    term.focus();
  };

  // Le processus s'est terminé : on relance l'agent dans la même case et le même dossier.
  const restart = () => {
    const term = termRef.current;
    if (!term) return;
    setExited(false);
    term.write('\r\n');
    window.pty.create({ id, agentId: data.agentId, cwd: data.cwd, cols: term.cols, rows: term.rows });
    term.focus();
  };

  const close = () => {
    window.pty.kill(id);
    deleteElements({ nodes: [{ id }] });
  };

  // Clic n'importe où (terminal compris) = case choisie. En capture, car xterm
  // intercepte les clics dans le terminal. Désélectionne aussi les autres cases.
  const select = () => {
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

      <div
        ref={floating.ref}
        className={`terminal-node ${selected ? 'selected' : ''} ${dragging ? 'lifted' : ''} ${linkSource === id ? 'link-source' : ''} ${floating.animClass}`}
        onAnimationEnd={floating.onAnimationEnd}
        onPointerDownCapture={select}
      >
        {/* Glisser = déplacer la case, vrai clic = mode redimensionnement */}
        <header className="terminal-header drag-handle" {...headerProps}>
          <AgentLogo agent={agent} size={18} />
          <span className="terminal-title">
            {agent?.name}
            {data.cwd && <span className="terminal-folder" title={data.cwd}> · {baseName(data.cwd)}</span>}
          </span>
          {exited ? <span className="badge">terminé</span> : <StatusDot status={status} />}
          <span className="header-actions">
            {exited && (
              <button className="header-button nodrag" onClick={restart} title="Relancer">
                <RotateCcw size={13} />
                Relancer
              </button>
            )}
            <button className="close nodrag" onClick={close} title="Fermer"><X size={15} /></button>
          </span>
        </header>

        {/* nodrag / nowheel : on peut sélectionner du texte et scroller sans bouger la map */}
        <div className="terminal-body nodrag nowheel" onPointerDown={stopResizing}>
          <div className="terminal-mount" ref={containerRef} />
          {askResume && (
            <div className="resume-prompt">
              <p>Reprendre la dernière conversation de {agent.name} dans ce dossier ?</p>
              <div className="resume-actions">
                <button className="text-button primary" onClick={() => launch(true)}>
                  <History size={15} />
                  Reprendre la conversation
                </button>
                <button className="text-button" onClick={() => launch(false)}>
                  <MessageSquarePlus size={15} />
                  Nouvelle conversation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
