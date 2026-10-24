# Vérifier la phase 1 de la 0.1.3

Le code est sur **Update3**, dans `Orchestra-worktrees/macbook` (le nom du dossier ne désigne pas sa branche). Aucun commit ni merge n'a été effectué. Les changements macOS de la branche macbook ne sont pas fusionnés ici.

## Vérifications reproductibles

Depuis ce dossier, avec Node.js 22.12+ :

```powershell
npm test
npm run build
npm run test:ui
```

- `npm test` couvre les sessions par case, les délégations concurrentes, la récupération des tableaux et les liens Note dans l'historique.
- `npm run test:ui` ouvre l'application avec des données temporaires isolées et une fenêtre cachée. Il vérifie la version affichée, la restauration depuis les paramètres, la récupération d'un workspace corrompu en français et le redémarrage sans sauvegarde disponible. Il démarre un vrai terminal cmd dans le premier scénario et vérifie sa fermeture lors de la restauration. Aucun agent IA n'est lancé ; les profils Codex du test sont isolés.
- Les captures des écrans sont dans `out/phase1`. Les données temporaires sont supprimées après succès et conservées avec leur chemin en cas d'échec.

## 1.1 — Version et règles Git

1. Vérifier avec `git branch --show-current` que le dossier est sur Update3.
2. Lancer `launcher.exe` de ce dossier, ou `npm run dev`.
3. Ouvrir Paramètres › Général › À propos : **0.1.3** doit être affiché.
4. Comparer la règle Git numéro 4 de CLAUDE.md et AGENTS.md : elles doivent être identiques et interdire les commits automatiques.

Les trois documents privés CLAUDE.md, AGENTS.md et PLAN.md sont ignorés par le .gitignore existant : ils n'apparaissent pas dans un commit ordinaire. Leurs changements doivent être conservés séparément tant que cette convention reste en place.

## 1.2 — Sessions exactes

Ces échanges réels utilisent les comptes et quotas habituels des CLI. Faire le test avec Claude Code, puis Codex si les deux sont disponibles.

1. Dans un projet de test, créer deux cases du même agent dans le même dossier.
2. Dans la première, demander « Mémorise le mot ORANGE pour cette discussion ». Dans la seconde, utiliser « BLEU ».
3. Attendre leurs réponses, fermer complètement Orchestra puis relancer cette version et choisir Reprendre.
4. Demander le mot à chaque case : la première doit retrouver ORANGE et la seconde BLEU.
5. Un tableau provenant de la 0.1.2 sans identifiants enregistrés doit afficher une explication lors d'une tentative de reprise, puis permettre Nouvelle discussion. Il ne doit pas reprendre silencieusement la dernière conversation du dossier.
6. Dans des données de test, une référence à un transcript absent doit produire la même proposition. Le test automatisé couvre ce cas sans supprimer de conversation réelle.
7. Choisir Nouvelle discussion doit abandonner la référence de session de cette case ; un redémarrage ultérieur ne doit pas la rétablir depuis une ancienne sauvegarde React.

## 1.3 — Délégations concurrentes

1. Créer deux chefs A et B, chacun relié en Délégation au même agent C.
2. Demander presque simultanément à A : « Délègue à C une réponse avec le mot POMME » et à B la même chose avec POIRE. Indiquer aux chefs d'attendre la réponse avec les outils Orchestra.
3. C doit traiter les demandes l'une après l'autre. A doit recevoir POMME et B POIRE, avec des identifiants de tâches différents.
4. Demander ensuite à un seul chef d'envoyer deux tâches à C avant d'attendre : les deux réponses doivent être récupérées.
5. Vérifier une cible attendant une permission : aucune demande ne doit être collée dans cet écran. Fermer une cible en attente doit produire une issue explicite pour le chef.
6. Dépasser la limite du lien doit toujours être refusé. La file et les demandes sont en mémoire ; elles ne reprennent pas après fermeture complète d'Orchestra.

## 1.4 — Sauvegardes et restauration

1. Ouvrir Paramètres › Général › Sauvegardes des tableaux : une liste datée apparaît après des sauvegardes de workspace. Au plus 10 versions sont conservées ; les sauvegardes automatiques sont espacées d'au moins une minute pendant les écritures.
2. Sélectionner une version : Continuer doit ouvrir une confirmation indiquant que tous les terminaux seront fermés et tous les tableaux remplacés. Annuler doit revenir au choix sans rien restaurer.
3. Exécuter `npm run test:ui` pour tester la restauration et la corruption avec des données isolées : le tableau Original et sa note sont retrouvés, le terminal courant est fermé, et le workspace corrompu reste conservé sous `workspace-corrupt-….json`.
4. Le scénario sans sauvegarde propose un nouveau tableau et conserve aussi le fichier corrompu. Aucune ancienne sauvegarde de l'interface ne doit écraser le résultat après rechargement.

Ne pas corrompre le vrai workspace pour ce test. Une restauration depuis les paramètres affecte l'ensemble des tableaux de l'installation utilisée, pas seulement celui affiché.

## 1.5 — Annuler et rétablir les liens Note

1. Sur un tableau de test, relier un Claude ou un Codex à un post-it.
2. Modifier le texte du post-it, cliquer sur le fond puis faire Ctrl+Z et Ctrl+Y : le texte suit l'historique et le lien reste présent.
3. Créer un autre lien Note, annuler puis rétablir sa création : il disparaît puis revient.
4. Fermer une case terminal, puis utiliser l'historique : aucun lien vers ce terminal absent ne doit revenir et le processus ne doit pas être relancé.

## 1.6 — Documentation et langues

1. Lire les sections Note, reprise et sauvegardes des deux README et essayer le lien Note : demander à l'agent de lire puis mettre à jour une petite liste de statut.
2. Passer l'interface en français puis en anglais : les nouveaux écrans de sauvegarde et messages de reprise doivent suivre la langue choisie.
3. Vérifier que le diff documenté correspond au worktree depuis le dernier commit, sans attribution à un agent précis dans un dossier partagé.

## Clôture

Vérifié par l'assistant : 12 tests automatisés, 3 scénarios Electron, compilation Vite et vérification de syntaxe Node. La validation avec de vraies conversations reste à effectuer par l'utilisateur ; macOS et la fabrication d'un installateur ne sont pas vérifiés par cette phase.

Après validation des six points, l'utilisateur peut committer les modifications de Update3, y compris les nouveaux fichiers de tests et modules. Message proposé :

```text
feat: prepare 0.1.3 and harden session and workspace recovery
```

La phase 2 attend un nouveau go.
