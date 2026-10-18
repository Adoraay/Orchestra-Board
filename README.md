# Orchestra

*« soit le maestro de ton Orchestre d'IA ! »*

Une grande map où tu glisses des agents IA (Claude Code, Codex, Gemini CLI…) depuis le dock de gauche. Chaque agent tourne dans un vrai terminal, et tu peux en mettre autant que tu veux côte à côte.

## Lancer le projet

Prérequis : Node.js 20+, et les CLI que tu veux utiliser déjà installés et connectés (`claude`, `codex`, `gemini` doivent marcher dans ton terminal).

```bash
npm install      # installe tout et recompile node-pty pour Electron
npm run dev      # lance Vite + Electron avec rechargement à chaud
```

Pour lancer l'app sans terminal : double-clic sur `launcher.exe` à la racine du projet (reconstruit l'interface puis ouvre l'app, détails d'une erreur dans `launcher.log`). Il doit rester à la racine. Pour le recompiler après une modification de `scripts/launcher.cs` :

```bash
npm run build:launcher
```

Sous Windows, si `npm install` échoue sur node-pty, installe les « Desktop development with C++ » de Visual Studio Build Tools et Python 3, puis relance `npm install`.

## Structure

```
electron/
  main.cjs           fenêtre Electron + routes IPC
  preload.cjs        pont sécurisé : window.pty, window.fs, window.settings, window.agents
  ptyManager.cjs     un vrai PTY (node-pty) par case de la map, shell choisi dans les paramètres
  settingsStore.cjs  settings.json (apparence, agents, général), validé à chaque lecture/écriture
  agentsHandlers.cjs logos des agents ajoutés, bouton « Tester » (where / which)
  fsHandlers.cjs     lecture des dossiers pour l'explorateur, choix d'un dossier
src/
  App.jsx            la map (React Flow) + le drop qui crée une case
  agents.js          affichage des agents (initiales, logos)
  assets/agents/     logos des agents de base (<id>.svg ou .png)
  context/           SettingsContext (paramètres, agents), WorkspaceContext (racine, dossier actif)
  components/        barre du haut, dock, explorateur, cases terminal, paramètres
  hooks/             effet « flotter puis se fixer », mode redimensionnement
  lib/               thème xterm, chemins
  theme.css          toutes les couleurs (variables CSS)
  styles.css
scripts/launcher.cs  source de launcher.exe (lancement sans terminal)
```

Le chemin d'une frappe : xterm.js → `window.pty.write` → IPC → node-pty → le CLI. La sortie fait le chemin inverse via `pty:data:<id>`.

## Ajouter un agent

Dans l'app : ⚙ → Agents → « Ajouter un agent » (nom, commande, logo, couleur). Le bouton « Tester » vérifie que la commande existe. Les paramètres sont dans `%APPDATA%\Orchestra\settings.json`.

## Déjà en place

- Map avec pan, zoom et minimap.
- Drag & drop depuis le dock, la case apparaît là où tu lâches.
- Cases déplaçables par la barre de titre, redimensionnables quand elles sont sélectionnées, le terminal suit la taille.
- Bouton × qui tue le processus et retire la case. Tous les agents sont tués quand l'app se ferme.
- Points d'accroche à gauche et à droite : tu peux déjà tracer des liens, ils ne font rien pour l'instant.

## Prochaines étapes

1. **Sauvegarde de la disposition** : enregistrer `nodes` et `edges` dans un JSON (via IPC, `app.getPath('userData')`) et les recharger au démarrage. Choisir un dossier de travail (`cwd`) par case.
2. **Statut des agents** : savoir qui travaille, qui attend, qui a fini. Pour Claude Code, utiliser les hooks (`Stop`, `Notification`) qui appellent un petit serveur HTTP local lancé par `main.cjs`. Afficher une pastille de couleur dans la barre de titre.
3. **Liens qui transmettent** : quand le hook `Stop` de A arrive, lire son dernier message dans le transcript, puis l'écrire dans le PTY de B (en bracketed paste : `\x1b[200~` + texte + `\x1b[201~`, puis `\r` séparément). Mettre une limite de tours par lien pour éviter les boucles A→B→A.
4. **Option plus robuste** : un serveur MCP local avec un outil `send_to_agent(nom, message)`, autorisé seulement pour les liens tracés sur la map.
5. **Cases qui « flottent »** : quand on attrape une case, elle se soulève (léger `scale` ~1.03, ombre plus large et plus floue, petite inclinaison qui suit la vitesse du déplacement). Quand on la lâche, mini animation de « fixation » au tableau : elle redescend avec un léger rebond (ressort), l'ombre se resserre et le contour s'accentue brièvement puis revient à la normale. React Flow donne `onNodeDragStart` / `onNodeDragStop` et met la classe `dragging` sur le node, ce qui suffit pour piloter les transitions CSS.
6. **Notification de fin de tâche** : quand un agent a fini de répondre (hook `Stop`, cf. étape 2), lueur verte qui pulse autour de sa case, petit son (fichier court joué via `new Audio()`), et une bulle au-dessus de la case : « [nom de l'agent] a terminé sa tâche ». La lueur et la bulle disparaissent après quelques secondes ou quand on clique sur la case. En option, une notification système Electron (`new Notification(...)`) si la fenêtre n'a pas le focus.

Pièges à garder en tête : un agent bloqué sur une demande de permission bloque toute la chaîne, et React StrictMode monte les composants deux fois en dev (le `ptyManager` ignore déjà un deuxième `create` sur le même id).
