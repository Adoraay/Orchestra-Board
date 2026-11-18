import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, CircleAlert, Eye, LoaderCircle, RotateCcw, Square, WandSparkles, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';
import useT from '../hooks/useT.js';
import { displayPath } from '../lib/paths.js';
import { toolLabel } from '../lib/conductorLabels.js';
import MarkdownText from './MarkdownText.jsx';

// Bulle du chef d'orchestre (PLAN.md §3.25), en haut de la map : l'utilisateur décrit ce qu'il veut, le chef
// d'orchestre construit et dirige l'orchestre. Fermée, une pastille ; ouverte, la conversation du tableau,
// ses actions au fil de l'eau et la zone de saisie. Il n'agit que quand on lui écrit.
// En aperçu, ses changements attendent : la carte du plan propose Valider, Annuler, ou une correction à écrire.
export default function ConductorBar({ boardId, session, open, onToggle, nameOf }) {
  const t = useT();
  const { activeFolder, rootPath, homeDir } = useWorkspace();
  const { settings, updateSettings } = useSettings();
  // Sans dossier choisi dans l'explorateur : sa racine, sinon le dossier personnel.
  const folder = activeFolder ?? rootPath ?? homeDir;
  const { history, running, live, pending } = session;
  const [deciding, setDeciding] = useState(false);
  const planned = pending.length > 0 && !running;
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
  const decide = async (action) => {
    setDeciding(true);
    const result = await window.conductorSession[action](boardId);
    setDeciding(false);
    setError(result?.error ?? '');
    stick.current = true;
  };
  const reset = async () => {
    const result = await window.conductorSession.reset(boardId);
    setError(result?.error ?? '');
  };

  if (!open) {
    return (
      <button className={`conductor-pill ${running || planned ? 'running' : ''}`} onClick={onToggle} title={t('conductor.openTitle')}>
        {running ? <LoaderCircle size={14} className="conductor-spin" /> : planned ? <Eye size={14} /> : <WandSparkles size={14} />}
        {running ? t('conductor.working') : planned ? t('conductor.planReady') : t('conductor.title')}
      </button>
    );
  }

  const label = (entry) => toolLabel(t, entry, nameOf);

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
        <select
          className="conductor-engine"
          value={settings.conductor.engine}
          disabled={running}
          title={t(`general.conductorEngine.${settings.conductor.engine}`)}
          aria-label={t('conductor.engineLabel')}
          onChange={(e) => updateSettings('conductor', { engine: e.target.value })}
        >
          <option value="claude">{t('conductor.engine.claude')}</option>
          <option value="codex">{t('conductor.engine.codex')}</option>
        </select>
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
            <div key={index} className={`conductor-msg ${entry.kind}`}>{entry.kind === 'assistant' ? <MarkdownText text={entry.text} /> : entry.text}</div>
          ),
        )}
        {live && <div className="conductor-msg assistant live"><MarkdownText text={live} /></div>}
        {running && !live && <div className="conductor-thinking"><LoaderCircle size={13} className="conductor-spin" />{t('conductor.thinking')}</div>}
      </div>

      {planned && (
        <div className="conductor-plan" role="group" aria-label={t('conductor.plan.title', { count: pending.length })}>
          <div className="conductor-plan-title"><Eye size={14} />{t('conductor.plan.title', { count: pending.length })}</div>
          <ul className="conductor-plan-list">
            {pending.map((item, index) => <li key={item.tempId ?? index}>{item.summary}</li>)}
          </ul>
          <div className="conductor-plan-actions">
            <span className="hint">{t('conductor.plan.hint')}</span>
            <button className="text-button" disabled={deciding} onClick={() => decide('cancel')}>{t('conductor.plan.cancel')}</button>
            <button className="text-button primary" disabled={deciding} onClick={() => decide('approve')}>
              {deciding ? <LoaderCircle size={14} className="conductor-spin" /> : <Check size={14} />}
              {t('conductor.plan.approve')}
            </button>
          </div>
        </div>
      )}

      <form className="conductor-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea
          ref={inputRef}
          value={text}
          rows={2}
          maxLength={20000}
          placeholder={planned ? t('conductor.placeholderFix') : history.length ? t('conductor.placeholderNext') : t('conductor.placeholder')}
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
