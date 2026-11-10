// Orchestra — site : langue, menu, vidéos, types de liens, dernière version sur GitHub. Aucun serveur.
(() => {
  const REPO = 'Adoraay/Orchestra-Board';
  const MIN_STARS = 5;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const { t, setLang } = window.i18n;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // --- Barre du haut ---
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('stuck', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const burger = $('#burger');
  const navLinks = $('#nav-links');
  const toggleMenu = (open) => {
    navLinks.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
  };
  burger.addEventListener('click', () => toggleMenu(!navLinks.classList.contains('open')));
  navLinks.addEventListener('click', (event) => { if (event.target.closest('a')) toggleMenu(false); });

  // --- Système du visiteur : choisit le bouton de téléchargement ---
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/i.test(ua));
  const os = mobile ? 'other' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'mac' : 'other';
  let macArch = 'arm';
  root.dataset.os = os;
  $$('[data-dl-label]').forEach((label) => (label.dataset.i18n = os === 'windows' ? 'cta.win' : os === 'mac' ? 'cta.mac' : 'cta.other'));
  const primaryKey = () => (os === 'windows' ? 'win' : os === 'mac' ? (macArch === 'x86' ? 'macIntel' : 'macArm') : null);

  // --- Dernière release : liens directs, version, taille, date, empreintes ---
  // Fichiers attendus : .exe (Windows), .dmg avec « arm64 » (Apple Silicon), autre .dmg (Intel).
  let release = null;
  function renderRelease() {
    const key = primaryKey();
    $$('[data-asset]').forEach((row) => row.classList.toggle('me', row.dataset.asset === key));
    if (!release) return;
    const file = key ? release.assets[key] : null;
    $$('.dl-primary').forEach((a) => (a.href = file?.browser_download_url ?? release.page));
    const parts = [];
    if (file?.size) parts.push(`${Math.round(file.size / 1e6)} ${t('dl.mb')}`);
    if (release.date) parts.push(`${t('dl.released')} ${new Intl.DateTimeFormat(root.lang, { dateStyle: 'medium' }).format(release.date)}`);
    $('#dl-info').textContent = parts.length ? ` ${parts.join(', ')}.` : '';
    const hashes = $('#sha-list');
    hashes.replaceChildren();
    $$('[data-asset]').forEach((row) => {
      const asset = release.assets[row.dataset.asset];
      if (!asset) return;
      row.href = asset.browser_download_url;
      $('em', row).textContent = `${Math.round(asset.size / 1e6)} ${t('dl.mb')}`;
      // digest = « sha256:… » quand GitHub l'a calculé
      if (!/^sha256:[0-9a-f]{64}$/i.test(asset.digest ?? '')) return;
      const item = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = asset.name;
      item.append(name, asset.digest.slice(7));
      hashes.append(item);
    });
    $('#sha').hidden = !hashes.children.length;
  }
  navigator.userAgentData?.getHighEntropyValues?.(['architecture'])
    .then(({ architecture }) => {
      if (os !== 'mac' || architecture !== 'x86') return;
      macArch = 'x86';
      renderRelease();
    })
    .catch(() => {});
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
      if (data.tag_name) $$('.version').forEach((el) => (el.textContent = data.tag_name.replace(/^v?\.?/, 'v')));
      if (data.html_url) $('#release').href = data.html_url;
      renderRelease();
    })
    .catch(() => {});
  fetch(`https://api.github.com/repos/${REPO}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((repo) => {
      if (!(repo?.stargazers_count >= MIN_STARS)) return;
      const stars = $('#stars');
      stars.textContent = `★ ${repo.stargazers_count}`;
      stars.hidden = false;
    })
    .catch(() => {});

  // --- Langue : choix gardé, sinon celle du navigateur ---
  let saved = null;
  try { saved = localStorage.getItem('orchestra-lang'); } catch {}
  document.addEventListener('langchange', () => {
    $('#lang').setAttribute('aria-label', t('lang.switch'));
    renderRelease();
  });
  setLang(saved ?? (/^fr/i.test(navigator.language) ? 'fr' : 'en'), false);
  $('#lang').addEventListener('click', () => setLang(root.lang === 'fr' ? 'en' : 'fr', true));

  // --- Clips : chargés et lus seulement à l'écran ---
  const clips = $$('video[data-src]');
  const visible = (video) => !video.closest('[hidden]');
  if (reduced || !('IntersectionObserver' in window)) {
    clips.forEach((video) => { video.src = video.dataset.src; video.preload = 'none'; video.controls = true; });
  } else {
    const watcher = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        target.dataset.inView = isIntersecting ? '1' : '';
        if (isIntersecting && visible(target)) {
          if (!target.src) target.src = target.dataset.src;
          target.play().catch(() => {});
        } else target.pause();
      }
    }, { threshold: 0.35 });
    clips.forEach((video) => watcher.observe(video));
    document.addEventListener('visibilitychange', () => {
      clips.forEach((video) => { if (document.hidden) video.pause(); else if (video.dataset.inView && visible(video)) video.play().catch(() => {}); });
    });
  }

  // --- Types de liens ---
  const items = $$('.lk-item');
  function showLink(name, focus) {
    items.forEach((item) => {
      const on = item.dataset.lk === name;
      item.classList.toggle('on', on);
      item.setAttribute('aria-selected', on);
      item.tabIndex = on ? 0 : -1;
      if (on && focus) item.focus();
    });
    $$('.lk-pane').forEach((pane) => {
      const on = pane.dataset.pane === name;
      pane.hidden = !on;
      pane.classList.toggle('on', on);
      const video = $('video', pane);
      if (!video || reduced) return;
      if (on) { if (!video.src) video.src = video.dataset.src; video.currentTime = 0; video.play().catch(() => {}); } else video.pause();
    });
  }
  items.forEach((item, index) => {
    item.addEventListener('click', () => showLink(item.dataset.lk));
    item.addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      showLink(items[(index + step + items.length) % items.length].dataset.lk, true);
    });
  });

  // --- Vidéo de présentation ---
  const promo = $('#promo');
  $('#play').addEventListener('click', () => promo.play());
  promo.addEventListener('play', () => promo.closest('.video').classList.add('playing'));

  // --- Son de fin de tâche (le même que dans l'app) ---
  let chime = null;
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.sound')) return;
    chime ??= new Audio('assets/sounds/done.wav');
    chime.currentTime = 0;
    chime.play().catch(() => {});
  });
})();
