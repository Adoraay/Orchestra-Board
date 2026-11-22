import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import { ArrowLeft, ArrowRight, Braces, Cookie, Globe, Plus, RotateCw, Settings2, X } from 'lucide-react';
import { BLANK_URL, BROWSER_PARTITION, MAX_BROWSER_TABS, PREFERENCE_COOKIE_MAX_VALUE, PREFERENCE_COOKIE_NAMES, addressUrl, browserTitle, browserUrl, isPreferenceCookieValue, newBrowserTab } from '../../electron/browserModel.mjs';
import { useBoard } from '../context/BoardContext.jsx';
import useT from '../hooks/useT.js';

function BrowserButton({ icon: Icon, label, children, ...props }) {
  return <button type="button" className="browser-button nodrag nopan" title={label} aria-label={label} {...props}>
    <Icon size={15} aria-hidden="true" />{children}
  </button>;
}

function BrowserPage({ boardId, browserId, tab, active, label, views, onRuntime, onCommit }) {
  const viewRef = useRef(null);
  const [startUrl] = useState(tab.url);

  useLayoutEffect(() => {
    const view = viewRef.current;
    const tabId = tab.id;
    views.current.set(tabId, view);
    let guestId;
    let url = startUrl;
    const sync = (patch = {}) => onRuntime(tabId, {
      ...patch,
      ...(guestId != null && { guestId, canGoBack: view.canGoBack(), canGoForward: view.canGoForward() }),
    });
    const onNavigate = (event) => {
      if (event.isMainFrame === false) return;
      const nextUrl = browserUrl(event.url);
      if (nextUrl && nextUrl !== url) {
        url = nextUrl;
        onCommit(tabId, { url, ...(event.type === 'did-navigate' && { title: '' }) });
      }
      sync({ failed: false });
    };
    const handlers = {
      'dom-ready': () => {
        if (guestId == null) {
          guestId = view.getWebContentsId();
          window.interactiveBrowser.register(guestId, boardId, browserId, tabId).catch(() => {});
        }
        const title = browserTitle(view.getTitle());
        if (url !== BLANK_URL && title) onCommit(tabId, { title });
        sync();
      },
      'did-start-loading': () => sync({ isLoading: true, failed: false }),
      'did-stop-loading': () => sync({ isLoading: false }),
      'did-navigate': onNavigate,
      'did-navigate-in-page': onNavigate,
      'did-fail-load': (event) => {
        if (event.isMainFrame && event.errorCode !== -3) sync({ failed: true });
      },
      'render-process-gone': () => sync({ failed: true, isLoading: false }),
      'page-title-updated': (event) => {
        if (url !== BLANK_URL) onCommit(tabId, { title: browserTitle(event.title) });
      },
    };
    for (const [name, listener] of Object.entries(handlers)) view.addEventListener(name, listener);
    return () => {
      for (const [name, listener] of Object.entries(handlers)) view.removeEventListener(name, listener);
      views.current.delete(tabId);
    };
  }, [boardId, browserId, tab.id, startUrl, views, onRuntime, onCommit]);

  return <webview ref={viewRef} partition={BROWSER_PARTITION} src={startUrl} title={label}
    id={`browser-page-${browserId}-${tab.id}`} role="tabpanel" aria-labelledby={`browser-tab-${browserId}-${tab.id}`}
    className="browser-webview" style={active ? undefined : { display: 'none' }} />;
}

const NEW_PREFERENCE = { name: PREFERENCE_COOKIE_NAMES[0], value: '', path: '/' };

