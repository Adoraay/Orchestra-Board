# orchestra-site

Site de présentation d'Orchestra : statique (HTML, CSS, JS), sans build, sans dépendance, sans back-end.
Langue : celle choisie avec le bouton EN/FR (gardée dans le navigateur), sinon celle du navigateur
(`navigator.language` en `fr*` → français), sinon anglais.

## Voir le site

Ouvrir `index.html` dans un navigateur suffit. Pour un rendu identique à la mise en ligne, servir le dossier,
par exemple : `npx serve .` puis http://localhost:3000.

## Mettre en ligne (GitHub Pages)

Le site est publié sur **https://adoraay.github.io/Orchestra-Board/**, par le dépôt de l'app
[Adoraay/Orchestra-Board](https://github.com/Adoraay/Orchestra-Board).

1. Pousser le contenu de ce dossier à la racine de la branche `gh-pages` de ce dépôt.
2. Settings › Pages › Source : *Deploy from a branch*, branche `gh-pages`, dossier `/ (root)` (réglage actuel).
3. `.nojekyll` évite tout traitement par Jekyll. L'URL canonique, `og:url`, les images de partage, le JSON-LD et
   `sitemap.xml` pointent tous vers cette adresse : à changer ensemble si elle change.
4. Soumettre `https://adoraay.github.io/Orchestra-Board/sitemap.xml` dans Google Search Console (propriété à préfixe
   d'URL). Pas de `robots.txt` : sous un sous-chemin (`/Orchestra-Board/`), les robots ne lisent que celui de la racine
   du domaine.

## Fichiers

- `index.html` : la page (textes anglais par défaut).
- `i18n.js` : tous les textes, en anglais et en français (`data-i18n` = texte, `data-i18n-html` = texte avec balises,
  `data-i18n-aria` = aria-label, `data-i18n-alt` = alt ; `mock.*` = textes du tableau animé). En français, espace fine
  insécable (U+202F) avant ? ! : ; et à l'intérieur des guillemets.
- `styles.css` : fonds gris neutres, cuivre réservé au bouton principal, aux fins de titre du H1 et de l'appel final,
  aux liens animés et au logo ; mise en page, animations (boucles seulement dans le tableau du haut et la scène des
  agents, arrêtées hors écran et en mouvement réduit).
- `main.js` : langue, apparitions au défilement, boucles vidéo jouées seulement à l'écran, onglets des liens,
  tableau animé du haut, dernière version et étoiles lues sur l'API GitHub. Le système du visiteur est détecté :
  le bouton télécharge le `.exe` (Windows) ou le `.dmg` (macOS, arm64 par défaut, Intel si Chrome ou Edge le
  disent) de la dernière release, sinon la page des releases ; « Aussi disponible pour » donne les autres
  fichiers ; taille, date et empreinte SHA-256 du fichier proposé sous le bouton.
- `assets/brand/` : logos SVG ; `favicon-32.png` et `apple-touch-icon.png` (180 px, fond plein) sont des rendus de
  `orchestra-logo-small.svg`, à refaire si le logo change (par exemple avec Edge sans interface :
  `msedge --headless --screenshot=… --window-size=32,32 page.html`).
- `sitemap.xml` : la page unique du site, à soumettre dans Search Console.
- `assets/clips/` : boucles muettes tirées du tournage ; `assets/video/` : vidéo de présentation et son aperçu.
- `tools/make-media.cjs` : refait ces médias depuis `../video-orchestra` (`node tools/make-media.cjs`).
