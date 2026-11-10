// Orchestra — site : le mini-tableau jouable du héro et la démo du notch de permission.
// Tout est scénarisé : aucun agent ne tourne ici.
(() => {
  const { t } = window.i18n;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CANCEL = Symbol('cancel');
  const SVG = 'http://www.w3.org/2000/svg';
  const esc = (text) => String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}" /></svg>`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const AGENTS = {
    claude: { name: 'Claude', logo: 'assets/agents/claude-code.svg', hooks: true, banner: 'Claude Code v2.1' },
    codex: { name: 'Codex', logo: 'assets/agents/codex.svg', hooks: true, banner: '>_ OpenAI Codex' },
    gemini: { name: 'Gemini', logo: 'assets/agents/gemini.svg', hooks: false, banner: 'Gemini CLI' },
    shell: { name: 'Terminal', logo: 'assets/agents/shell.svg', shell: true },
  };
  // Ce que dit chaque case du tableau de départ ; les autres cases utilisent le texte générique.
  const SCRIPTS = {
    lead: { prompt: 's.prompt', plan: 's.lead.plan', steps: [], task: 's.lead.task', final: 's.lead.final', finalNo: 's.lead.finalNo' },
    frontend: { steps: ['s.fe.1', 's.fe.2'], final: 's.fe.final' },
    reviewer: { steps: ['s.rev.1'], final: 's.rev.final' },
  };
  const GENERIC = { prompt: 's.prompt', steps: ['s.gen.1'], task: 's.gen.task', final: 's.gen.final' };

  // --- Notch de permission : sort de l'Inbox de la barre, renvoie true (Accepter) ou false (Refuser) ---
  function askPermission(app, { logo, name, tool, detail }) {
    const inbox = app.querySelector('[data-inbox]');
    const badge = inbox.querySelector('b');
    const notch = document.createElement('div');
    notch.className = 'notch';
    notch.setAttribute('role', 'alert');
    notch.innerHTML = `<div class="notch-title"><img src="${logo}" alt="" /><span>${esc(t('notch.waiting', { name }))}</span></div>
      <div class="notch-detail"><strong>${esc(tool)}</strong><code>${esc(detail)}</code></div>
      <div class="notch-actions"><button type="button" class="no">${icon('x')}${esc(t('notch.refuse'))}</button><button type="button" class="yes">${icon('check')}${esc(t('notch.accept'))}</button></div>`;
    app.append(notch);
    const place = () => {
      const a = app.getBoundingClientRect();
      const r = inbox.getBoundingClientRect();
      const width = notch.offsetWidth;
      const left = clamp(r.right - a.left + 14 - width, 8, a.width - width - 8);
      notch.style.left = `${left}px`;
      notch.style.top = `${r.bottom - a.top + 9}px`;
      notch.style.setProperty('--caret', `${r.left + r.width / 2 - a.left - left}px`);
    };
    place();
    window.addEventListener('resize', place);
    inbox.classList.add('has');
    badge.hidden = false;
    let done;
    const promise = new Promise((resolve) => (done = resolve));
    const close = (answer) => {
      window.removeEventListener('resize', place);
      inbox.classList.remove('has');
      badge.hidden = true;
      notch.classList.add('bye');
      setTimeout(() => notch.remove(), 180);
      app.pendingAsk = null;
      done(answer);
    };
    notch.querySelector('.yes').addEventListener('click', () => close(true));
    notch.querySelector('.no').addEventListener('click', () => close(false));
    app.pendingAsk = () => close(null);
    return promise;
  }

  function addLine(tile, html, cls) {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.innerHTML = html;
    tile.term.append(line);
    while (tile.term.children.length > 24) tile.term.firstChild.remove();
    tile.term.scrollTop = tile.term.scrollHeight;
    return line;
  }
  function setStatus(tile, status, glow = true) {
    tile.status = status;
    tile.dot.className = `st ${status}`;
    tile.el.classList.toggle('finished', status === 'done' && glow);
    tile.el.classList.toggle('asking', status === 'waiting');
  }

  // =====================================================================================
  // Mini-tableau
  // =====================================================================================
  const app = document.getElementById('board');
  if (app) {
    const map = app.querySelector('[data-map]');
    const edges = app.querySelector('[data-edges]');
    const logList = app.querySelector('[data-log]');
    const hint = document.getElementById('board-hint');
    const runButton = document.getElementById('board-run');
    const tiles = new Map();
    let links = [];
    let seq = 0;
    let run = 0; // change à chaque lancement ou remise à zéro : annule le scénario en cours
    let running = false;
    let dirty = false; // l'utilisateur a modifié le tableau : on ne le remet plus en place au redimensionnement
    let tool = 'select';
    let linkFrom = null;
    let selected = null;
    let background = [];
    let hintState = { key: 'board.idle' };
    let hintTimer = 0;

    const pause = async (token, ms) => {
      await wait(reduced ? Math.min(ms, 250) : ms);
      if (token !== run) throw CANCEL;
    };
    const narrow = () => map.clientWidth < 560;

    // --- Aide sous le tableau ---
    function renderHint(state = hintState) {
      hint.innerHTML = t(state.key, state.vars);
      hint.classList.toggle('attn', !!state.attn);
    }
    function setHint(key, vars, attn) {
      clearTimeout(hintTimer);
      hintState = { key, vars, attn };
      renderHint();
    }
    function flash(key) {
      clearTimeout(hintTimer);
      renderHint({ key, attn: true });
      hintTimer = setTimeout(() => renderHint(), 3200);
    }

    // --- Cases ---
    function addTile({ agent, name, role, x, y, w, h, pop }) {
      const def = AGENTS[agent];
      const id = `t${++seq}`;
      const el = document.createElement('div');
      el.className = `tile${pop ? ' pop' : ''}`;
      el.innerHTML = `<div class="tile-head"><img src="${def.logo}" alt="" draggable="false" /><b>${esc(name)}</b><span class="tile-folder">· landing-page</span><i class="st idle"></i><button type="button" class="tile-x" aria-label="${esc(t('tile.close'))}">${icon('x')}</button></div><div class="tile-term"></div>`;
      map.append(el);
      const tile = { id, agent, name, role, x, y, w, h, el, term: el.querySelector('.tile-term'), dot: el.querySelector('.st'), status: 'idle', queue: Promise.resolve() };
      addLine(tile, def.shell ? 'PS ~/acme/landing-page&gt; <span class="caret"></span>' : esc(def.banner), def.shell ? '' : 'dim');
      if (!def.shell) addLine(tile, '~/acme/landing-page', 'dim');
      tiles.set(id, tile);
      placeTile(tile);

      el.addEventListener('pointerdown', () => { if (tool === 'select') select(tile); });
      el.addEventListener('click', (event) => {
        if (tool !== 'link' || event.target.closest('.tile-x')) return;
        pickForLink(tile);
      });
      el.querySelector('.tile-x').addEventListener('click', (event) => {
        event.stopPropagation();
        if (running) return flash('board.running');
        removeTile(tile);
      });
      dragTile(tile, el.querySelector('.tile-head'));
      return tile;
    }
    function placeTile(tile) {
      tile.x = clamp(tile.x, 0, Math.max(0, map.clientWidth - tile.w));
      tile.y = clamp(tile.y, 0, Math.max(0, map.clientHeight - tile.h));
      Object.assign(tile.el.style, { left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.w}px`, height: `${tile.h}px` });
    }
    function removeTile(tile) {
      dirty = true;
      links.filter((l) => l.from === tile.id || l.to === tile.id).forEach(removeLink);
      tile.el.remove();
      tiles.delete(tile.id);
      if (selected === tile) selected = null;
    }
    function select(tile) {
      selected?.el.classList.remove('sel');
      selected = tile;
      tile?.el.classList.add('sel');
    }
    function dragTile(tile, handle) {
      handle.addEventListener('pointerdown', (event) => {
        if (tool !== 'select' || event.button !== 0 || event.target.closest('.tile-x')) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const start = { px: event.clientX, py: event.clientY, x: tile.x, y: tile.y };
        const move = (e) => {
          tile.x = start.x + e.clientX - start.px;
          tile.y = start.y + e.clientY - start.py;
          tile.el.classList.add('lift');
          dirty = true;
          placeTile(tile);
          layout();
        };
        const up = () => {
          tile.el.classList.remove('lift');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }

    // --- Liens ---
    function addLink(from, to, type) {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('marker-end', 'url(#arrow)');
      edges.append(path);
      const pill = document.createElement('button');
      pill.type = 'button';
      map.append(pill);
      const link = { from: from.id, to: to.id, type, count: 0, limit: 3, refused: false, path, pill };
      pill.addEventListener('click', (event) => {
        event.stopPropagation();
        if (running) return flash('board.running');
        openMenu(link);
      });
      links.push(link);
      renderPill(link);
      return link;
    }
    function removeLink(link) {
      link.path.remove();
      link.pill.remove();
      links = links.filter((l) => l !== link);
    }
    function renderPill(link) {
      link.path.setAttribute('class', `edge ${link.type}`);
      link.pill.className = `pill ${link.type}${link.refused ? ' refused' : ''}`;
      link.pill.innerHTML = `<i></i>${esc(t(`type.${link.type}`))}${link.type === 'terminal' ? '' : `<em>${link.count}/${link.limit}</em>`}`;
    }
    function closeMenu() {
      map.querySelector('.pill-menu')?.remove();
    }
    function openMenu(link) {
      closeMenu();
      const menu = document.createElement('div');
      menu.className = 'pill-menu';
      const target = tiles.get(link.to);
      const types = AGENTS[target.agent].shell ? [] : AGENTS[target.agent].hooks ? ['relay', 'delegation'] : ['relay'];
      menu.innerHTML = types.map((type) => `<button type="button" data-type="${type}" class="${type === link.type ? 'on' : ''}">${esc(t(`type.${type}`))}</button>`).join('') + `<button type="button" class="del" data-del>${esc(t('menu.delete'))}</button>`;
      menu.style.left = link.pill.style.left;
      menu.style.top = link.pill.style.top;
      menu.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        dirty = true;
        if ('del' in button.dataset) removeLink(link);
        else { link.type = button.dataset.type; renderPill(link); }
        closeMenu();
      });
      map.append(menu);
    }
    document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.pill-menu, .pill')) closeMenu(); });

    function pickForLink(tile) {
      if (running) return flash('board.running');
      if (!linkFrom) {
        if (!AGENTS[tile.agent].hooks) return flash('board.noSource');
        linkFrom = tile;
        tile.el.classList.add('src');
        return setHint('board.linkB');
      }
      const from = linkFrom;
      if (tile === from) return setTool('select');
      if (links.some((l) => (l.from === from.id && l.to === tile.id) || (l.from === tile.id && l.to === from.id))) {
        setTool('select');
        return flash('board.exists');
      }
      dirty = true;
      addLink(from, tile, AGENTS[tile.agent].shell ? 'terminal' : 'relay');
      layout();
      setTool('select');
    }
    function setTool(next) {
      tool = next;
      linkFrom?.el.classList.remove('src');
      linkFrom = null;
      map.classList.toggle('linking', tool === 'link');
      app.querySelectorAll('[data-tool]').forEach((button) => {
        const on = button.dataset.tool === tool;
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', on);
      });
      if (tool === 'link') setHint('board.linkA');
      else if (!running) setHint(hintState.key === 'board.done' ? 'board.done' : 'board.idle');
    }
    app.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
      if (running && button.dataset.tool === 'link') return flash('board.running');
      setTool(button.dataset.tool);
    }));
    let hover = false;
    app.addEventListener('pointerenter', () => (hover = true));
    app.addEventListener('pointerleave', () => (hover = false));
    document.addEventListener('keydown', (event) => {
      if (!hover || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, textarea, button')) return;
      const key = event.key.toLowerCase();
      if (key === 'l' && !running) setTool('link');
      if (key === 'v' || key === 'escape') setTool('select');
    });

    // Tracé des liens : du milieu d'un côté au milieu du côté d'en face, comme dans l'app.
    function layout() {
      for (const link of links) {
        const a = tiles.get(link.from);
        const b = tiles.get(link.to);
        const dx = b.x + b.w / 2 - (a.x + a.w / 2);
        const dy = b.y + b.h / 2 - (a.y + a.h / 2);
        const horizontal = Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h);
        let d;
        if (horizontal) {
          const sx = dx > 0 ? a.x + a.w : a.x;
          const tx = dx > 0 ? b.x - 3 : b.x + b.w + 3;
          const sy = a.y + a.h / 2;
          const ty = b.y + b.h / 2;
          const k = (tx - sx) / 2;
          d = `M${sx} ${sy}C${sx + k} ${sy} ${tx - k} ${ty} ${tx} ${ty}`;
        } else {
          const sy = dy > 0 ? a.y + a.h : a.y;
          const ty = dy > 0 ? b.y - 3 : b.y + b.h + 3;
          const sx = a.x + a.w / 2;
          const tx = b.x + b.w / 2;
          const k = (ty - sy) / 2;
          d = `M${sx} ${sy}C${sx} ${sy + k} ${tx} ${ty - k} ${tx} ${ty}`;
        }
        link.path.setAttribute('d', d);
        const mid = link.path.getPointAtLength(link.path.getTotalLength() / 2);
        link.pill.style.left = `${mid.x}px`;
        link.pill.style.top = `${mid.y}px`;
      }
    }

    // Point lumineux qui parcourt un lien (retour = réponse).
    async function travel(token, link, back) {
      if (reduced) return pause(token, 150);
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', 4.5);
      dot.setAttribute('class', 'pulse');
      edges.append(dot);
      link.path.classList.add('live');
      const duration = 900;
      const start = performance.now();
      try {
        for (;;) {
          const k = Math.min(1, (performance.now() - start) / duration);
          const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          const p = link.path.getPointAtLength(link.path.getTotalLength() * (back ? 1 - eased : eased));
          dot.setAttribute('cx', p.x);
          dot.setAttribute('cy', p.y);
          if (k === 1) break;
          await new Promise(requestAnimationFrame);
          if (token !== run) throw CANCEL;
        }
      } finally {
        dot.remove();
        link.path.classList.remove('live');
      }
    }

    // --- Journal ---
    function log(from, to, label, text, refused) {
      const item = document.createElement('li');
      if (refused) item.className = 'refused';
      const time = new Date().toLocaleTimeString(window.i18n.lang, { hour: '2-digit', minute: '2-digit' });
      const short = text.length > 84 ? `${text.slice(0, 82)}…` : text;
      item.innerHTML = `<b>${esc(from.name)} → ${esc(to.name)}</b> ${esc(short)}<span>${esc(label)} · ${time}</span>`;
      logList.append(item);
      while (logList.children.length > 14) logList.firstChild.remove();
      logList.scrollTop = logList.scrollHeight;
    }
    function refuse(link, from, to, reason, vars) {
      link.refused = true;
      renderPill(link);
      log(from, to, t(`log.${reason}`, vars), '', true);
    }

    // --- Scénario ---
    async function typePrompt(token, tile, text) {
      const line = addLine(tile, '');
      for (let i = 1; i <= text.length; i++) {
        line.innerHTML = `<span class="acc">❯</span> ${esc(text.slice(0, i))}<span class="caret"></span>`;
        await pause(token, 20);
      }
      line.innerHTML = `<span class="acc">❯</span> ${esc(text)}`;
    }
    function bubble(tile) {
      const el = document.createElement('div');
      el.className = 'tile-bubble';
      el.textContent = t('bubble.done', { name: tile.name });
      tile.el.append(el);
      setTimeout(() => el.remove(), 3300);
    }

    // Une demande vers un agent occupé attend son tour.
    async function activate(token, tile, incoming, chain) {
      const previous = tile.queue;
      let release;
      tile.queue = new Promise((resolve) => (release = resolve));
      try {
        await previous;
        if (token !== run) throw CANCEL;
        return await work(token, tile, incoming, chain);
      } finally {
        release();
      }
    }

    async function work(token, tile, incoming, chain) {
      const def = AGENTS[tile.agent];
      const script = SCRIPTS[tile.role] ?? GENERIC;
      setStatus(tile, 'working');
      if (incoming) addLine(tile, `<span class="dim">⟵ ${esc(t('s.from', { name: incoming.from.name }))}:</span> ${esc(incoming.text)}`);
      else await typePrompt(token, tile, t(script.prompt ?? GENERIC.prompt));
      await pause(token, 600);

      // Sans hooks (Gemini…) : la case reçoit le message, son statut suit l'activité du terminal.
      if (!def.hooks) {
        addLine(tile, esc(t('s.gemini')), 'dim');
        await pause(token, 1300);
        const final = t('s.gen.final');
        addLine(tile, `● ${esc(final)}`);
        setStatus(tile, 'done');
        return final;
      }

      const outgoing = links.filter((l) => l.from === tile.id);
      const delegations = outgoing.filter((l) => l.type === 'delegation');
      const terminals = outgoing.filter((l) => l.type === 'terminal');
      if (script.plan && (delegations.length || terminals.length)) {
        addLine(tile, `● ${esc(t(script.plan))}`);
        await pause(token, 700);
      }
      for (const step of script.steps) {
        addLine(tile, `● ${esc(t(step))}`, 'dim');
        await pause(token, 850);
      }

      // Délégations : toutes partent, puis l'agent attend les réponses.
      let awaited = 0;
      const replies = delegations.map((link) => {
        const target = tiles.get(link.to);
        if (chain.includes(target.id) || target === tile) { refuse(link, tile, target, 'loop', { name: target.name }); return null; }
        if (link.count >= link.limit) { refuse(link, tile, target, 'limit'); addLine(tile, esc(t('s.refusedLimit')), 'bad'); return null; }
        link.count++;
        renderPill(link);
        const text = t(script.task ?? GENERIC.task);
        addLine(tile, `↳ send_to_agent("${esc(target.name)}")`, 'acc');
        log(tile, target, t('type.delegation'), text);
        awaited++;
        const reply = (async () => {
          await travel(token, link);
          const answer = await activate(token, target, { from: tile, text }, [...chain, tile.id]);
          await travel(token, link, true);
          log(target, tile, t('log.reply'), answer);
          addLine(tile, `✓ ${esc(t('s.gotReply', { name: target.name }))}`, 'ok');
          awaited--;
        })();
        reply.catch(() => {});
        return reply;
      }).filter(Boolean);

      // Terminal relié : toujours une demande de permission.
      let terminalOk = terminals.length > 0;
      for (const link of terminals) {
        const target = tiles.get(link.to);
        await pause(token, 500);
        addLine(tile, '↳ run_in_terminal("npm run dev")', 'acc');
        setStatus(tile, 'waiting');
        setHint('board.waiting', { name: esc(tile.name) }, true);
        const allowed = await askPermission(app, { logo: def.logo, name: tile.name, tool: 'run_in_terminal', detail: `${target.name}: npm run dev` });
        if (allowed === null || token !== run) throw CANCEL;
        setStatus(tile, 'working');
        setHint('board.running');
        if (!allowed) {
          terminalOk = false;
          addLine(tile, esc(t('s.refusedPerm')), 'warn');
          refuse(link, tile, target, 'perm');
          continue;
        }
        log(tile, target, t('type.terminal'), 'npm run dev');
        await travel(token, link);
        setStatus(target, 'working');
        if (target.term.lastChild?.querySelector('.caret')) target.term.lastChild.remove();
        addLine(target, 'PS ~/acme/landing-page&gt; npm run dev');
        await pause(token, 700);
        addLine(target, `<span class="ok">VITE v6.4.5</span> ${esc(t('s.ready'))}`);
        addLine(target, '➜ Local: <span class="acc">http://localhost:5173/</span>');
        setStatus(target, 'done', false);
        await travel(token, link, true);
      }

      if (replies.length) {
        if (awaited) addLine(tile, '↳ wait_for_replies()', 'acc');
        await Promise.all(replies);
      }
      await pause(token, 600);
      const final = t(terminals.length && !terminalOk && script.finalNo ? script.finalNo : script.final);
      addLine(tile, `● ${esc(final)}`);
      setStatus(tile, 'done');
      bubble(tile);

      // Transmission : la réponse finale part vers la cible, sans attendre de retour.
      for (const link of outgoing.filter((l) => l.type === 'relay')) {
        const target = tiles.get(link.to);
        if (link.count >= link.limit) { refuse(link, tile, target, 'limit'); continue; }
        link.count++;
        renderPill(link);
        const text = t('s.relay', { response: final });
        log(tile, target, t('type.relay'), text);
        const relay = (async () => {
          await travel(token, link);
          await activate(token, target, { from: tile, text }, []);
        })();
        relay.catch(() => {});
        background.push(relay);
      }
      return final;
    }

    function pickRoot() {
      const able = [...tiles.values()].filter((tile) => AGENTS[tile.agent].hooks && links.some((l) => l.from === tile.id));
      if (selected && able.includes(selected)) return selected;
      return able.find((tile) => !links.some((l) => l.to === tile.id)) ?? able[0];
    }
    async function start() {
      if (running) return;
      const root = pickRoot();
      if (!root) return flash('board.nothing');
      setTool('select');
      closeMenu();
      const token = ++run;
      running = true;
      runButton.disabled = true;
      background = [];
      links.forEach((link) => { link.count = 0; link.refused = false; renderPill(link); });
      tiles.forEach((tile) => setStatus(tile, 'idle'));
      setHint('board.running');
      try {
        await activate(token, root, null, []);
        while (background.length) await background.shift();
        setHint('board.done');
      } catch (error) {
        if (error !== CANCEL) throw error;
      } finally {
        if (token === run) { running = false; runButton.disabled = false; }
      }
    }

    // --- Tableau de départ : le même que la capture du README ---
    function preset() {
      const W = map.clientWidth;
      const H = map.clientHeight;
      if (narrow()) {
        const w = Math.min(236, W - 66);
        const h = 128;
        const gap = (H - 24 - 4 * h) / 3;
        const at = (i) => ({ x: i % 2 ? W - w - 8 : 8, y: 12 + i * (h + gap), w, h });
        return { lead: at(0), server: at(1), frontend: at(2), reviewer: at(3) };
      }
      const w = clamp((W - 200) / 2, 230, 330);
      const h = 208;
      const x1 = 66;
      const x2 = W - w - 26;
      const y2 = H - h - 26;
      return { lead: { x: x1, y: 26, w, h }, server: { x: x2, y: 26, w, h }, frontend: { x: x1, y: y2, w, h }, reviewer: { x: x2, y: y2, w, h } };
    }
    function reset() {
      run++;
      app.pendingAsk?.();
      running = false;
      runButton.disabled = false;
      dirty = false;
      closeMenu();
      [...links].forEach(removeLink);
      tiles.forEach((tile) => tile.el.remove());
      tiles.clear();
      logList.replaceChildren();
      selected = null;
      seq = 0;
      const p = preset();
      const lead = addTile({ agent: 'claude', name: 'Lead', role: 'lead', ...p.lead });
      const server = addTile({ agent: 'shell', name: 'Dev server', role: 'server', ...p.server });
      const frontend = addTile({ agent: 'codex', name: 'Frontend', role: 'frontend', ...p.frontend });
      const reviewer = addTile({ agent: 'claude', name: 'Reviewer', role: 'reviewer', ...p.reviewer });
      addLink(lead, frontend, 'delegation');
      addLink(lead, server, 'terminal');
      addLink(frontend, reviewer, 'relay');
      layout();
      setTool('select');
      setHint('board.idle');
    }

    // --- Dock : glisser un agent sur la map (ou simple clic) ---
    function newTileSize() {
      return narrow() ? { w: 200, h: 112 } : { w: 250, h: 150 };
    }
    function dropAgent(agent, point) {
      if (running) return flash('board.running');
      if (tiles.size >= 7) return flash('board.full');
      const size = newTileSize();
      const count = [...tiles.values()].filter((tile) => tile.agent === agent).length;
      const name = count || agent !== 'gemini' ? `${AGENTS[agent].name} ${count + 1}` : AGENTS[agent].name;
      const spot = point ?? { x: map.clientWidth / 2 + (tiles.size % 3 - 1) * 34, y: map.clientHeight / 2 + (tiles.size % 3 - 1) * 26 };
      dirty = true;
      select(addTile({ agent, name, x: spot.x - size.w / 2, y: spot.y - 16, ...size, pop: true }));
    }
    app.querySelectorAll('[data-agent]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        const origin = { x: event.clientX, y: event.clientY };
        let ghost = null;
        const move = (e) => {
          if (!ghost && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 5) return;
          if (!ghost) {
            const size = newTileSize();
            ghost = document.createElement('div');
            ghost.className = 'ghost';
            Object.assign(ghost.style, { width: `${size.w}px`, height: `${size.h}px` });
            document.body.append(ghost);
          }
          ghost.style.left = `${e.clientX}px`;
          ghost.style.top = `${e.clientY}px`;
        };
        const up = (e) => {
          button.removeEventListener('pointermove', move);
          button.removeEventListener('pointerup', up);
          button.removeEventListener('pointercancel', up);
          if (!ghost) return e.type === 'pointerup' ? dropAgent(button.dataset.agent) : undefined;
          ghost.remove();
          const r = map.getBoundingClientRect();
          const inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
          if (inside && e.type === 'pointerup') dropAgent(button.dataset.agent, { x: e.clientX - r.left, y: e.clientY - r.top });
        };
        button.addEventListener('pointermove', move);
        button.addEventListener('pointerup', up);
        button.addEventListener('pointercancel', up);
      });
    });

    runButton.addEventListener('click', start);
    document.getElementById('board-reset').addEventListener('click', reset);
    document.addEventListener('langchange', () => { links.forEach(renderPill); renderHint(); });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!dirty && !running) return reset();
        tiles.forEach(placeTile);
        layout();
      }, 150);
    });

    reset();
    // Premier passage à l'écran : le scénario démarre tout seul, une fois.
    if (!reduced && 'IntersectionObserver' in window) {
      const seen = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        seen.disconnect();
        setTimeout(() => { if (!dirty && !running && tool === 'select') start(); }, 1100);
      }, { threshold: 0.55 });
      seen.observe(map);
    }
  }

  // =====================================================================================
  // Démo du notch : un agent demande trois permissions à la suite
  // =====================================================================================
  const demo = document.getElementById('notch-demo');
  if (demo) {
    const el = demo.querySelector('[data-tile]');
    const tile = { el, term: demo.querySelector('[data-term]'), dot: demo.querySelector('[data-status]'), name: 'Frontend' };
    const replay = demo.querySelector('[data-replay]');
    const STEPS = [
      { say: 'd.1', tool: 'Bash', detail: 'npm install stripe', out: 'd.out1' },
      { say: 'd.2', tool: 'Edit', detail: 'src/pricing.html', out: 'd.out2' },
      { say: 'd.3', tool: 'Bash', detail: 'git push origin main', out: 'd.out3' },
    ];
    let turn = 0;
    async function play() {
      const token = ++turn;
      const pause = async (ms) => {
        await wait(reduced ? Math.min(ms, 250) : ms);
        if (token !== turn) throw CANCEL;
      };
      replay.hidden = true;
      demo.pendingAsk?.();
      tile.term.replaceChildren();
      addLine(tile, '&gt;_ OpenAI Codex', 'dim');
      try {
        for (const step of STEPS) {
          setStatus(tile, 'working');
          await pause(900);
          addLine(tile, `● ${esc(t(step.say))}`);
          await pause(1000);
          addLine(tile, `? ${step.tool}: ${esc(step.detail)}`, 'warn');
          setStatus(tile, 'waiting');
          const allowed = await askPermission(demo, { logo: 'assets/agents/codex.svg', name: tile.name, tool: step.tool, detail: step.detail });
          if (allowed === null || token !== turn) throw CANCEL;
          setStatus(tile, 'working');
          addLine(tile, allowed ? `✓ ${esc(t('d.yes'))}` : `✗ ${esc(t('d.no'))}`, allowed ? 'ok' : 'bad');
          if (allowed) { await pause(600); addLine(tile, esc(t(step.out)), 'dim'); }
        }
        await pause(800);
        addLine(tile, `● ${esc(t('d.end'))}`);
        setStatus(tile, 'done');
        replay.hidden = false;
      } catch (error) {
        if (error !== CANCEL) throw error;
      }
    }
    replay.addEventListener('click', play);
    if ('IntersectionObserver' in window) {
      const seen = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        seen.disconnect();
        play();
      }, { threshold: 0.5 });
      seen.observe(demo);
    } else play();
  }
})();
