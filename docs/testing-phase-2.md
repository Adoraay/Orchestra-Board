# Vérifier la phase 2 de la 0.1.3

Branche de travail : `update3`. La phase 1 a été validée et commitée par l'utilisateur dans `5986896`. La phase 2 ne contient aucun commit effectué par l'assistant et la phase 3 attend un nouveau go.

## Vérifications reproductibles

```powershell
npm test
npm run build
npm run test:ui
```

Pour le seul parcours Electron de phase 2 : `npm run test:ui -- phase2`.

Pour le correctif de blocage de **Changements** : `npm run test:ui -- changes`. Ce parcours vérifie l'ouverture, l'expansion d'un éventuel dossier `node_modules` non suivi, les actualisations, la fermeture et la réactivité du processus principal. Il utilise le dépôt courant en lecture seule. Pour viser un autre dépôt contenant beaucoup de fichiers non suivis, définis `ORCHESTRA_SMOKE_REPO` sur son chemin ; `ORCHESTRA_SMOKE_FILE` peut désigner un petit fichier modifié ou non suivi à prévisualiser, relatif à cette racine. Le profil de test reste isolé de tes tableaux.

Les tests utilisent des données temporaires et des profils isolés. Le parcours de phase 2 enregistre et instancie un tableau de notes, teste le vrai pont IPC et le serveur HTTP de hooks avec des événements simulés, lit le diff du dépôt courant sans mutation Git, navigue entre tableaux et vérifie l'arrêt puis la relance d'un vrai terminal cmd. Aucun CLI IA n'est démarré et aucun modèle n'est sollicité. Le rôle a été transmis via un hook simulé, pas vérifié dans une vraie conversation. Les captures sont dans `out/ui-smoke` ; les données de test sont conservées avec leur chemin si un scénario échoue.

## 2.1 — Modèles d'équipes

1. Depuis le launcher de ce worktree, ouvre **Modèles d'équipes** avec la nouvelle icône d'équipe de la barre du haut.
2. Vérifie les trois recettes : développeur/relecteur, chef/deux agents et développeur/terminal. Les recettes suivent la langue de l'interface ; les modèles personnels gardent leurs noms et leurs consignes.
3. Choisis un dossier de projet de test et des agents installés compatibles. Une commande introuvable n'est pas sélectionnable ; un agent absent du catalogue du modèle doit être remplacé avant création. Les rôles et liens nécessitant des hooks ne peuvent pas être confiés à un simple terminal.
4. Crée l'équipe : un **nouveau tableau** apparaît, avec les cases et liens prévus. Les agents démarrent dans le dossier choisi, dans de nouvelles sessions. Un rôle prévu par la recette doit être visible comme actif après le premier SessionStart.
5. Donne des noms, rôles et notes à cette équipe. Ouvre les modèles, onglet **Enregistrer ce tableau**, donne un nom puis enregistre.
6. Réutilise ce modèle dans un deuxième dossier. Vérifie disposition, rôles, notes et liens ; aucune ancienne branche, ancien dossier ou conversation ne doit être repris. Le tableau d'origine reste intact.
7. Ferme et rouvre l'app : le modèle personnel reste disponible. Supprime-le via sa confirmation : les tableaux déjà créés à partir de lui restent présents.

Les modèles sont enregistrés localement dans `team-templates.json`, au maximum 50. Leur contenu peut inclure tes notes et consignes. Ils ne sont pas inclus dans les sauvegardes de workspace. La création d'une équipe avec de vrais agents utilise tes comptes CLI habituels ; les échanges demandés consomment leurs quotas habituels.

## 2.2 — Boîte de réception des blocages

