# orchestra-site

Site de présentation d'Orchestra. Statique (HTML, CSS, JS), sans build ni dépendance.

## Voir le site

```sh
python -m http.server 4173
```

Puis ouvrir http://127.0.0.1:4173/. Ouvrir `index.html` directement marche aussi, sauf les vidéos selon le navigateur.

## Fichiers

- `index.html` : structure et textes anglais.
- `styles.css` : couleurs du thème Standard de l'app (`src/theme.css`), polices Archivo et JetBrains Mono.
- `i18n.js` : textes français, et textes anglais créés par le JavaScript. Langue du navigateur par défaut, choix EN/FR gardé.
- `board.js` : le mini-tableau jouable du héro (cases déplaçables, dock, outil Lien, scénario, journal) et la démo du notch de permission. Tout est scénarisé.
- `main.js` : menu, langue, clips lus seulement à l'écran, types de liens, dernière release lue sur l'API GitHub (`.exe`, `.dmg` avec `arm64`, autre `.dmg`).
- `assets/` : `clips/` et `video/` (tournage de la 0.1.0), `shots/` (captures de `docs/images` de l'app), `agents/`, `brand/`, `sounds/done.wav`.

## Publier

Cette branche `gh-pages` est le site publié : un commit puis un push suffisent. `sitemap.xml` et `tools/make-media.cjs` (fabrication des clips) viennent de l'ancien site.
