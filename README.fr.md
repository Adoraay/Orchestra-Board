<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/orchestra-lockup.svg">
    <img src="src/assets/orchestra-lockup-light.svg" alt="Orchestra" height="72">
  </picture>
</p>

<p align="center"><b>Sois le maestro de ton orchestre d'IA.</b></p>

<p align="center">
  Une grande map où tu poses des agents IA de code (Claude Code, Codex…), chacun dans son vrai terminal,<br>
  et où tu les relies pour qu'ils se passent le travail.
</p>

<p align="center">
  <a href="../../releases/latest"><img alt="Télécharger pour Windows et macOS" src="https://img.shields.io/badge/T%C3%A9l%C3%A9charger-Windows%20%26%20macOS-d97757?style=for-the-badge&logoColor=white"></a>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-45-47848f?style=for-the-badge&logo=electron&logoColor=white">
  <a href="LICENSE"><img alt="Licence MIT" src="https://img.shields.io/badge/Licence-MIT-3c3a36?style=for-the-badge"></a>
</p>

<p align="center"><a href="README.md">🇬🇧 Read in English</a></p>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/map-light.png">
  <img src="docs/images/map-dark.png" alt="Un tableau Orchestra : un Claude Code chef qui délègue à un Codex et à un Claude Code relecteur, et lance des commandes dans un terminal visible">
</picture>

<!-- GIF à ajouter ici : docs/images/demo.gif (glisser deux agents, les relier, un message qui passe) -->

## Orchestra, c'est quoi ?

Tu utilises déjà Claude Code ou Codex dans un terminal. Orchestra en met autant que tu veux **côte à côte sur une map infinie**, chacun dans un vrai terminal, et te laisse **les relier** :

- un agent **chef** peut **déléguer** des tâches à d'autres agents et récupérer leurs réponses lui-même,
- un agent **Frontend** peut **transmettre** automatiquement son travail fini à un **relecteur**,
- un agent peut **piloter un terminal que tu vois** (`npm run dev`, tests, build) au lieu de lancer des commandes cachées.

Tout reste sur ta machine. Orchestra lance seulement les CLI que tu utilises déjà, avec tes propres comptes.

## Fonctionnalités