1. Crée des agents dans deux tableaux. Déclenche une attente de permission ou de réponse chez l'un d'eux : l'icône de boîte dans la barre du haut affiche un compteur.
2. Ouvre la boîte : la case, son tableau et la raison d'attente sont affichés. Clique sur le nom d'une case d'un autre tableau : celui-ci doit s'ouvrir et la map se centrer sur la case.
3. Réponds dans le terminal de l'agent. Le blocage se résout quand un hook signale la reprise. La boîte ne doit jamais répondre à ta place.
4. Affiche les événements résolus, puis efface-les : une permission encore active doit rester visible. Plusieurs notifications identiques ne doivent pas créer de doublons.
5. Atteins la limite de tours d'un lien ou provoque un refus (cible non lancée, terminal occupé) : un événement apparaît. Une nouvelle chaîne ou un envoi réussi doit résoudre l'incident correspondant.
6. Dans un simple terminal de test, tape `exit` : l'arrêt apparaît dans la boîte. Relance ce terminal avec le bouton de sa case : l'événement devient résolu. Fermer normalement une case via sa croix ne doit pas créer un incident d'arrêt inattendu.
7. Un événement dont la case a été supprimée devient résolu et son bouton de navigation est désactivé.

L'historique est en mémoire, pas conservé après fermeture complète de l'app. Le nettoyage conserve les blocages actifs même s'ils sont nombreux et limite l'historique résolu.

## 2.3 — Portée du diff et worktrees partagés

1. Configure deux cases dans le même worktree, dont une dans un sous-dossier, éventuellement sur deux tableaux.
2. Ouvre **Changements** : la comparaison « tout le worktree depuis HEAD », sa racine et l'absence d'attribution par agent doivent être explicites. L'autre case et son tableau doivent être signalés.
3. Une modification déjà présente avant le démarrage d'un agent reste incluse : cette vue compare au commit, pas au début de sa tâche.
4. Configure une autre case dans un worktree Git distinct existant : elle ne doit pas être listée comme partageant les fichiers. Aucune création de worktree ou mutation Git n'est nécessaire à ce test si tu en possèdes déjà un.
5. Sur un dépôt sans commit, la portée doit indiquer qu'il n'existe pas encore de commit. Actualiser relit les fichiers et les autres cases configurées.
6. Dans un dépôt avec un gros dossier non suivi (par exemple `node_modules`), la fenêtre doit s'ouvrir sans lire tous ses fichiers. Le dossier apparaît regroupé ; sélectionne-le puis utilise le bouton de chargement explicite. La liste reste limitée à 500 entrées et l'app doit rester utilisable après actualisation et fermeture.
7. Sélectionne un petit fichier non suivi : son contenu doit s'afficher. Un aperçu dépassant 200 Ko, 2 000 lignes ou 4 000 caractères par ligne est tronqué avec un message ; utilise VS Code pour consulter la totalité. Les fichiers binaires ne sont pas rendus comme du texte.

Les cases déclarées dans le workspace sont considérées, même si leur tableau n'a pas été ouvert. Une référence de dossier absente ou un dossier hors Git n'est pas un worktree partagé.

## 2.4 — Rôle actif et rôle enregistré

1. Lance un Claude Code ou Codex avec un rôle et attends son hook de démarrage. Ouvre l'éditeur de rôle : la section **Rôle actif dans cette session** affiche la consigne transmise.
2. Change puis enregistre la consigne, en choisissant **Plus tard**. Le rôle actif doit rester l'ancien ; le champ du rôle enregistré contient le nouveau et l'encoche indique une modification en attente.
3. Après un `/clear` compatible, ou la relance proposée, le rôle actif doit devenir le nouveau et l'indication d'attente disparaître.
4. Supprime le rôle enregistré : l'ancien reste actif jusqu'au prochain démarrage de session, puis la section active doit indiquer **Aucun rôle**.
5. Avant le premier hook d'une nouvelle session, l'interface doit annoncer qu'aucun SessionStart n'a encore été reçu, sans prétendre qu'un rôle est actif.
6. Fermer et rouvrir l'app conserve le rôle enregistré ; la connaissance du rôle actif est recalculée à partir du nouveau processus et de son hook. Les consignes ne constituent pas une restriction technique des outils.

## Clôture

Après validation des quatre points, committer les modifications et les nouveaux modules, composants, tests et ce guide sur `update3`. Message proposé :

```text
feat: add team templates and agent visibility
```

PLAN.md, CLAUDE.md et AGENTS.md restent des documents privés ignorés par Git. Aucun changement de convention, commit, merge, push ou tag automatique. Les essais avec de vrais CLI et macOS restent à la charge de la validation manuelle ; ne passer à la phase 3 qu'après un nouveau go.
