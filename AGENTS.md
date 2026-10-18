# AGENTS.md — Orchestra

*« Sois le maestro de ton orchestre d'IA ! »*

Instructions pour Codex sur ce projet. **Lis aussi `PLAN.md`** : il décrit ce que l'app doit faire et à quoi elle doit ressembler. Ce fichier-ci dit dans quel ordre et de quelle manière travailler.

## Le projet

App de bureau Electron : une map (React Flow) où l'on glisse des agents IA en CLI, chacun dans un vrai terminal (xterm.js + node-pty), avec un explorateur de dossiers, des paramètres et, à terme, des liens entre agents.

Nom : **Orchestra** (`productName` dans `package.json`). Nom de dépôt et de site prévus : **OrchestraBoard**. Le dossier local s'appelle encore `AgentBoard`, ne pas le renommer. Logo de l'interface (barre de titre) : `design/orchestra-mark.svg`, sans fond. Icône de barre des tâches : `src/assets/orchestra-logo-small.svg`, à convertir en `.ico` à l'étape packaging. Les données de l'app sont dans `%APPDATA%\Orchestra` (reprises une fois depuis l'ancien `%APPDATA%\agent-board`).

Stack : Electron, React 18, Vite, `@xyflow/react`, `@xterm/xterm`, `node-pty`. JavaScript (pas de TypeScript pour l'instant). Machine de dev principale : **Windows**.

Commandes :
- `npm install` — installe et recompile node-pty pour Electron
- `npm run dev` — Vite + Electron en mode développement
- `npm run build` — build de l'interface
- `launcher.exe` (racine) — lance l'app sans terminal (build puis Electron) ; source `scripts/launcher.cs`, recompiler avec `npm run build:launcher` (compilateur C# de .NET Framework, fourni avec Windows)

## Règle d'architecture (la plus importante)

Deux mondes, jamais mélangés :

- `electron/` = **Node.js**. Tout ce qui touche au système : processus, terminaux, fichiers, dialogues natifs, serveur local pour les hooks, sauvegarde JSON.
- `src/` = **interface React**. Tout ce qui est visuel et interaction. Aucun `require`, aucun `fs`, aucun `child_process` ici.
- Le seul pont est `electron/preload.cjs`, qui expose des fonctions sur `window` (`window.pty`, `window.fs`, `window.settings`, `window.workspace`…). Chaque nouvelle capacité système = une fonction dans le preload + un handler `ipcMain` dans `main.cjs` (ou dans un module dédié importé par `main.cjs`).
- Garder `contextIsolation: true` et `nodeIntegration: false`.
- Valider côté Node les chemins et ids reçus de l'interface (un chemin doit exister, un id de terminal doit être connu).

## Conventions

- Interface et messages en **français**. Noms de variables, fonctions et fichiers en anglais.
- Un composant React par fichier dans `src/components/`. La logique réutilisable dans `src/hooks/` ou `src/lib/`.
- Couleurs **uniquement** via les variables CSS de `src/theme.css` (voir `PLAN.md` §4.1). Aucune couleur en dur dans les composants, sauf la couleur de secours d'un agent.
- État global (paramètres, dossier actif) : un contexte React simple (`SettingsContext`, `WorkspaceContext`). Pas de Redux ni de lib d'état sans me demander.
- **Ne pas ajouter de dépendance sans me demander**, sauf `lucide-react` pour les icônes (autorisée).
- Pas de code mort ni de gros commentaires : un commentaire court quand le « pourquoi » n'est pas évident.
- Les nouveaux agents ne se codent plus en dur : ils viennent de `settings.json` (les agents de base sont les valeurs par défaut).

## Manière de travailler

1. Une étape de la feuille de route à la fois. Avant de coder, résume en quelques lignes ce que tu vas changer et quels fichiers tu touches.
2. Garde l'app lançable à la fin de chaque étape (`npm run dev` doit marcher).
3. À la fin d'une étape : dis-moi exactement quoi tester à la main, coche l'étape ci-dessous et propose un message de commit.
4. **Git : ne jamais commit toi-même.** Je fais tout ce qui touche à git moi-même. Aucune commande qui modifie le dépôt (`git add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`, `stash`, `tag`, branches…), même si ça paraît pratique. Lire l'état (`git status`, `git diff`, `git log`) reste autorisé.
5. Si quelque chose du `PLAN.md` est flou ou impossible, demande-moi avant de choisir à ma place.
6. Si une étape devient trop grosse, découpe-la et dis-le-moi.
7. Teste en priorité sous Windows (PowerShell comme shell par défaut, chemins avec `\`, utiliser `path.join`).

## Feuille de route

Ordre à respecter. Chaque étape a son critère de fin.

- [x] **0. Base** — map, dock, drag & drop, un terminal par case. (fait)
- [x] **1. Thème Standard** — créer `src/theme.css` avec toutes les variables de `PLAN.md` §4.1, passer tout le CSS existant dessus, thème xterm construit depuis les variables. *Fini quand* : plus aucune couleur en dur, l'app a le look orange foncé / gris foncé.
- [x] **2. Nouvelle disposition** — barre du haut (nom, dossier actif, bouton ⚙ inactif), dock des agents à gauche en carrés logo seul avec infobulle, emplacement de l'explorateur à droite (vide pour l'instant). Logos dans `src/assets/agents/`, initiales en secours. *Fini quand* : la disposition correspond au schéma de `PLAN.md` §2.
- [x] **2b. Cases qui flottent** — effet « soulever / flotter / se fixer » au déplacement et à l'apparition d'une case (`PLAN.md` §4.4), en n'animant que `transform` et l'ombre. *Fini quand* : déplacer une case donne l'impression de la soulever puis de l'épingler, sans que le terminal se redimensionne ou clignote.
- [x] **2c. Sélection, aperçu de dépôt et redimensionnement** — aperçu en pointillés qui suit la souris pendant le glisser depuis le dock (fantôme du navigateur masqué), case « choisie » = bordure orange 1,5 px au clic n'importe où, une seule à la fois, poignées de redimensionnement seulement après un vrai clic (< 3 px) sur la barre de titre et fermées par clic ailleurs ou Échap, aucune barre de défilement native (terminal, puis explorateur et paramètres) (`PLAN.md` §3.7). *Fini quand* : le dépôt montre l'aperçu à la place exacte de la future case, cliquer dans un terminal ne montre que la bordure orange, les poignées n'apparaissent qu'au clic sur la barre de titre, et aucune barre blanche n'est visible.
- [x] **3. Explorateur de documents** — côté Node : `fs:listDir(path)` (dossiers d'abord, fichiers cachés masqués), `dialog:pickFolder()`. Côté UI : arbre chargé à la demande (on ne lit un dossier que quand on l'ouvre), clic = dossier actif, bouton « Changer la racine », panneau repliable. *Fini quand* : je peux naviguer dans mes dossiers et choisir un dossier actif.
- [x] **4. Lancer dans le bon dossier** — le drop crée la case avec `cwd` = dossier actif (repli sur le dossier personnel + message), nom du dossier dans la barre de titre, bouton « relancer » quand le processus se termine. *Fini quand* : `claude` s'ouvre dans le dossier choisi.
- [x] **5a. Paramètres : base et Apparence** — `settings.json` dans `app.getPath('userData')`, chargé au démarrage, sauvegardé à chaque changement (valeurs validées côté Node). Modale centrée avec les 3 onglets de `PLAN.md` §3.3, seul l'onglet Apparence est rempli : thème, couleur d'accent appliquée en direct aux variables CSS et aux terminaux, taille de police des terminaux, grille de la map. *Fini quand* : je change la couleur d'accent et la taille de police, tout se met à jour en direct et c'est conservé après redémarrage.
- [x] **5b. Paramètres : Agents et Général** — les agents viennent de `settings.json` (agents de base = valeurs par défaut). Ajouter un agent (nom, commande, logo, couleur) l'ajoute au dock ; le logo choisi est copié dans `userData/logos/`. Bouton « Tester » qui vérifie la commande (`where` sous Windows, `which` ailleurs). Onglet Général. *Fini quand* : j'ajoute `aider` depuis les paramètres et je peux le glisser sur la map.
- [x] **5c-1. Barre d'outils : Sélection, Lien, Stylo** — barre arrondie à gauche de la map avec les 5 outils (Post-it et Texte grisés pour l'instant), raccourcis clavier, mode Lien (terminaux inaccessibles, clic sur A qui s'illumine puis clic sur B pour relier), Stylo (traits à main levée en coordonnées de la map, sélection et Suppr) (`PLAN.md` §3.8). *Fini quand* : je dessine sur la map, je supprime un trait, et je trace un lien entre deux agents en mode Lien.
- [x] **5c-2. Barre d'outils : Post-it et Texte** — notes et textes libres éditables (`PLAN.md` §3.8). Avant la sauvegarde de la map pour qu'ils soient sauvegardés avec elle. *Fini quand* : je pose un post-it et un texte, je les modifie et les déplace.
- [x] **6. Sauvegarde de la map** — `workspace.json` (cases, positions, tailles, agent, cwd, liens, dessins, post-it, textes), sauvegarde avec délai de 500 ms, restauration au démarrage avec relance des agents. *Fini quand* : je ferme et rouvre l'app et retrouve ma map.
- [x] **6b. Tableaux (pages)** — onglets dans la barre du haut pour créer, nommer, renommer et supprimer plusieurs tableaux ; agents des autres tableaux gardés en arrière-plan avec réaffichage de leurs dernières sorties ; barre de menu native retirée (`PLAN.md` §3.9). *Fini quand* : je crée deux tableaux nommés, je passe de l'un à l'autre sans perdre les agents, et je les retrouve au redémarrage.
- [x] **7. Statuts des agents** — petit serveur HTTP local dans `electron/` (port aléatoire sur 127.0.0.1 uniquement), hooks Claude Code (`UserPromptSubmit`, `Notification`, `Stop`) passés via une config par case, pastille de statut dans la barre de titre. Pour les agents sans hooks : statut basé sur l'activité du terminal (sortie récente = travaille). *Fini quand* : la pastille passe de « travaille » à « fini » quand Claude termine.
- [x] **7b. Notification de fin de tâche** — lueur verte, son unique, bulle « [agent] a terminé sa tâche » au-dessus de la case, notification Windows si l'app n'a pas le focus (`PLAN.md` §3.6), options dans les paramètres. *Fini quand* : Claude termine et je le vois et l'entends même depuis une autre fenêtre.
- [x] **8. Écran de démarrage** — animation de lancement fournie dans `design/` (`SplashScreen.jsx` + `splash.css`, utilisés tels quels, voir `design/README.md`) : logo avec agents en orbite au centre, le bloc glisse à gauche et le nom sort de derrière le logo, fondu vers l'app vers 3,9 s. L'app se charge déjà derrière. *Fini quand* : chaque lancement d'Orchestra commence par cette animation, sans flash de couleur avant ni après.
- [x] **8b. Détails d'interface** — confirmation avant de fermer une case dont l'agent travaille (paramètre Général), sélection multiple par rectangle au clic droit avec déplacement en groupe (`PLAN.md` §3.7), clic droit pour supprimer un lien en mode Lien (§3.8), renommer une case par double-clic sur son titre avec nom repris par la bulle, les notifications et la sauvegarde (§3.2).
- [ ] **9. Branches Git** — carré « Branche » dans le dock (sous les agents, séparé par un trait) à glisser sur une case ; message si le dossier n'est pas un dépôt Git ; sinon barre des branches sous la case (recherche, locales puis distantes, actuelle en orange) ; choisir une branche = worktree créé ou réutilisé dans `<repo>-worktrees/<branche>` puis agent relancé dedans (confirmation s'il travaille) ; encoche de branche sous la case, branche sauvegardée dans `workspace.json`. Côté Node : `electron/git.cjs` (`git:isRepo`, `git:listBranches` avec `fetch --prune` non bloquant, `git:ensureWorktree`), `execFile` avec arguments en tableau (`PLAN.md` §3.10). *Fini quand* : je glisse « Branche » sur un Claude dans un dépôt, je choisis une branche, Claude redémarre dans son worktree avec l'encoche, et je retrouve tout au redémarrage.
- [ ] **10. Liens entre agents** — panneau de lien (consigne avec `{reponse}`, limite de tours, activer/désactiver), lecture du dernier message dans le transcript fourni par le hook `Stop`, envoi dans le PTY de B en collage entre crochets (`\x1b[200~` … `\x1b[201~`) puis `\r` séparément, animation du lien. *Fini quand* : A termine et B reçoit automatiquement sa réponse avec la consigne.
- [ ] **11. Finitions** — confirmation avant de fermer l'app quand un agent travaille, raccourcis clavier, thème « Clair », packaging Windows (electron-builder) : vrai `Orchestra.exe` avec le logo (`build/icon.ico`) et le nom « Orchestra » aussi dans le Gestionnaire des tâches (en dev il affiche encore « Electron », choix assumé pour ne pas modifier `electron.exe`).
- [ ] **12. (Optionnel) Serveur MCP** — outil `send_to_agent` pour que les agents s'envoient des messages eux-mêmes, limité aux liens de la map.

## Pièges connus

- **node-pty sous Windows** : si l'installation échoue, il faut Visual Studio Build Tools (charge « Développement Desktop en C++ ») et Python 3. Ne pas remplacer node-pty par `child_process` : sans PTY, les CLI interactifs ne marchent pas.
- **React StrictMode** monte les composants deux fois en dev : `ptyManager.create` ignore déjà un deuxième appel avec le même id, garder ce comportement.
- **Map vs terminal** : les zones interactives d'une case doivent avoir les classes `nodrag nowheel`, sinon la map bouge quand on sélectionne du texte ou qu'on scrolle.
- **Redimensionnement** : toujours `fit()` puis `pty.resize(cols, rows)`, sinon les CLI affichent n'importe quoi.
- **Fuites** : chaque `onData`/`onExit` côté preload renvoie une fonction de désabonnement, l'appeler au démontage. Tuer tous les PTY à la fermeture de l'app.
- **Boucles entre agents** : toujours une limite de tours sur chaque lien, jamais d'envoi automatique sans elle.
- **Permissions des agents** : un agent bloqué sur une demande de permission bloque la chaîne. Le détecter (hook `Notification`) et l'afficher en jaune, ne jamais l'approuver automatiquement.
- **Git** : jamais deux agents dans le même dossier sur des branches différentes (d'où les worktrees). Une branche déjà ouverte dans un worktree ne peut pas l'être dans un second : réutiliser l'existant. Toujours `execFile` avec des arguments en tableau, et vérifier que la branche existe avant de l'utiliser. Ne jamais faire de commit, push ou autre écriture Git à la place de l'utilisateur (seuls `fetch` et `worktree add` sont prévus par la fonctionnalité).