| | |
|---|---|
| 🗺️ **Map infinie** | Glisse des agents depuis le dock sur une map avec déplacement, zoom et minicarte. Plusieurs tableaux en onglets ; les agents continuent en arrière-plan. |
| 💻 **Vrais terminaux** | Chaque case est un vrai terminal (xterm.js + node-pty), lancé dans le dossier choisi dans l'explorateur. |
| 🔗 **Liens entre agents** | **Transmission** (passage de relais automatique), **Délégation** (un agent parle à d'autres agents par des outils) et **Terminal** (un agent lance des commandes dans un terminal visible). Une limite de tours évite les boucles. |
| 🎭 **Rôles** | Donne à chaque agent un rôle durable (« Tu es le relecteur, tu ne modifies jamais de fichier… »). |
| 📜 **Journal des échanges** | Tous les messages, réponses, commandes et refus passés par un lien. |
| 🔍 **Changements** | Les fichiers modifiés par un agent, avec un diff coloré, à ouvrir dans VS Code. |
| 🌿 **Branches Git** | Glisse le carré *Branche* sur une case pour passer son agent sur une autre branche, dans son propre `git worktree`. |
| 🟢 **Statuts et notifications** | Travaille / attend une permission / a fini, avec une lueur verte, un son et une notification du système quand un agent termine. |
| 🎨 **Thèmes** | Standard, Clair, ChatGPT, Gemini, VS Code, GitHub, Dracula et Nord, et ta couleur d'accent. Anglais et français. |
| 🧭 **Visite guidée** | Un tutoriel d'une minute au premier lancement, à refaire dans les paramètres. |

## Pour commencer

### 1. Installer

Télécharge l'installateur de ton système depuis la [dernière version](../../releases/latest) :

- **Windows :** lance **`Orchestra-Setup-<version>.exe`**. Windows peut afficher « Windows a protégé votre ordinateur » (l'app n'est pas encore signée) : clique sur **Informations complémentaires → Exécuter quand même**.
- **macOS :** ouvre le **`.dmg`** (`arm64` pour Apple Silicon, `x64` pour Intel) et glisse Orchestra dans Applications. L'app n'est pas encore signée par Apple : la première fois, fais un clic droit sur Orchestra dans Applications et choisis **Ouvrir**.

**Prérequis :** Windows 10 ou 11 (64 bits) ou macOS (Apple Silicon ou Intel), et les CLI d'agents que tu veux utiliser, installés et connectés : [`claude`](https://docs.anthropic.com/en/docs/claude-code) et/ou [`codex`](https://github.com/openai/codex) doivent marcher dans un terminal normal.

### 2. Faire la visite

Au premier lancement, Orchestra propose une courte visite guidée. Elle te fait faire tout ce qui suit, sur ton propre tableau.

<p align="center"><img src="docs/images/tour.png" alt="La visite guidée qui montre le dock des agents" width="420"></p>

## Tutoriel

### Pose tes agents

1. Dans l'**explorateur** à droite, clique sur le dossier où tu veux travailler : il devient le *dossier actif*.
2. **Glisse un agent** du dock de gauche sur la map. Il démarre dans un vrai terminal, dans le dossier actif.
3. Pose-en un deuxième. Chaque case se déplace, se redimensionne (clic sur sa barre de titre d'abord) et se renomme (double-clic sur son nom).

<!-- GIF à ajouter ici : docs/images/drag-drop.gif (glisser Claude Code puis Codex depuis le dock) -->

### Relie-les

Prends l'**outil Lien** (`L`) dans la barre d'outils, clique sur la première case, puis sur la deuxième. Ensuite, avec l'**outil Sélection** (`V`), clique sur l'étiquette au milieu du lien pour choisir comment ils se parlent :

<p align="center"><img src="docs/images/link-types.svg" alt="Liens Transmission (Relay), Délégation et Terminal" width="100%"></p>

| Lien | Ce qui se passe | Idéal pour |
|---|---|---|
| **Transmission** | Quand A a fini, sa dernière réponse est collée dans B avec ta consigne (`{response}` est remplacé par la réponse). | Dev → relecteur, rédacteur → traducteur |
| **Délégation** | A envoie une tâche avec un identifiant unique. Les demandes vers un même agent sont mises en file ; chaque réponse revient à son émetteur. | Un chef qui répartit le travail entre plusieurs agents |
| **Terminal** | A lance des commandes dans une case Terminal que tu vois, après t'avoir demandé la permission. | Serveurs de dev, tests, build |
| **Note** | A lit et met à jour un post-it relié avec `list_notes`, `read_note` et `write_note`. | Plans partagés, listes et observations |

Les liens Transmission et Délégation peuvent être inversés ou mis dans les deux sens, avec une **limite de tours** (3 par défaut). Les liens Terminal et Note vont de l'agent vers leur cible.

<p align="center"><img src="docs/images/link-panel.png" alt="Le panneau d'un lien : Transmission ou Délégation, consigne, limite de tours" width="100%"></p>

<!-- GIF à ajouter ici : docs/images/relay.gif (un agent termine, le point lumineux descend le lien, l'autre reçoit le message) -->

### Donne un rôle

Survole la petite encoche qui dépasse au-dessus d'une case Claude Code ou Codex et clique sur le **masque**. Le rôle est donné à l'agent au début de chaque session (et de nouveau après `/clear`). Une case avec un rôle a une encoche orange.

<p align="center"><img src="docs/images/role.png" alt="Modifier le rôle d'un agent" width="520"></p>

### Partage un post-it

Pose un post-it sur la map et relie un agent à celui-ci : cela crée un lien Note. Demande à l'agent de lire ou modifier la note ; les changements sont visibles et tu peux aussi l'éditer. Les lignes `- [ ] À faire`, `- [~] En cours` et `- [x] Fait` affichent des icônes de statut. Une écriture remplace toute la note : l'agent doit la lire avant de la modifier.

### Reprends et récupère tes tableaux

Claude Code et Codex reprennent la session exacte sauvegardée pour chaque case, même lorsque deux cases utilisent le même dossier. Si la session ou son transcript est introuvable, Orchestra propose une nouvelle discussion au lieu de reprendre celle d'une autre case. Les anciens workspaces sans identifiants de session demandent aussi une nouvelle discussion pour ces agents. Les autres CLI conservent leur propre comportement de reprise.

**Paramètres › Général › Sauvegardes des tableaux** liste jusqu'à 10 anciens workspaces, conservés localement au plus une fois par minute pendant les sauvegardes. Restaurer ferme tous les terminaux, remplace tous les tableaux et recharge l'interface ; le workspace lisible actuel est d'abord sauvegardé. Si `workspace.json` est illisible au démarrage, choisis une sauvegarde ou un nouveau tableau : le fichier illisible est conservé à part avant remplacement. Les sauvegardes contiennent notes, chemins, rôles et références de sessions ; les agents conservent leurs conversations séparément. Le journal des échanges n'y figure pas.

### Suis les échanges

Ouvre la languette **Journal** sur le bord droit de la map (`Ctrl+Maj+J`). Elle liste tout ce qui est passé par un lien : messages transmis, tâches déléguées et leurs réponses, commandes du terminal et leur sortie, et les refus en rouge (limite de tours atteinte, terminal occupé…). Clique sur un nom pour aller à sa case.

<p align="center"><img src="docs/images/log.png" alt="Le journal des échanges à côté du tableau" width="100%"></p>

### Relis les changements

Quand une case travaille dans un dépôt Git, une deuxième encoche au-dessus d'elle ouvre la fenêtre **Changements** : chaque fichier modifié dans son worktree depuis le dernier commit, avec un diff coloré et un bouton *Ouvrir dans VS Code*. Cela n'identifie pas quel agent a fait chaque modification lorsque des cases partagent le dossier. Ici, Orchestra ne fait que lire Git.

<p align="center"><img src="docs/images/changes.png" alt="La fenêtre des changements avec un diff" width="100%"></p>

## Recettes

**Un chef et deux agents** — Place un Claude Code *Lead* au-dessus d'un Codex et d'un Claude Code, reliés en **Délégation**. Demande au chef : « Demande un court poème à chacun de tes agents et dis-moi lequel est le meilleur. » Il écrit aux deux, attend leurs réponses et te répond.

**Dev + relecteur** — Relie un agent *Frontend* à un *Reviewer* par une **Transmission** avec la consigne « Relis ce changement et liste les bugs : {response} ». Donne au relecteur le rôle « Tu ne modifies jamais de fichier. » À chaque fois que l'agent frontend termine, le relecteur vérifie son travail.

**Un agent qui lance ton serveur de dev** — Relie un agent à une case **Terminal**, puis demande : « Lance le serveur de dev dans le terminal relié et dis-moi quand il est prêt. » Tu vois la commande tourner ; l'agent lit la sortie et peut l'arrêter avec Ctrl+C.

## Raccourcis clavier

| Partout (même dans un terminal) | |
|---|---|
| `Ctrl+Tab` / `Ctrl+Maj+Tab` | Tableau suivant / précédent |
| `Ctrl+1…9` | Aller au tableau |
| `Ctrl+Maj+T` | Nouveau tableau |
| `Ctrl+,` | Paramètres |
| `Ctrl+Maj+E` / `A` / `U` / `J` | Fichiers / agents actifs / utilisation / journal |

| Sur la map | |
|---|---|
| `V` `P` `N` `T` `L` | Sélection, stylo, post-it, texte, lien |
| `F` | Tout afficher |
| `Suppr` | Supprimer la sélection (avec confirmation) |
| `F2` | Renommer la case choisie |
| `Ctrl+Z` / `Ctrl+Y` | Annuler / rétablir |

Dans un terminal, `Ctrl+C` copie quand du texte est sélectionné (sinon il interrompt) et `Ctrl+V` colle. La liste complète est dans **Paramètres › Raccourcis**.

## Thèmes

<p align="center"><img src="docs/images/themes.png" alt="Choix du thème dans les paramètres" width="560"></p>

## Confidentialité et sécurité

- **Orchestration locale.** Orchestra parle aux agents par un petit serveur limité à `127.0.0.1`, protégé par un jeton secret qui change à chaque lancement. Les échanges entre agents sont traités localement. Les vérifications de mises à jour contactent GitHub (vérification au démarrage désactivable dans Paramètres › Général) ; télécharger une mise à jour utilise aussi le réseau. Les fetch Git et les CLI d'agents utilisent leurs propres connexions.
- **Tes permissions restent les tiennes.** Orchestra n'approuve jamais une demande de permission à la place d'un agent. Ses propres outils sont autorisés d'office, sauf `run_in_terminal`, qui demande toujours.
- **Git presque en lecture seule.** Orchestra ne lance que `git fetch` et `git worktree add` (quand tu choisis une branche) et des commandes de lecture. Jamais de commit ni de push.
- **Ce qu'il écrit hors de son dossier :**
  - `~/.claude.json` : marque un dossier comme « de confiance » avant d'y lancer Claude Code (désactivable dans *Paramètres › Général*) ;
  - `~/.codex/orchestra.config.toml` (un profil Orchestra avec son serveur MCP, utilisé par `codex -p orchestra`) et les entrées d'Orchestra dans `~/.codex/hooks.json`. Elles ne font rien quand Codex tourne hors d'Orchestra.
- Les données de l'app (paramètres, tableaux) sont dans `%APPDATA%\Orchestra` (macOS : `~/Library/Application Support/Orchestra`). Le journal des échanges reste en mémoire seulement.

## FAQ

<details>
<summary><b>Codex me demande d'approuver « 5 hooks »</b></summary>

Ce sont les hooks de statut d'Orchestra (travaille / a fini). Choisis **Trust all and continue** une fois ; Codex s'en souvient.
</details>

<details>
<summary><b>Quels agents peuvent utiliser les liens ?</b></summary>

Claude Code et Codex peuvent transmettre, déléguer, piloter un terminal et utiliser les notes reliées. Les autres CLI (Aider, Gemini CLI, le tien…) marchent dans une case et peuvent *recevoir* des messages transmis ; leur intégration ici n'inclut pas les hooks ou outils d'orchestration d'Orchestra.
</details>

<details>
<summary><b>Je peux ajouter un autre CLI ?</b></summary>

Oui : **Paramètres › Agents**. Choisis un agent connu (Google Antigravity, Aider, Qwen Code, OpenCode, GitHub Copilot CLI, Cursor CLI, Goose, Amp, Kimi CLI…) ou ajoute ta propre commande, ton logo et ta couleur. *Tester* vérifie que la commande existe.
</details>

<details>
<summary><b>macOS / Linux ?</b></summary>

Orchestra tourne sur Windows et macOS (Apple Silicon et Intel), avec un installateur pour chacun dans chaque version publiée. Linux n'est ni testé ni empaqueté pour l'instant.
</details>

## Compiler depuis les sources

Utilise Node.js 22.12+ pour développer cette version. Installe les dépendances verrouillées avec `npm ci`.

```bash
npm install      # node-pty arrive avec ses binaires précompilés : ni Visual Studio ni Python
npm run dev      # Vite + Electron avec rechargement à chaud
npm test         # régressions : sessions, récupération, files et annulation
npm run dist     # installateur Windows dans release/Orchestra-Setup-<version>.exe
```

La version macOS est sur la branche `macbook` : `npm run dist:mac` y fabrique les `.dmg` (sur un Mac), et chaque push sur cette branche les fabrique sur GitHub Actions.

`launcher.exe` à la racine reconstruit l'interface et ouvre l'app sans fenêtre de terminal (`npm run build:launcher` pour le recompiler).

Si la protection anti-ransomware de Windows (*Dossiers contrôlés*) est active et que le projet est dans `Documents`, elle peut bloquer la fabrication de l'installateur : autorise `makensis.exe` ou fabrique ailleurs.

<details>
<summary><b>Structure du projet</b></summary>

```
electron/            côté Node : fenêtres, terminaux, fichiers, serveur local, MCP
  main.cjs           fenêtre, routes IPC, notifications
  preload.cjs        seul pont vers l'interface (window.pty, fs, settings, workspace, git…)
  ptyManager.cjs     un vrai PTY par case
  hookServer.cjs     serveur local (127.0.0.1 + jeton) pour les hooks des agents et les outils MCP
  mcpServer.cjs      le serveur MCP « orchestra » lancé par chaque agent (stdio)
  linkRelay.cjs      liens en Transmission
  delegation.cjs     liens en Délégation (list_agents, send_to_agent, wait_for_replies)
  terminalLink.cjs   liens Terminal (run_in_terminal, read_terminal, interrupt_terminal)
  activityLog.cjs    journal des échanges (en mémoire)
  claudeHooks.cjs    paramètres et config MCP de chaque case Claude Code
  codexProfile.cjs   profil et hooks de Codex
  git.cjs            branches, worktrees, changements et diffs en lecture seule
src/                 interface React (map, cases, panneaux, paramètres, tutoriel)
docs/images/         images du README
```

Le chemin d'une frappe : xterm.js → `window.pty.write` → IPC → node-pty → le CLI, et retour par `pty:data:<id>`.
</details>

## Retours et aide

Un bug ou une idée ? [Ouvre une issue](../../issues/new/choose) : il y a un court formulaire pour les bugs et un pour les demandes de fonctionnalités. Les questions, les retours et ta façon d'utiliser Orchestra sont les bienvenus dans les [Discussions](../../discussions).

Pour tout le reste : **orchestraboardai [at] gmail [dot] com**

## Licence

[MIT](LICENSE) © 2026 Dimitri ([@Adoraay](https://github.com/Adoraay))
