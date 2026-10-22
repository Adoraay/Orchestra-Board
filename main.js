// Orchestra — site : langue, menu, animations, vidéos, dernière version sur GitHub. Aucun serveur.
(() => {
  const REPO = 'Adoraay/Orchestra-Board';
  const MIN_STARS = 50; // en dessous, le compteur d'étoiles reste caché
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // --- Langue : choix gardé dans le navigateur, sinon celle du navigateur (fr* → français), sinon anglais ---
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  let dict = window.I18N.en;
  const t = (key) => dict[key] ?? window.I18N.en[key] ?? '';
  let onLang = () => {}; // remplacé plus bas par le tableau du haut, en mouvement réduit (lignes fixes à retraduire)
  function applyLang(lang, save) {
    dict = window.I18N[lang] ?? window.I18N.en;
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => { if (dict[el.dataset.i18n]) el.textContent = dict[el.dataset.i18n]; });
    $$('[data-i18n-html]').forEach((el) => { if (dict[el.dataset.i18nHtml]) el.innerHTML = dict[el.dataset.i18nHtml]; });
    $$('[data-i18n-aria]').forEach((el) => { if (dict[el.dataset.i18nAria]) el.setAttribute('aria-label', dict[el.dataset.i18nAria]); });
    $$('[data-i18n-alt]').forEach((el) => { if (dict[el.dataset.i18nAlt]) el.alt = dict[el.dataset.i18nAlt]; });
    document.title = t('meta.title');
    $('meta[name="description"]').setAttribute('content', t('meta.description'));
    renderRelease();
    onLang();
    if (save) store.set('orchestra-lang', lang);
  }
  const saved = store.get('orchestra-lang');
  const browserLang = /^fr/i.test(navigator.language || '') ? 'fr' : 'en';

  // --- Barre du haut opaque après le haut de page ---
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- Menu des petits écrans : bouton + panneau, fermé par Échap, un lien ou le retour en grand écran ---
  const menuBtn = $('#menu-btn');
  const panel = $('#nav-panel');
  function setMenu(open, focusBack = false) {
    menuBtn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    nav.classList.toggle('open', open);
    if (open) $('a', panel).focus();
    else if (focusBack) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => setMenu(panel.hidden));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setMenu(false, true); });
  window.matchMedia('(min-width: 981px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // --- Lueurs cuivre qui suivent la souris : fond à points et cartes (souris seulement, jamais en mouvement réduit) ---
  const mouseFx = !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (mouseFx) {
    const root = document.documentElement.style;
    let frame = 0;
    let x = 0;
    let y = 0;
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.setProperty('--mx', `${x}px`);
        root.setProperty('--my', `${y}px`);
        root.setProperty('--glow', '1');
      });
    }, { passive: true });
    // Souris hors de la fenêtre : la lueur s'estompe.
    const fade = () => root.setProperty('--glow', '0');
    document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) fade(); });
    window.addEventListener('blur', fade);
  }

  if (mouseFx) {
    $$('.card').forEach((card) => card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--cx', `${e.clientX - r.left}px`);
      card.style.setProperty('--cy', `${e.clientY - r.top}px`);
    }));
  }

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

  // Logo : immobile par défaut (#mark-static) ; orbites animées (#mark) pour la barre du haut, la scène des agents et
  // le tableau du haut quand ils sont à l'écran, jamais en mouvement réduit (le CSS n'arrête pas les animations SVG).
  if (!reduced) {
    const marks = new IntersectionObserver((entries) => entries.forEach((e) => {
      $('use', e.target).setAttribute('href', e.isIntersecting ? '#mark' : '#mark-static');
    }));
    $$('[data-live-mark]').forEach((m) => marks.observe(m));
  }

  // --- Agents pris en charge : intégration complète au premier rang, les autres CLI sur les rangs suivants ---
  // Coordonnées dans une scène de 1000 × 680, Orchestra en (500, 570) ; r = rang, a = angle en degrés.
  const W = 1000;
  const H = 680;
  const CX = 500;
  const CY = 570;
  const RANKS = [165, 320, 470];
  const SEATS = [
    { name: 'Claude Code', logo: 'claude-code.svg', r: 0, a: 144, hooks: true },
    { name: 'Codex', logo: 'codex.svg', r: 0, a: 36, hooks: true },
    { name: 'Gemini CLI', logo: 'gemini.svg', r: 1, a: 168 },
    { name: 'Antigravity', logo: 'antigravity.svg', r: 1, a: 136 },
    { name: 'Aider', logo: 'aider.png', r: 1, a: 104 },
    { name: 'Qwen Code', logo: 'qwen.svg', r: 1, a: 76 },
    { name: 'OpenCode', logo: 'opencode.svg', r: 1, a: 44 },
    { name: 'Copilot CLI', logo: 'copilot.svg', r: 1, a: 12 },
    { name: 'Cursor CLI', logo: 'cursor.svg', r: 2, a: 170 },
    { name: 'Goose', logo: 'goose.svg', r: 2, a: 140 },
    { name: 'Amp', logo: 'amp.svg', r: 2, a: 108 },
    { name: 'Kimi CLI', logo: 'kimi.svg', r: 2, a: 72 },
    { name: 'Hermes Agent', logo: 'hermes.svg', r: 2, a: 40 },
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
  // La scène entière est une image (role="img" + aria-label traduit) : les sièges sont décoratifs.
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
    el.style.setProperty('--x', `${(x / W) * 100}%`);
    el.style.setProperty('--y', `${(y / H) * 100}%`);
    el.style.setProperty('--d', delay);
    el.innerHTML = `<div class="seat-box"><img src="assets/agents/${s.logo}" alt="" /></div><span class="seat-name">${s.name}</span>`;
    // Au survol, la ligne s'éclaire en neutre ; le cuivre est réservé à l'impulsion.
    el.addEventListener('pointerenter', () => line.classList.add('lit'));
    el.addEventListener('pointerleave', () => line.classList.remove('lit'));
    orchestra.appendChild(el);
    return { el, line, x, y, hooks: s.hooks };
  });

  // Orchestra donne le départ : une impulsion part vers un agent au hasard, qui s'allume à son arrivée.
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

  // --- Onglets des liens : chaque vidéo passe à la suivante, jusqu'à un clic ; flèches, Début et Fin au clavier ---
  const tabs = $$('#link-tabs [data-tab]');
  const linkVideo = $('#link-video');
  let auto = true;
  linkVideo.loop = false;
  function showTab(name) {
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
    linkVideo.classList.add('switching');
    setTimeout(() => {
      linkVideo.poster = `assets/clips/${name}.jpg`;
      linkVideo.src = `assets/clips/${name}.mp4`;
      linkVideo.dataset.src = linkVideo.src;
      if (!reduced) linkVideo.play().catch(() => {});
      linkVideo.classList.remove('switching');
    }, 200);
  }
  const pick = (tab) => { auto = false; linkVideo.loop = true; showTab(tab.dataset.tab); };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => pick(tab));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      pick(target);
    });
  });
  linkVideo.addEventListener('ended', () => {
    if (!auto) return;
    const i = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    showTab(tabs[(i + 1) % tabs.length].dataset.tab);
  });

  // --- Vidéo de présentation (lancée par un clic : le son est permis) ---
  const promo = $('#promo');
  const play = $('#play');
  play.addEventListener('click', () => {
    play.classList.add('hidden');
    promo.play();
  });
  promo.addEventListener('play', () => play.classList.add('hidden'));

  // --- Système du visiteur : Windows, macOS, ou autre (Linux, téléphone, tablette) ---
  // Le gros bouton télécharge l'installateur de ce système ; la ligne « Aussi disponible pour » donne les autres.
  // Mac : Apple Silicon par défaut (tous les Mac depuis fin 2020) ; Chrome et Edge peuvent dire Intel, Safari non.
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || ua;
  const mobile = navigator.userAgentData?.mobile || /android|iphone|ipad|ipod/i.test(ua) || (/mac/i.test(platform) && navigator.maxTouchPoints > 1);
  const os = mobile ? 'other' : /win/i.test(platform) ? 'windows' : /mac/i.test(platform) ? 'mac' : 'other';
  let macArch = 'arm';
  document.documentElement.dataset.os = os;
  $$('[data-i18n="cta.download"]').forEach((el) => {
    if (os !== 'windows') el.dataset.i18n = `cta.download.${os}`;
  });
  if (os === 'mac') $('[data-i18n="hero.unsigned"]').dataset.i18n = 'hero.unsigned.mac';
  if (os === 'other') $('#os-note').hidden = false;
  navigator.userAgentData?.getHighEntropyValues?.(['architecture'])
    .then(({ architecture }) => {
      if (os !== 'mac' || architecture !== 'x86') return;
      macArch = 'x86';
      renderRelease();
    })
    .catch(() => {});

  // --- Dernière version publiée : lien direct vers l'installateur, version, taille, date, empreinte ---
  // Fichiers de la release : .exe (Windows), .dmg arm64 (Apple Silicon), autre .dmg (Intel).
  let release = null;
  const ASSETS = ['win', 'macArm', 'macIntel'];
  const primaryKey = () => (os === 'windows' ? 'win' : os === 'mac' ? (macArch === 'x86' ? 'macIntel' : 'macArm') : null);

  function renderAlso(primary) {
    const order = os === 'mac' ? ['macArm', 'macIntel', 'win'] : ASSETS; // sur Mac, l'autre Mac d'abord
    const others = order.filter((key) => key !== primary && release.assets[key]);
    $$('[data-also]').forEach((line) => {
      line.hidden = !others.length;
      line.textContent = `${t(primary ? 'also.prefix' : 'also.all')} `;
      others.forEach((key, i) => {
        if (i) line.append(' · ');
        const link = document.createElement('a');
        link.href = release.assets[key].browser_download_url;
        link.textContent = t(`also.${key}`);
        line.append(link);
      });
    });
  }

  function renderRelease() {
    const info = $('#dl-info');
    if (!release || !info) return;
    const key = primaryKey();
    const file = key ? release.assets[key] : null;
    $$('.download-link').forEach((a) => (a.href = file?.browser_download_url ?? release.page));
    renderAlso(file ? key : null);

    const parts = [];
    if (file?.size) parts.push(`${Math.round(file.size / 1e6)} ${t('dl.mb')}`); // espace insécable entre nombre et unité
    if (release.date) parts.push(`${t('dl.released')} ${new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium' }).format(release.date)}`);
    info.textContent = parts.map((p) => ` · ${p}`).join('');
    // digest = « sha256:… » quand GitHub l'a calculé
    const sha = /^sha256:[0-9a-f]{64}$/i.test(file?.digest ?? '') ? file.digest.slice(7) : '';
    $('#verify').hidden = !sha;
    if (sha) {
      $('#sha').textContent = sha;
      const hint = $('#verify-hint');
      hint.innerHTML = t(os === 'mac' ? 'dl.verifyHint.mac' : 'dl.verifyHint').replace('{file}', '<span></span>');
      $('span', hint).textContent = file.name;
    }
  }
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      const list = data.assets ?? [];
      const dmgs = list.filter((a) => /\.dmg$/i.test(a.name));
      release = {
        assets: {
          win: list.find((a) => /\.exe$/i.test(a.name)),
          macArm: dmgs.find((a) => /arm64/i.test(a.name)),
          macIntel: dmgs.find((a) => !/arm64/i.test(a.name)),
        },
        page: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
        date: data.published_at ? new Date(data.published_at) : null,
      };
      if (data.tag_name) $$('.version').forEach((el) => (el.textContent = data.tag_name.replace(/^v?/, 'v')));
      if (data.html_url) $('.eyebrow').href = data.html_url;
      renderRelease();
    })
    .catch(() => {});
  fetch(`https://api.github.com/repos/${REPO}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((repo) => {
      if (!repo || !(repo.stargazers_count >= MIN_STARS)) return;
      const stars = $('#stars');
      stars.textContent = `★ ${repo.stargazers_count}`;
      stars.hidden = false;
    })
    .catch(() => {});

  // Langue appliquée maintenant que tout ce qu'elle met à jour existe.
  applyLang(saved === 'fr' || saved === 'en' ? saved : browserLang, false);
  $('#lang').addEventListener('click', () => applyLang(document.documentElement.lang === 'fr' ? 'en' : 'fr', true));

  // --- Tableau animé du hero : le Lead délègue à Codex et au Reviewer, qui répondent ---
  const mock = $('#mock');
  const map = $('.mock-map', mock);
  const tile = (id) => $(`#${id}`, mock);
  const term = (id) => $('[data-term]', tile(id));
  const paths = { l1: $('#l1', mock), l2: $('#l2', mock) };
  let visible = true;
  // Attente qui se prolonge tant que le tableau est hors de l'écran : une scène commencée s'y met en pause.
  const pause = async (ms) => {
    await wait(ms);
    while (!visible) await wait(300);
  };

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
      await pause(speed + Math.random() * speed * 0.5);
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

  // Textes lus à chaque scène dans la langue en cours ; les sorties des CLI restent en anglais, comme dans l'app.
  async function scene() {
    ['t-lead', 't-codex', 't-review'].forEach((id) => { term(id).innerHTML = ''; state(id, ''); });
    addLine('t-lead', '<span class="muted">Claude Code · Sonnet</span>');
    addLine('t-codex', '<span class="muted">&gt;_ OpenAI Codex</span>');
    addLine('t-review', '<span class="muted">Claude Code · Sonnet</span>');
    await pause(900);
    await typeLine('t-lead', t('mock.prompt'));
    state('t-lead', 'working');
    await pause(600);
    addLine('t-lead', '<span class="acc">●</span> orchestra · send_to_agent(<b>Codex</b>)');
    await pulse($('#p1'), paths.l1);
    state('t-codex', 'working');
    addLine('t-codex', `<span class="muted">› ${t('mock.from')}</span>`);
    addLine('t-codex', t('mock.toCodex'));
    addLine('t-lead', '<span class="acc">●</span> orchestra · send_to_agent(<b>Reviewer</b>)');
    await pulse($('#p2'), paths.l2);
    state('t-review', 'working');
    addLine('t-review', `<span class="muted">› ${t('mock.from')}</span>`);
    addLine('t-review', t('mock.toReview'));
    addLine('t-lead', `<span class="muted">✻ ${t('mock.waiting')}</span>`);
    await pause(900);
    addLine('t-codex', '• Edited src/units.js <span class="ok">+1</span> <span class="del">−1</span>');
    await pause(500);
    addLine('t-codex', '<span class="del">- return celsius * 9 / 5 + 23;</span>');
    addLine('t-codex', '<span class="ok">+ return celsius * 9 / 5 + 32;</span>');
    await pause(700);
    addLine('t-codex', '• Ran npm test · <span class="ok">2 passed</span>');
    addLine('t-review', '• Read src/units.js');
    await pause(500);
    state('t-codex', 'done bubbled');
    await pulse($('#p3'), paths.l1, true, 900);
    addLine('t-lead', `<span class="ok">↩</span> ${t('mock.codexReply')}`);
    await pause(700);
    addLine('t-review', '• 0°C → 32°F, 100°C → 212°F');
    await pause(500);
    addLine('t-review', '• Verdict: <span class="ok">SHIP</span>');
    state('t-review', 'done bubbled');
    await pulse($('#p4'), paths.l2, true, 900);
    addLine('t-lead', `<span class="ok">↩</span> ${t('mock.reviewReply')}`);
    await pause(600);
    addLine('t-lead', `<span class="ok">✻ ${t('mock.done')}</span> ${t('mock.doneText')}`);
    state('t-lead', 'done bubbled');
    state('t-codex', 'done');
    state('t-review', 'done');
    await pause(3600);
  }

  if (reduced) {
    // Tableau fixe, refait à chaque changement de langue.
    onLang = () => {
      ['t-lead', 't-codex', 't-review'].forEach((id) => (term(id).innerHTML = ''));
      addLine('t-lead', `<span class="prompt">${t('mock.prompt')}</span>`);
      addLine('t-lead', `<span class="ok">✻ ${t('mock.done')}</span> ${t('mock.doneText')}`);
      addLine('t-codex', '<span class="ok">+ return celsius * 9 / 5 + 32;</span>');
      addLine('t-review', '• Verdict: <span class="ok">SHIP</span>');
    };
    onLang();
  } else {
    // L'animation ne tourne que quand le tableau est à l'écran (il est masqué sous 1100px) ; hors écran, ses boucles
    // CSS (liens en pointillés, curseur, statuts) s'arrêtent aussi.
    mock.classList.add('paused');
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      mock.classList.toggle('paused', !visible);
    }).observe(map);
    (async function loop() {
      for (;;) {
        if (visible && mock.offsetParent) await scene();
        else await wait(500);
      }
    })();
  }
})();
