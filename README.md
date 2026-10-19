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
  preload.cjs             seul pont vers l'interface (window.pty, fs, settings, agents, workspace, git, links, agentEvents)
  ptyManager.cjs          un vrai PTY (node-pty) par case, dernières sorties gardées pour les tableaux fermés
  agentStatus.cjs         statut de chaque case (inactif / travaille / attend / a fini)
  hookServer.cjs          petit serveur local (127.0.0.1 + jeton) qui reçoit les hooks de Claude Code
  claudeHooks.cjs         fichiers --settings (hooks, outils autorisés) et --mcp-config par case Claude
  claudeTrust.cjs         dossier marqué « de confiance » dans ~/.claude.json avant de lancer Claude
  settingsStore.cjs       settings.json : apparence, agents, général (validé à chaque lecture/écriture)
  workspaceStore.cjs      workspace.json : tableaux, cases, liens, dessins, notes, vue
  agentsHandlers.cjs      logos des agents ajoutés, bouton « Tester » (where / which)
  fsHandlers.cjs          lecture des dossiers pour l'explorateur, choix d'un dossier
  git.cjs                 branches et worktrees Git d'une case (execFile, seulement fetch et worktree add)
  linkRelay.cjs           liens en Transmission : réponse de A envoyée dans le terminal de B, file d'attente, limite de tours
  usage.cjs               utilisation (quotas) : cache /usage de Claude (+ /usage invisible), rate_limits de Codex
  delegation.cjs          liens en Délégation : outils list_agents, send_to_agent, wait_for_replies
  mcpServer.cjs           serveur MCP « orchestra » lancé par chaque Claude (stdio), relaie ses appels à l'app
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
- **Cases** : déplacement avec effet « soulever puis fixer », sélection au clic, sélection multiple par rectangle au clic droit (et déplacement en groupe), redimensionnement après un clic sur la barre de titre, renommage par double-clic sur le titre (ex. « Claude design »), bouton « relancer », confirmation avant de fermer un agent (ou l'app) pendant qu'il travaille.
- **Statuts** : pastille grise / orange / jaune / verte (hooks pour Claude Code, activité du terminal pour les autres). La languette « Agents actifs » en bas de la map ouvre la liste de tous les agents lancés (tous tableaux) ; un clic centre la map sur l'agent.
- **Utilisation** : languette « Utilisation » sur le bord droit de la map : quota de session et de la semaine de Claude (mis à jour par un `/usage` invisible), limites de Codex.
- **Confiance** : Claude Code ne demande plus de faire confiance à chaque dossier ouvert par Orchestra (désactivable dans Général).
- **Fin de tâche** : lueur verte, bulle « Claude design a terminé sa tâche » (avec le nom de la case), son, notification Windows (un clic ramène sur la case), point vert sur l'onglet d'un tableau fermé.
- **Barre d'outils** : Sélection, Stylo (clic droit pour gommer), Post-it, Texte (rotation, taille), Lien par deux clics (clic droit pour supprimer un lien) ; Ctrl+Z / Ctrl+Y.
- **Sauvegarde** de tout à chaque changement ; au redémarrage, une seule question « Reprendre tes discussions ? » relance tous les agents en reprenant leur conversation (`claude --continue`, `codex resume --last`, `gemini --resume latest`), en nouvelle discussion, ou laisse choisir case par case.
- **Fenêtre** : une seule barre en haut (logo, onglets, dossier actif, paramètres, boutons Windows) qui sert aussi à déplacer la fenêtre ; confirmation avant de quitter quand un agent travaille.
- **Paramètres** : thème et couleur d'accent en direct, police des terminaux, grille, agents, racine de l'explorateur, shell, notifications.
- **Branches Git** : glisser le carré « Branche » sur une case ouvre la liste des branches ; en choisir une relance l'agent dans son propre `git worktree` (`<dépôt>-worktrees/<branche>`), avec une encoche sous la case.
- **Liens qui transmettent** : clic sur un lien = panneau (consigne avec `{reponse}`, limite de tours, actif). Quand Claude (A) termine, sa dernière réponse part dans le terminal de B avec la consigne ; B attend s'il travaille encore.
- **Orchestration** : un lien en Délégation laisse un Claude parler lui-même aux agents reliés. Il les voit (`list_agents`), leur écrit (`send_to_agent`) et récupère leurs réponses (`wait_for_replies`). Exemple : un Claude principal relié à 3 Claude leur demande un poème chacun et choisit le meilleur. Le type de lien se choisit dans son panneau (défaut dans les paramètres), avec inversion et double sens.
- **Écran de démarrage** animé, `launcher.exe` pour lancer sans terminal.

## Ce qui reste à faire

1. **Finitions** (prochaine étape) : raccourcis, thème Clair, packaging Windows (`Orchestra.exe` avec son icône).
2. **Plus tard** : orchestration avec Codex. Gemini CLI n'est plus maintenu (remplacé par Google Antigravity) : il reste dans le dock, sans orchestration.

Le détail de chaque fonctionnalité est dans `PLAN.md`, l'ordre de travail dans `CLAUDE.md`.