function CookiesPanel({ guestId, url }) {
  const t = useT();
  const valueHintId = useId();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preference, setPreference] = useState(NEW_PREFERENCE);
  const [editing, setEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const valueInput = useRef(null);
  const domain = snapshot ? new URL(snapshot.origin).hostname : '';

  const resetPreference = () => {
    setPreference(NEW_PREFERENCE);
    setEditing(false);
    setSaveStatus(null);
  };
  useEffect(() => {
    if (guestId == null || url === BLANK_URL) return;
    let disposed = false;
    window.interactiveBrowser.cookies(guestId, url).then((result) => {
      if (!disposed) { setSnapshot(result); setError(!result); }
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; };
  }, [guestId, url]);

  async function remove() {
    setBusy(true);
    setError(false);
    try {
      const result = await window.interactiveBrowser.removeCookies(guestId, url);
      if (result) {
        setSnapshot(result);
        resetPreference();
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  async function savePreference(event) {
    event.preventDefault();
    if (busy || confirm) return;
    const value = preference.value.trim();
    if (!isPreferenceCookieValue(preference.name, value)) {
      setSaveStatus('invalid');
      valueInput.current?.focus();
      return;
    }
    setBusy(true);
    setSaveStatus(null);
    try {
      const result = await window.interactiveBrowser.savePreferenceCookie(guestId, url, { ...preference, value, domain });
      if (result) {
        setSnapshot(result);
        setPreference({ ...preference, value });
      }
      setSaveStatus(result ? 'saved' : 'failed');
    } catch {
      setSaveStatus('failed');
    } finally {
      setBusy(false);
    }
  }

  return <section className="browser-popover nodrag nopan nowheel" aria-label={t('browser.cookies')}>
    <h3>{t('browser.cookies')}</h3>
    {snapshot && <p className="browser-cookie-origin">{snapshot.origin}</p>}
    {error && <p role="alert">{t('browser.cookiesFailed')}</p>}
    {url === BLANK_URL ? <p>{t('browser.cookiesNoPage')}</p> : !snapshot && !error && <p role="status">{t('browser.loading')}</p>}
    {snapshot?.cookies.length === 0 && <p>{t('browser.cookiesEmpty')}</p>}
    {snapshot && <form className="browser-cookie-form" onSubmit={savePreference}>
      <fieldset disabled={busy || confirm}>
        <legend>{t('browser.cookiePreferences')}</legend>
        <div className="browser-cookie-fields">
          <label>{t('browser.cookieName')}
            <select value={preference.name} disabled={editing} onChange={(event) => {
              setPreference({ ...NEW_PREFERENCE, name: event.target.value });
              setSaveStatus(null);
            }}>
              {PREFERENCE_COOKIE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>{t('browser.cookieValue')}
            <input ref={valueInput} value={preference.value} maxLength={PREFERENCE_COOKIE_MAX_VALUE} spellCheck={false}
              aria-describedby={valueHintId} aria-invalid={saveStatus === 'invalid'}
              onChange={(event) => { setPreference({ ...preference, value: event.target.value }); setSaveStatus(null); }} />
          </label>
          <label>{t('browser.cookieDomain')}<input readOnly value={domain} /></label>
        </div>
        <p className="hint" id={valueHintId} role={saveStatus === 'invalid' ? 'alert' : undefined}>
          {t(`browser.cookieValueHint.${preference.name}`)}
        </p>
        {editing && preference.path !== '/' && <p className="hint">{t('browser.cookiePath', { path: preference.path })}</p>}
        <div className="browser-popover-actions">
          <button type="submit" className="text-button primary">{t('browser.cookieSave')}</button>
          {editing && <button type="button" className="text-button" onClick={resetPreference}>{t('common.cancel')}</button>}
        </div>
      </fieldset>
      {saveStatus === 'saved' && <p className="browser-cookie-feedback" role="status">{t('browser.cookieSaved')}</p>}
      {saveStatus === 'failed' && <p className="browser-cookie-feedback" role="alert">{t('browser.cookieSaveFailed')}</p>}
    </form>}
    {!!snapshot?.cookies.length && <>
      <ul className="browser-cookie-list">
        {snapshot.cookies.map(({ name, domain, path, secure, httpOnly, editableValue }) => <li key={JSON.stringify([name, domain, path])}>
          <span><strong>{name}</strong><small>{domain}{path}{secure ? ' · Secure' : ''}{httpOnly ? ' · HttpOnly' : ''}</small></span>
          {editableValue !== undefined && <button type="button" className="text-button" disabled={busy || confirm}
            aria-label={t('browser.cookieEditName', { name, path })} onClick={() => {
              setPreference({ name, value: editableValue, path });
              setEditing(true);
              setSaveStatus(null);
              valueInput.current?.focus();
            }}>{t('browser.cookieEdit')}</button>}
        </li>)}
      </ul>
      {confirm ? <>
        <p>{t('browser.cookiesConfirm')}</p>
        <div className="browser-popover-actions">
          <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
          <button type="button" className="text-button danger" disabled={busy} onClick={remove}>{t('browser.cookiesRemove')}</button>
        </div>
      </> : <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirm(true)}>{t('browser.cookiesRemove')}</button>}
    </>}
  </section>;
}

function StartPagePanel({ url, onSave }) {
  const t = useT();
  const [draft, setDraft] = useState(url === BLANK_URL ? '' : url);
  const [invalid, setInvalid] = useState(false);
  return <form className="browser-popover nodrag nopan nowheel" onSubmit={(event) => {
    event.preventDefault();
    const next = addressUrl(draft);
    if (next) onSave(next);
    else setInvalid(true);
  }}>
    <label>{t('browser.newTabUrl')}
      <input value={draft} onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
        placeholder={t('browser.blankTab')} aria-invalid={invalid} autoFocus />
    </label>
    {invalid && <p role="alert">{t('browser.invalidUrl')}</p>}
    <button type="submit" className="text-button">{t('common.save')}</button>
  </form>;
}

export default function InteractiveBrowserNode({ id, data, selected }) {
  const t = useT();
  const { boardId, tool, linkSource } = useBoard();
  const { setNodes, updateNodeData } = useReactFlow();
  const { tabs, activeTabId, newTabUrl } = data;
  const [runtime, setRuntime] = useState({});
  const [draft, setDraft] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [panel, setPanel] = useState(null);
  const views = useRef(new Map());
  const tabList = useRef(null);
  const panelTrigger = useRef(null);
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const { guestId, canGoBack = false, canGoForward = false, failed, isLoading } = runtime[active.id] ?? {};
  const view = () => views.current.get(active.id);
  const labelOf = (tab) => tab.title || (tab.url === BLANK_URL ? t('browser.blankTab') : new URL(tab.url).host);

  useEffect(() => {
    tabList.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' });
  }, [active.id]);

  const onRuntime = useCallback((tabId, patch) => {
    setRuntime((current) => ({ ...current, [tabId]: { ...current[tabId], ...patch } }));
  }, []);
  const onCommit = useCallback((tabId, patch) => {
    setNodes((nodes) => {
      const node = nodes.find((entry) => entry.id === id);
      const tab = node?.data.tabs?.find((entry) => entry.id === tabId);
      if (!tab || Object.entries(patch).every(([key, value]) => tab[key] === value)) return nodes;
      const tabs = node.data.tabs.map((entry) => entry.id === tabId ? { ...entry, ...patch } : entry);
      return nodes.map((entry) => entry === node ? { ...node, data: { ...node.data, tabs } } : entry);
    });
  }, [id, setNodes]);

  const resetControls = () => { setDraft(null); setInvalid(false); setPanel(null); };
  const togglePanel = (next, event) => {
    panelTrigger.current = event.currentTarget;
    setPanel(panel === next ? null : next);
  };
  const selectTab = (tabId) => {
    resetControls();
    updateNodeData(id, { activeTabId: tabId });
  };
  const addTab = () => {
    const tab = newBrowserTab(newTabUrl);
    resetControls();
    updateNodeData(id, (node) => node.data.tabs.length >= MAX_BROWSER_TABS ? {} : {
      tabs: [...node.data.tabs, tab], activeTabId: tab.id,
    });
  };
  const closeTab = (tabId) => {
    const replacement = newBrowserTab(newTabUrl);
    if (tabId === active.id) resetControls();
    setRuntime(({ [tabId]: _closed, ...remaining }) => remaining);
    updateNodeData(id, (node) => {
      const { tabs, activeTabId } = node.data;
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      if (!remaining.length) remaining.push(replacement);
      return { tabs: remaining, activeTabId: activeTabId === tabId ? (remaining[index] ?? remaining.at(-1)).id : activeTabId };
    });
  };

  function navigate(event) {
    event.preventDefault();
    const target = addressUrl(draft ?? active.url);
    setInvalid(!target);
    if (!target || guestId == null) return;
    setDraft(null);
    view()?.loadURL(target).catch(() => {});
  }

  function handleTabKeys(event) {
    const index = tabs.findIndex((tab) => tab.id === active.id);
    const destinations = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(destinations, event.key) || event.target.getAttribute('role') !== 'tab') return;
    event.preventDefault();
    const next = destinations[event.key];
    selectTab(tabs[next].id);
    event.currentTarget.querySelectorAll('[role="tab"]')[next].focus();
  }

  return <article className={`interactive-browser-node${selected ? ' selected' : ''}${linkSource === id ? ' link-source' : ''}`} aria-label={t('dock.browser')}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !panel) return;
      event.stopPropagation();
      setPanel(null);
      panelTrigger.current?.focus();
    }}>
    <NodeResizer isVisible={selected && tool === 'select'} minWidth={450} minHeight={310} />
    {/* Poignées invisibles : sans elles, React Flow ne dessine pas les liens de la case. */}
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
    <header className="interactive-browser-header">
      <Globe size={17} aria-hidden="true" /><strong>{t('dock.browser')}</strong>
      <BrowserButton icon={Cookie} label={t('browser.cookies')} aria-expanded={panel === 'cookies'} onClick={(event) => togglePanel('cookies', event)} />
      <BrowserButton icon={Settings2} label={t('browser.newTabUrl')} aria-expanded={panel === 'start'} onClick={(event) => togglePanel('start', event)} />
      <BrowserButton icon={Braces} label={t('browser.devTools')} disabled={guestId == null} onClick={() => view()?.openDevTools()} />
    </header>
    <div className="browser-tab-strip nodrag nopan">
      <div ref={tabList} className="browser-tabs nowheel" role="tablist" aria-label={t('browser.tabs')} onKeyDown={handleTabKeys}>
        {tabs.map((tab) => <div className="browser-tab" key={tab.id} data-active={tab.id === active.id}>
          <button type="button" role="tab" id={`browser-tab-${id}-${tab.id}`} aria-controls={`browser-page-${id}-${tab.id}`}
            aria-selected={tab.id === active.id} tabIndex={tab.id === active.id ? 0 : -1}
            title={labelOf(tab)} onClick={() => selectTab(tab.id)}>{labelOf(tab)}</button>
          <BrowserButton icon={X} label={t('browser.closeTab', { title: labelOf(tab) })} onClick={() => closeTab(tab.id)} />
        </div>)}
      </div>
      <BrowserButton icon={Plus} label={t('browser.newTab')} disabled={tabs.length >= MAX_BROWSER_TABS} onClick={addTab} />
    </div>
    <form className="browser-navigation nodrag nopan" onSubmit={navigate}>
      <BrowserButton icon={ArrowLeft} label={t('browser.back')} disabled={!canGoBack} onClick={() => { setDraft(null); setInvalid(false); view()?.goBack(); }} />
      <BrowserButton icon={ArrowRight} label={t('browser.forward')} disabled={!canGoForward} onClick={() => { setDraft(null); setInvalid(false); view()?.goForward(); }} />
      <BrowserButton icon={RotateCw} label={t('browser.reload')} disabled={guestId == null} onClick={() => view()?.reload()} />
      <input value={draft ?? (active.url === BLANK_URL ? '' : active.url)} onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
        aria-label={t('browser.address')} aria-invalid={invalid} placeholder={t('browser.address')} spellCheck={false} />
      {isLoading && <span className="browser-loading" role="status" aria-label={t('browser.loading')} />}
    </form>
    {(invalid || failed) && <div className="browser-error" role="alert">{t(invalid ? 'browser.invalidUrl' : 'browser.loadFailed')}</div>}
    <div className="browser-pages nodrag nopan nowheel">
      {tabs.map((tab) => <BrowserPage key={tab.id} boardId={boardId} browserId={id} tab={tab} active={tab.id === active.id}
        label={labelOf(tab)} views={views} onRuntime={onRuntime} onCommit={onCommit} />)}
      {panel === 'cookies' && <CookiesPanel key={`${active.id}:${active.url}:${guestId}`} guestId={guestId} url={active.url} />}
      {panel === 'start' && <StartPagePanel url={newTabUrl} onSave={(url) => {
        updateNodeData(id, { newTabUrl: url });
        setPanel(null);
        panelTrigger.current?.focus();
      }} />}
    </div>
  </article>;
}
