// Orchestra — site : langue, animations, vidéos, dernière version sur GitHub. Aucun serveur.
(() => {
  const REPO = 'Adoraay/Orchestra-Board';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- Langue (anglais par défaut, choix gardé dans le navigateur) ---
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  function applyLang(lang) {
    const dict = window.I18N[lang] ?? window.I18N.en;
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => { if (dict[el.dataset.i18n]) el.textContent = dict[el.dataset.i18n]; });
    $$('[data-i18n-html]').forEach((el) => { if (dict[el.dataset.i18nHtml]) el.innerHTML = dict[el.dataset.i18nHtml]; });
    store.set('orchestra-lang', lang);
  }
  applyLang(store.get('orchestra-lang') === 'fr' ? 'fr' : 'en');
  $('#lang').addEventListener('click', () => applyLang(document.documentElement.lang === 'fr' ? 'en' : 'fr'));

  // --- Barre du haut opaque après le haut de page ---
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- Apparition au défilement, en cascade entre éléments voisins ---
  $$('.reveal').forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 6) * 80}ms`);
  });
  const revealer = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }),
    { rootMargin: '0px 0px -8% 0px' }
  );
  $$('.reveal').forEach((el) => revealer.observe(el));

  // --- Boucles vidéo : chargées à l'approche, jouées seulement quand elles sont visibles ---
  const player = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        if (!reduced) v.play().catch(() => {});
      } else {
        v.pause();
      }
    }),
    { rootMargin: '200px 0px', threshold: 0.15 }
  );
  $$('video[data-src]').forEach((v) => player.observe(v));

  // --- Halo qui suit la souris sur les cartes ---
  $$('.card').forEach((card) => card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));

  // --- L'orchestre : chaque agent assis sur un rang en demi-cercle autour du maestro ---
  // Coordonnées dans une scène de 1000 × 680, maestro en (500, 570) ; r = rang, a = angle en degrés.
  const W = 1000;
  const H = 680;
  const CX = 500;
  const CY = 570;
  const RANKS = [165, 320, 470];
  const SEATS = [
    { name: 'Claude Code', logo: 'claude-code.svg', r: 0, a: 144, hooks: true },
    { name: 'Codex', logo: 'codex.svg', r: 0, a: 36, hooks: true },
    { name: 'Antigravity', logo: 'antigravity.svg', r: 1, a: 166 },
    { name: 'Aider', logo: 'aider.png', r: 1, a: 127 },
    { name: 'Qwen Code', logo: 'qwen.svg', r: 1, a: 90 },
    { name: 'OpenCode', logo: 'opencode.svg', r: 1, a: 53 },
    { name: 'Copilot CLI', logo: 'copilot.svg', r: 1, a: 14 },
    { name: 'Cursor CLI', logo: 'cursor.svg', r: 2, a: 170 },
    { name: 'Goose', logo: 'goose.svg', r: 2, a: 140 },
    { name: 'Amp', logo: 'amp.svg', r: 2, a: 108 },
    { name: 'Kimi CLI', logo: 'kimi.svg', r: 2, a: 72 },
    { name: 'Hermes', logo: 'hermes.svg', r: 2, a: 40 },
    { name: 'Terminal', logo: 'shell.svg', r: 2, a: 10 },
  ];
  const orchestra = $('#orchestra');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'orch-svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const r of [...RANKS, 610]) {
    const arc = document.createElementNS(svgNS, 'path');
    arc.setAttribute('class', 'orch-arc');
    arc.setAttribute('d', `M ${CX - r} ${CY + 40} L ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY} L ${CX + r} ${CY + 40}`);
    svg.appendChild(arc);
  }
  orchestra.prepend(svg);
  const seats = SEATS.map((s, i) => {
    const rad = (s.a * Math.PI) / 180;
    const x = CX + RANKS[s.r] * Math.cos(rad);
    const y = CY - RANKS[s.r] * Math.sin(rad);
    const delay = `${200 + s.r * 260 + i * 40}ms`;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', `orch-line ${s.hooks ? 'hooks' : ''}`);
    line.setAttribute('x1', CX);
    line.setAttribute('y1', CY);
    line.setAttribute('x2', x);
    line.setAttribute('y2', y);
    line.setAttribute('pathLength', '1');
    line.style.setProperty('--d', delay);
    svg.appendChild(line);
    const el = document.createElement('div');
    el.className = `seat ${s.hooks ? 'hooks' : ''}`;
    el.setAttribute('role', 'listitem');
    el.style.setProperty('--x', `${(x / W) * 100}%`);
    el.style.setProperty('--y', `${(y / H) * 100}%`);
    el.style.setProperty('--d', delay);
    el.innerHTML = `<div class="seat-box"><img src="assets/agents/${s.logo}" alt="" /></div><span class="seat-name">${s.name}</span>`;
    el.addEventListener('pointerenter', () => line.classList.add('hot'));
    el.addEventListener('pointerleave', () => line.classList.remove('hot'));
    orchestra.appendChild(el);
    return { el, line, x, y, hooks: s.hooks };
  });

  // Le maestro donne le départ : une impulsion part vers un agent au hasard, qui s'allume à son arrivée.
  if (!reduced) {
    const dot = document.createElement('span');
    dot.className = 'orch-pulse';
    orchestra.appendChild(dot);
    let onStage = false;
    new IntersectionObserver(([e]) => (onStage = e.isIntersecting)).observe(orchestra);
    let last = -1;
    const cue = () => {
      if (!onStage || !orchestra.classList.contains('in') || getComputedStyle(svg).display === 'none') return wait(600).then(cue);
      // Claude Code et Codex reviennent plus souvent : ce sont eux qui se parlent par les liens.
      let i;
      do i = Math.random() < 0.35 ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * seats.length);
      while (i === last);
      last = i;
      const s = seats[i];
      const start = performance.now();
      const ms = 650;
      s.line.classList.add('hot');
      dot.style.opacity = 1;
      const frame = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        dot.style.left = `${((CX + (s.x - CX) * e) / W) * 100}%`;
        dot.style.top = `${((CY + (s.y - CY) * e) / H) * 100}%`;
        if (t < 1) return requestAnimationFrame(frame);
        dot.style.opacity = 0;
        s.el.classList.add('cue');
        setTimeout(() => { s.el.classList.remove('cue'); s.line.classList.remove('hot'); }, 700);
        wait(500).then(cue);
      };
      requestAnimationFrame(frame);
    };
    cue();
  }

  // --- Onglets des liens : chaque vidéo passe à la suivante, jusqu'à un clic ---
  const tabs = $$('#link-tabs [data-tab]');
  const linkVideo = $('#link-video');
  let auto = true;
  linkVideo.loop = false;
  function showTab(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
    linkVideo.classList.add('switching');
    setTimeout(() => {
      linkVideo.poster = `assets/clips/${name}.jpg`;
      linkVideo.src = `assets/clips/${name}.mp4`;
      linkVideo.dataset.src = linkVideo.src;
      linkVideo.play().catch(() => {});
      linkVideo.classList.remove('switching');
    }, 200);
  }
  tabs.forEach((t) => t.addEventListener('click', () => { auto = false; linkVideo.loop = true; showTab(t.dataset.tab); }));
  linkVideo.addEventListener('ended', () => {
    if (!auto) return;
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    showTab(tabs[(i + 1) % tabs.length].dataset.tab);
  });

  // --- Vidéo de présentation ---
  const promo = $('#promo');
  const play = $('#play');
  play.addEventListener('click', () => {
    play.classList.add('hidden');
    promo.play();
  });
  promo.addEventListener('play', () => play.classList.add('hidden'));

  // --- Dernière version publiée : lien direct vers l'installateur, numéro de version, étoiles ---
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    .then((r) => (r.ok ? r.json() : null))
    .then((release) => {
      if (!release) return;
      const exe = release.assets?.find((a) => /\.exe$/i.test(a.name));
      if (exe) $$('.download-link').forEach((a) => (a.href = exe.browser_download_url));
      if (release.tag_name) $$('.version').forEach((el) => (el.textContent = release.tag_name.replace(/^v?/, 'v')));
    })
    .catch(() => {});
  fetch(`https://api.github.com/repos/${REPO}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((repo) => {
      if (!repo || !repo.stargazers_count) return;
      const stars = $('#stars');
      stars.textContent = `★ ${repo.stargazers_count}`;
      stars.hidden = false;
    })
    .catch(() => {});

  // --- Tableau animé du hero : le Lead délègue à Codex et au Reviewer, qui répondent ---
  const mock = $('#mock');
  const map = $('.mock-map', mock);
  const tile = (id) => $(`#${id}`, mock);
  const term = (id) => $('[data-term]', tile(id));
  const paths = { l1: $('#l1', mock), l2: $('#l2', mock) };

  function addLine(id, html, cls = '') {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.innerHTML = html;
    term(id).appendChild(line);
    return line;
  }
  async function typeLine(id, text, cls = '', speed = 34) {
    const line = addLine(id, '', cls);
    const caret = '<span class="caret"></span>';
    for (let i = 1; i <= text.length; i++) {
      line.innerHTML = `<span class="prompt">${text.slice(0, i)}</span>${caret}`;
      await wait(speed + Math.random() * speed * 0.5);
    }
    line.innerHTML = `<span class="prompt">${text}</span>`;
  }
  function state(id, s) {
    tile(id).classList.remove('working', 'done', 'bubbled');
    if (s) tile(id).classList.add(...s.split(' '));
  }
  // Une impulsion lumineuse parcourt un lien (sens inverse = réponse).
  function pulse(el, path, reverse = false, ms = 1100) {
    return new Promise((resolve) => {
      const len = path.getTotalLength();
      const start = performance.now();
      path.classList.add('hot');
      el.style.opacity = 1;
      const frame = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const p = path.getPointAtLength(len * (reverse ? 1 - eased : eased));
        el.style.left = `${(p.x / 1000) * 100}%`;
        el.style.top = `${(p.y / 560) * 100}%`;
        if (t < 1) requestAnimationFrame(frame);
        else { el.style.opacity = 0; path.classList.remove('hot'); resolve(); }
      };
      requestAnimationFrame(frame);
    });
  }

  async function scene() {
    ['t-lead', 't-codex', 't-review'].forEach((id) => { term(id).innerHTML = ''; state(id, ''); });
    addLine('t-lead', '<span class="muted">Claude Code · Sonnet</span>');
    addLine('t-codex', '<span class="muted">&gt;_ OpenAI Codex</span>');
    addLine('t-review', '<span class="muted">Claude Code · Sonnet</span>');
    await wait(900);
    await typeLine('t-lead', 'Fix the °F bug, then get it reviewed.');
    state('t-lead', 'working');
    await wait(600);
    addLine('t-lead', '<span class="acc">●</span> orchestra · send_to_agent(<b>Codex</b>)');
    await pulse($('#p1'), paths.l1);
    state('t-codex', 'working');
    addLine('t-codex', '<span class="muted">› Message from "Lead" (via Orchestra)</span>');
    addLine('t-codex', 'Fix celsiusToFahrenheit in src/units.js');
    addLine('t-lead', '<span class="acc">●</span> orchestra · send_to_agent(<b>Reviewer</b>)');
    await pulse($('#p2'), paths.l2);
    state('t-review', 'working');
    addLine('t-review', '<span class="muted">› Message from "Lead" (via Orchestra)</span>');
    addLine('t-review', 'Review the °F fix once Codex is done');
    addLine('t-lead', '<span class="muted">✻ Waiting for replies…</span>');
    await wait(900);
    addLine('t-codex', '• Edited src/units.js <span class="ok">+1</span> <span class="acc">−1</span>');
    await wait(500);
    addLine('t-codex', '<span class="acc">- return celsius * 9 / 5 + 23;</span>');
    addLine('t-codex', '<span class="ok">+ return celsius * 9 / 5 + 32;</span>');
    await wait(700);
    addLine('t-codex', '• Ran npm test · <span class="ok">2 passed</span>');
    addLine('t-review', '• Read src/units.js');
    await wait(500);
    state('t-codex', 'done bubbled');
    await pulse($('#p3'), paths.l1, true, 900);
    addLine('t-lead', '<span class="ok">↩</span> Codex: fixed, tests pass');
    await wait(700);
    addLine('t-review', '• 0°C → 32°F, 100°C → 212°F');
    await wait(500);
    addLine('t-review', '• Verdict: <span class="ok">SHIP</span>');
    state('t-review', 'done bubbled');
    await pulse($('#p4'), paths.l2, true, 900);
    addLine('t-lead', '<span class="ok">↩</span> Reviewer: SHIP');
    await wait(600);
    addLine('t-lead', '<span class="ok">✻ Done.</span> Bug fixed and reviewed.');
    state('t-lead', 'done bubbled');
    state('t-codex', 'done');
    state('t-review', 'done');
    await wait(3600);
  }

  if (reduced) {
    addLine('t-lead', '<span class="prompt">Fix the °F bug, then get it reviewed.</span>');
    addLine('t-lead', '<span class="ok">✻ Done.</span> Bug fixed and reviewed.');
    addLine('t-codex', '<span class="ok">+ return celsius * 9 / 5 + 32;</span>');
    addLine('t-review', '• Verdict: <span class="ok">SHIP</span>');
  } else {
    // L'animation ne tourne que quand le tableau est à l'écran.
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(map);
    (async function loop() {
      for (;;) {
        if (visible) await scene();
        else await wait(500);
      }
    })();
  }
})();
