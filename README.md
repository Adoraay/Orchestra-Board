# Orchestra

*« Sois le maestro de ton orchestre d'IA ! »*

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
electron/                 côté Node : système, terminaux, fichiers
  main.cjs                fenêtre, routes IPC, notifications Windows
  preload.cjs             seul pont vers l'interface (window.pty, fs, settings, agents, workspace, agentEvents)
  ptyManager.cjs          un vrai PTY (node-pty) par case, dernières sorties gardées pour les tableaux fermés
  agentStatus.cjs         statut de chaque case (inactif / travaille / attend / a fini)
  hookServer.cjs          petit serveur local (127.0.0.1 + jeton) qui reçoit les hooks de Claude Code
  claudeHooks.cjs         fichier --settings par case Claude, avec les hooks qui préviennent Orchestra
  settingsStore.cjs       settings.json : apparence, agents, général (validé à chaque lecture/écriture)
  workspaceStore.cjs      workspace.json : tableaux, cases, liens, dessins, notes, vue
  agentsHandlers.cjs      logos des agents ajoutés, bouton « Tester » (where / which)
  fsHandlers.cjs          lecture des dossiers pour l'explorateur, choix d'un dossier
src/                      interface React
  App.jsx                 chargement, onglets de tableaux, map (React Flow)
  components/             barres, dock, explorateur, cases (terminal, post-it, texte), paramètres, écran de démarrage
  context/                SettingsContext, WorkspaceContext, BoardContext
  hooks/                  tableaux, historique Ctrl+Z, raccourcis, stylo, notifications, effets des cases
  lib/                    thème xterm, chemins, (dé)sérialisation des tableaux
  assets/                 logos des agents, logo Orchestra, son de fin de tâche
  theme.css               toutes les couleurs (variables CSS)
  styles.css
design/                   identité visuelle validée (logos, écran de démarrage) : ne pas modifier
build/                    icône de l'app (générée par npm run build:icon)
scripts/                  source de launcher.exe, génération de l'icône
```

Le chemin d'une frappe : xterm.js → `window.pty.write` → IPC → node-pty → le CLI. La sortie fait le chemin inverse via `pty:data:<id>`.

Données de l'app : `%APPDATA%\Orchestra\` (`settings.json`, `workspace.json`, `logos\`, `hooks\`).

## Ajouter un agent

Dans l'app : ⚙ → Agents → « Ajouter un agent » (nom, commande, logo, couleur). Le bouton « Tester » vérifie que la commande existe.

## Ce qui marche déjà

- **Map** infinie avec pan, zoom, minimap et grille ; plusieurs **tableaux** en onglets (créer, renommer, supprimer). Les agents des autres tableaux continuent en arrière-plan.
- **Agents** : glisser un agent du dock sur la map (aperçu en pointillés) ouvre un vrai terminal dans le dossier actif de l'explorateur. Claude Code, Codex, Gemini CLI, Terminal, et tes propres agents.
- **Cases** : déplacement avec effet « soulever puis fixer », sélection au clic, sélection multiple par rectangle au clic droit (et déplacement en groupe), redimensionnement après un clic sur la barre de titre, renommage par double-clic sur le titre (ex. « Claude design »), bouton « relancer », confirmation avant de fermer un agent qui travaille.
- **Statuts** : pastille grise / orange / jaune / verte (hooks pour Claude Code, activité du terminal pour les autres).
- **Fin de tâche** : lueur verte, bulle « Claude design a terminé sa tâche » (avec le nom de la case), son, notification Windows (un clic ramène sur la case), point vert sur l'onglet d'un tableau fermé.
- **Barre d'outils** : Sélection, Stylo (clic droit pour gommer), Post-it, Texte (rotation, taille), Lien par deux clics (clic droit pour supprimer un lien) ; Ctrl+Z / Ctrl+Y.
- **Sauvegarde** de tout à chaque changement ; au redémarrage, les agents sont relancés et proposent de reprendre leur conversation (`claude --continue`, `codex resume --last`, `gemini --resume latest`).
- **Paramètres** : thème et couleur d'accent en direct, police des terminaux, grille, agents, racine de l'explorateur, shell, notifications.
- **Écran de démarrage** animé, `launcher.exe` pour lancer sans terminal.

## Ce qui reste à faire

1. **Branches Git** (prochaine étape) : glisser un carré « Branche » sur une case pour faire travailler l'agent sur une autre branche, dans son propre `git worktree`.
2. **Liens qui transmettent** : quand A termine, sa dernière réponse est envoyée à B avec une consigne, avec une limite de tours.
3. **Finitions** : confirmation avant de fermer l'app quand un agent travaille, thème Clair, packaging Windows (`Orchestra.exe` avec son icône).
4. **(Optionnel)** serveur MCP pour que les agents s'envoient des messages eux-mêmes.

Le détail de chaque fonctionnalité est dans `PLAN.md`, l'ordre de travail dans `CLAUDE.md`.
