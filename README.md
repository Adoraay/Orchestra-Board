# orchestra-site

Site de présentation d'Orchestra : statique (HTML, CSS, JS), sans build, sans dépendance, sans back-end.
Anglais par défaut, bouton FR (choix gardé dans le navigateur).

## Voir le site

Ouvrir `index.html` dans un navigateur suffit. Pour un rendu identique à la mise en ligne, servir le dossier,
par exemple : `npx serve .` puis http://localhost:3000.

## Mettre en ligne (GitHub Pages)

1. Créer un dépôt (par exemple `OrchestraBoard`) et y pousser le contenu de ce dossier.
2. Settings › Pages › Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. Le site est publié sur `https://<compte>.github.io/<dépôt>/`. `.nojekyll` évite tout traitement par Jekyll.

## Fichiers

- `index.html` : la page (textes anglais par défaut).
- `i18n.js` : tous les textes, en anglais et en français (`data-i18n`, `data-i18n-html` pour les mots en italique).
- `styles.css` : couleurs du thème Standard de l'app, mise en page, animations.
- `main.js` : langue, apparitions au défilement, boucles vidéo jouées seulement à l'écran, onglets des liens,
  tableau animé du haut, dernière version et étoiles lues sur l'API GitHub (lien direct vers l'installateur `.exe`
  de la dernière release, sinon page des releases).
- `assets/clips/` : boucles muettes tirées du tournage ; `assets/video/` : vidéo de présentation et son aperçu.
- `tools/make-media.cjs` : refait ces médias depuis `../video-orchestra` (`node tools/make-media.cjs`).
