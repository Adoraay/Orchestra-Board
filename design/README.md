# design/ — identité visuelle d'Orchestra

Fichiers de référence. Ne pas modifier sans me demander : ce sont les versions validées.

## Nom et slogan

- Nom de l'app : **Orchestra** (site / dépôt : OrchestraBoard)
- Slogan : « Sois le maestro de ton orchestre d'IA ! »
- Police du nom : Playfair Display Bold, déjà convertie en formes dans les SVG (aucune police à installer)

## Fichiers

| Fichier | Usage | Où le copier dans l'app |
|---|---|---|
| `orchestra-lockup.svg` | logo + nom, barre du haut (~26 px de haut dans une barre de 44 px) | `src/assets/` |
| `orchestra-wordmark.svg` | nom seul (écran de démarrage) | `src/assets/` |
| `orchestra-mark.svg` | logo sans fond, pour l'interface sur fond sombre | `src/assets/` |
| `orchestra-logo.svg` | logo avec carré de fond, icône de l'app | `src/assets/` + build |
| `orchestra-logo-small.svg` | version simplifiée pour la barre des tâches / favicon / `.ico` | `build/` à l'étape packaging |
| `SplashScreen.jsx` + `splash.css` | écran de démarrage (~5 s), à utiliser tel quel | `src/components/` |
| `splash-preview.html` | aperçu autonome de l'écran de démarrage, à ouvrir dans un navigateur | — (référence) |
| `apercu-barre-2x.png` | rendu attendu de la barre du haut | — (référence) |

## Règles

- Les couleurs des logos correspondent aux variables du thème Standard (`--accent: #c96442`, `--accent-hover: #d97757`, fond `#1f1e1d` / `#262624`). Si le thème change dans les paramètres, les logos restent orange.
- L'écran de démarrage : logo au centre avec agents en orbite, le bloc glisse à gauche et le nom sort de derrière le logo, fondu vers l'app vers 3,9 s. Les durées se règlent dans `splash.css`. Le réglage `--overlap` décide d'où le nom sort du logo.
- Ne pas redessiner les logos à la main : copier les SVG.
