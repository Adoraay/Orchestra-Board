import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, CircleAlert, LoaderCircle, RotateCcw, Square, WandSparkles, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import useConductorSession from '../hooks/useConductorSession.js';
import useT from '../hooks/useT.js';
import { displayPath } from '../lib/paths.js';

const KNOWN_TOOLS = ['read_board', 'create_agent', 'create_link', 'update_link', 'remove_link', 'create_sticky', 'update_sticky', 'set_role', 'send_to', 'remove_agent', 'read_agent_output', 'arrange'];

// Bulle du chef d'orchestre (PLAN.md §3.25), en haut de la map : l'utilisateur décrit ce qu'il veut, le chef
// d'orchestre construit et dirige l'orchestre. Fermée, une pastille ; ouverte, la conversation du tableau,
// ses actions au fil de l'eau et la zone de saisie. Il n'agit que quand on lui écrit.
export default function ConductorBar({ boardId, open, onToggle, nameOf }) {
  const t = useT();
  const { activeFolder, rootPath, homeDir } = useWorkspace();
  // Sans dossier choisi dans l'explorateur : sa racine, sinon le dossier personnel.
  const folder = activeFolder ?? rootPath ?? homeDir;
  const { history, running, live } = useConductorSession(boardId);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const stick = useRef(true); // défilement automatique tant qu'on est en bas

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && stick.current) list.scrollTop = list.scrollHeight;
  }, [history, live, open]);

  const submit = async () => {
    const message = text.trim();
    if (!message || running) return;
    setError('');
    stick.current = true;
    const result = await window.conductorSession.send(boardId, message, folder);
    if (result?.error) setError(result.error);
    else setText('');
  };
  const reset = async () => {
    const result = await window.conductorSession.reset(boardId);
    setError(result?.error ?? '');
  };

  if (!open) {
    return (
      <button className={`conductor-pill ${running ? 'running' : ''}`} onClick={onToggle} title={t('conductor.openTitle')}>
        {running ? <LoaderCircle size={14} className="conductor-spin" /> : <WandSparkles size={14} />}
        {running ? t('conductor.working') : t('conductor.title')}
      </button>
    );
  }

  const label = (entry) => {
    const input = entry.input ?? {};
    const vars = {
      name: input.name ?? '',
      type: input.type ? t(`conductor.type.${input.type}`) : '',
      from: nameOf(input.from),
      to: nameOf(input.to),
      agent: nameOf(input.agent),
      sticky: nameOf(input.sticky),
      layout: input.layout ? t(`conductor.layout.${input.layout}`) : '',
    };
    return KNOWN_TOOLS.includes(entry.tool) ? t(`conductor.tool.${entry.tool}`, vars) : t('conductor.tool.other', { tool: entry.tool });
  };

  return (
    <section
      className="conductor-bar nowheel"
      aria-label={t('conductor.title')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onToggle(); }
      }}
    >
      <header className="conductor-header">
        <WandSparkles size={15} className="conductor-icon" />
        <span className="conductor-title">{t('conductor.title')}</span>
        <span className="conductor-folder" title={t('conductor.folderHint', { path: folder ?? '' })}>{displayPath(folder, homeDir)}</span>
        <button className="icon-button" onClick={reset} disabled={running || !history.length} title={t('conductor.reset')}><RotateCcw size={14} /></button>
        <button className="icon-button" onClick={onToggle} title={t('common.close')}><X size={15} /></button>
      </header>

      <div
        className="conductor-list"
        ref={listRef}
        onScroll={(e) => { const l = e.currentTarget; stick.current = l.scrollHeight - l.scrollTop - l.clientHeight < 24; }}
      >
        {!history.length && !live && <p className="conductor-empty">{t('conductor.empty')}</p>}
        {history.map((entry, index) =>
          entry.kind === 'tool' ? (
            <div key={index} className={`conductor-tool ${entry.error ? 'error' : ''}`}>
              {entry.error ? <CircleAlert size={13} /> : entry.done || !running ? <Check size={13} /> : <LoaderCircle size={13} className="conductor-spin" />}
              <span>{label(entry)}</span>
              {entry.error && <span className="conductor-tool-error">{entry.error}</span>}
            </div>
          ) : (
            <div key={index} className={`conductor-msg ${entry.kind}`}>{entry.text}</div>
          ),
        )}
        {live && <div className="conductor-msg assistant live">{live}</div>}
        {running && !live && <div className="conductor-thinking"><LoaderCircle size={13} className="conductor-spin" />{t('conductor.thinking')}</div>}
      </div>

      <form className="conductor-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea
          ref={inputRef}
          value={text}
          rows={2}
          maxLength={20000}
          placeholder={history.length ? t('conductor.placeholderNext') : t('conductor.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        {running ? (
          <button type="button" className="conductor-send stop" onClick={() => window.conductorSession.stop(boardId)} title={t('conductor.stop')}><Square size={14} /></button>
        ) : (
          <button type="submit" className="conductor-send" disabled={!text.trim()} title={t('conductor.send')}><ArrowUp size={16} /></button>
        )}
      </form>
      {error && <p className="conductor-error" role="alert">{error}</p>}
    </section>
  );
}
