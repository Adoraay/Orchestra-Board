import { useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import { X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { agentById } from '../agents.js';
import AgentLogo from './AgentLogo.jsx';
import useFloatingDrag from '../hooks/useFloatingDrag.js';
import { terminalFont, terminalTheme } from '../lib/terminalTheme.js';

// Un nœud de la map = une fenêtre avec un vrai terminal dedans.
export default function TerminalNode({ id, data, selected, dragging, positionAbsoluteX }) {
  const containerRef = useRef(null);
  const [exited, setExited] = useState(false);
  const { deleteElements } = useReactFlow();
  const floating = useFloatingDrag(dragging, positionAbsoluteX);
  const agent = agentById(data.agentId);

  useEffect(() => {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: terminalFont(),
      theme: terminalTheme(),
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    // Clavier -> PTY, PTY -> écran
    const offInput = term.onData((d) => window.pty.write(id, d));
    const offData = window.pty.onData(id, (d) => term.write(d));
    const offExit = window.pty.onExit(id, () => setExited(true));

    window.pty.create({ id, agentId: data.agentId, cols: term.cols, rows: term.rows });

    // Quand la case change de taille, le terminal suit.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        window.pty.resize(id, term.cols, term.rows);
      } catch {}
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      offInput.dispose();
      offData();
      offExit();
      term.dispose();
    };
  }, [id, data.agentId]);

  const close = () => {
    window.pty.kill(id);
    deleteElements({ nodes: [{ id }] });
  };

  return (
    <div
      ref={floating.ref}
      className={`terminal-node ${selected ? 'selected' : ''} ${dragging ? 'lifted' : ''} ${floating.animClass}`}
      onAnimationEnd={floating.onAnimationEnd}
    >
      <NodeResizer minWidth={360} minHeight={220} isVisible={selected} />
      {/* Points d'accroche pour les futurs liens entre agents */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* Seule la barre de titre sert à déplacer la case */}
      <header className="terminal-header drag-handle">
        <AgentLogo agent={agent} size={18} />
        <span>{agent?.name}</span>
        {exited && <span className="badge">terminé</span>}
        <button className="close nodrag" onClick={close} title="Fermer"><X size={15} /></button>
      </header>

      {/* nodrag / nowheel : on peut sélectionner du texte et scroller sans bouger la map */}
      <div className="terminal-body nodrag nowheel" ref={containerRef} />
    </div>
  );
}
