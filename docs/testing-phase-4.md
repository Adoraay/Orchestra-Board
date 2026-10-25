# Vérifier la phase 4 de la 0.1.3

Branche : `update3`. Phase 3 validée et commitée par l'utilisateur (`e5d9878`). Aucun commit de phase 4 par l'assistant.

## Vérifications reproductibles

```powershell
npm test
npm run build
npm run test:ui
```

Parcours ciblés : `npm run test:ui -- phase4 phase4-fr onboarding onboarding-fr`.

Les tests utilisent des profils temporaires, des hooks simulés via le vrai serveur HTTP local et un vrai terminal cmd. Le dépôt de test est séparé et sans commit : aucune commande Git de modification n'est utilisée. L'export écrit un vrai JSON ; le sélecteur natif de destination est simulé pour éviter une fenêtre bloquante. Le diagnostic des parcours existants peut lancer les commandes `--version` connues ; aucun modèle n'est interrogé. Le test d'onboarding simule l'absence de CLI. Captures dans `out/ui-smoke`.

## 4.1 — Tâches et dépendances

1. Relance Orchestra depuis ce worktree. Ouvre **Tâches**, icône de presse-papiers en haut. Crée une tâche « Développer », responsable : une case existante. Crée « Vérifier », dépendante de « Développer ».
2. « Vérifier » affiche **Dépendances en attente** et son démarrage est désactivé. Dans « Développer », ajoute « Vérifier » comme dépendance et enregistre : le cycle est refusé. Retire cette dépendance.
3. Dans « Développer », clique **Démarrer le suivi**, puis envoie toi-même une instruction à son agent. Ce bouton n'envoie rien au terminal. Une réponse `Stop` de l'agent remplit le résultat et passe le suivi en **Réponse reçue · à vérifier**. Pour un simple Terminal, saisis le résultat et clique **Marquer la réponse reçue**.
4. La tâche « Vérifier » reste bloquée. Relis et enregistre le résultat, puis clique **Valider le résultat** : « Vérifier » devient **À faire** et peut démarrer.
5. Modifie le résultat d'une tâche validée et enregistre : elle revient à l'état réponse reçue ; ses prérequis ne sont plus considérés validés pour une tâche pas encore démarrée.
6. Démarre « Vérifier », saisis une raison puis **Marquer en échec** : raison et état sont conservés. Crée une autre tâche et **Annuler le suivi** : elle devient annulée. Annuler le suivi après livraison n'interrompt pas le CLI.
7. Fais un échange Délégation réel : la tâche reprend le même identifiant que le journal, passe de la file au démarrage, puis à réponse reçue avec son résultat. Valide-la ; une tâche manuelle qui en dépend est débloquée. Essaie aussi une Transmission à valider : son brouillon apparaît dans Tâches ; l'annuler avant livraison retire le message en attente.
8. Ferme une case responsable d'une tâche en cours : le suivi passe en échec. Ferme puis relance Orchestra : les tâches terminées et résultats sont conservés ; les suivis inachevés sont signalés interrompus et aucun message d'une ancienne file n'est renvoyé.
9. Supprime un suivi terminé sans dépendant : seul son suivi et sa référence sont supprimés. Supprimer un prérequis encore utilisé est refusé. Pour recommencer une tâche interrompue/échouée, crée une nouvelle tâche et une nouvelle référence.

Limites : 500 suivis ; au-delà, les échanges continuent sans nouveau suivi ni référence jusqu'à suppression d'anciens suivis terminés. Le suivi n'est pas un ordonnanceur : il ne déclenche pas une tâche dépendante automatiquement et ne retarde pas un outil MCP selon des tâches manuelles. L'affectation et les dépendances d'une tâche d'échange sont observées, pas réécrites. Le dossier vient de la case responsable au démarrage ; une tâche démarrée ne se réattribue pas. Un suivi manuel sans case peut être préparé mais ne démarre qu'après affectation.

## 4.2 — Formations et groupes nommés

1. Pose trois cases ou notes de tailles différentes. Sélectionne-les par un rectangle au clic droit sur le fond. La barre de sélection apparaît.
2. Clique **Formation** : une palette de six modèles illustrés apparaît dessous. Essaie **Grille adaptative**, **3 par ligne**, **4 par ligne**, **2 colonnes**, **Ligne horizontale** et **Colonne centrée**. Les dimensions affichées sont colonnes × lignes et suivent le nombre de cases. Les cases ne doivent pas se chevaucher malgré leurs tailles différentes ; la vue se recadre automatiquement. Échap ou un clic ailleurs referme la palette.
3. Entre un nom et clique l'icône **Grouper les cases sélectionnées**. Un cadre nommé apparaît. Glisse son nom : tous les membres se déplacent du même delta, y compris avec un zoom différent. Les terminaux restent utilisables et gardent leurs processus.
4. Double-clique le nom, renomme et valide. Ctrl+Z puis Ctrl+Y rétablissent déplacement et groupe. Fermer un terminal puis annuler ne doit jamais recréer son processus.
5. Change de tableau, reviens, puis relance Orchestra : nom et membres sont conservés. **Dissocier sans fermer les cases** retire le cadre en conservant cases, liens et terminaux.
6. Enregistre un modèle d'équipe contenant un groupe et réutilise-le : le nouveau groupe ne référence que les nouvelles cases, avec de nouveaux identifiants. Supprimer un membre nettoie sa présence dans la sauvegarde ; un groupe vide disparaît.

7. Avec 7 cases, **3 par ligne** donne trois rangées : 3, 3 et 1 case centrée. La colonne centrée donne le même axe horizontal au centre de chaque case. Réappliquer le même modèle ne doit pas décaler le groupe progressivement. Les cases non sélectionnées restent en place.
8. Pour vérifier les grandes grilles sans lancer de CLI, utilise 16 puis 64 post-it : la grille adaptative affiche respectivement **4 × 4** et **8 × 8**. Le centre global de la sélection reste fixe et l'ordre des cases est conservé. Clique le nom d'un groupe existant pour sélectionner ses membres et choisir leur formation.

Les groupes sont des cadres visuels, sans permissions propres ni imbrication. Une case appartient au plus à un groupe. Les formations remplacent l'ancien système d'alignement à la demande de l'utilisateur. Elles réservent 360 unités horizontalement et 120 verticalement entre les cellules, pour garder les étiquettes de lien utilisables. Le modèle s'applique au clic ; aucun réarrangement permanent n'empêche les déplacements manuels ensuite. Les positions sont sauvegardées avec le tableau et annulables par Ctrl+Z/Y ; aucun agent n'est relancé.

## 4.3 — Configuration d'origine et visite visuelle

Restauration demandée par l'utilisateur après essai : le nouvel assistant dossier/agent/équipe a été retiré. Le parcours d'origine est conservé, avec un dossier facultatif et les indications de commandes installées du sélecteur d'agents.

1. **Paramètres → Général → Refaire la configuration initiale** : retrouver les pages langue, thème, police, grille, halo et agents, avec leurs aperçus d'origine. Aucun tableau n'est supprimé ni agent lancé.
2. Sur la bienvenue, choisir facultativement un dossier. Le dossier actif et la racine de l'explorateur suivent ; annuler le choix conserve le dossier précédent.
3. Passer les pages, choisir un thème et une police : application immédiate et mémorisation après fermeture. La page Agents garde les cases à cocher et les indications installé/non installé, même sans CLI disponible.
4. **Terminer**, ou **Passer** depuis la bienvenue, lance la visite visuelle à bulles et halos. Ses étapes pour poser les agents et créer leur premier échange sont conservées. Quitter reste possible.
5. **Paramètres → Général → Refaire la visite** ouvre directement les bulles, sans repasser par la configuration. Le second bouton permet de refaire séparément la configuration.
6. Relancer Orchestra : aucun retour automatique de l'assistant après fin ou abandon de la visite. Langue, apparence et tableaux existants sont conservés.

Les parcours automatisés EN/FR vérifient ces pages, le choix du dossier, le changement de thème, les agents absents simulés, les deux boutons de réouverture, Passer, la visite et le rechargement. Aucun CLI IA n'est lancé.

## 4.4 — Export et diff depuis le début d'une tâche

### Export du journal

1. Produis quelques échanges et annulations. Dans le Journal, filtre par tableau, case et type ; clique sur un identifiant de tâche si souhaité.
2. Clique **Exporter le journal** : le dialogue indique le nombre visible et rappelle le contenu potentiellement privé. Aucun fichier n'est écrit à ce stade.
3. Clique **Choisir le fichier et exporter**, choisis une destination `.json`. Vérifie `filter`, `exportedAt` et `events` : seulement les événements filtrés, mêmes identifiants de tâche et état final de l'échange. Un filtre sur le type de demande conserve l'état connu de sa réponse même si cette réponse est masquée par le filtre.
4. Annule le sélecteur de fichier : aucun nouveau fichier ni écrasement de l'export précédent. Effacer les filtres ne supprime rien du Journal. Fermer et relancer l'app ne restaure pas le Journal en mémoire : seul l'export volontaire conserve ces événements.

### Référence de tâche

1. Dans un dépôt de test, modifie un fichier suivi **sans commit**, et crée un petit fichier non suivi. Crée une tâche manuelle affectée à une case de ce dépôt ; démarre son suivi **avant** d'envoyer la consigne. La référence doit être indiquée disponible.
2. Modifie de nouveau le fichier, modifie le fichier non suivi, crée un autre fichier et supprime un fichier présent au départ. **Changements depuis le début** ne montre que les différences depuis la capture : les modifications déjà présentes au démarrage ne sont pas comptées comme nouvelles.
3. Pour un relais ou une délégation, la référence est capturée avant collage effectif, après l'attente éventuelle de disponibilité de la cible. Les messages restent annulables avant le collage, y compris pendant la préparation de référence. Une permission apparue pendant la capture empêche le collage.
4. Deux cases dans le même worktree, y compris depuis un sous-dossier : l'indication de dossier partagé apparaît. Le diff indique sa racine et la date de référence, sans attribuer les changements à l'agent.
5. Un binaire modifié est signalé sans diff textuel. Un fichier au-delà de 200 Ko, un lien symbolique ou un fichier ignoré par Git n'obtient pas de faux aperçu. Une référence partielle affiche un avertissement ; les aperçus restent limités à 2 000 lignes et 4 000 caractères par ligne.
6. Ouvre le diff d'une tâche non démarrée, d'une ancienne tâche sans référence ou d'une référence expirée : message explicite, aucun remplacement silencieux par HEAD. Une tâche hors dépôt Git reste suivie mais ne dispose pas de ce diff.

Références dans `task-snapshots`, jusqu'à 20 références, 500 fichiers et 8 Mo de contenu par référence, 200 Ko par fichier. Les références anciennes expirent quand de nouvelles sont créées. Leurs contenus peuvent être privés : ils sont conservés localement, séparément du journal et des sauvegardes de tableaux. La capture n'est pas atomique : évite de modifier simultanément les fichiers pendant sa préparation. Aucune écriture Git (commit, stash, index) n'est nécessaire.

## Points restant à valider par l'utilisateur

- Essais avec les vrais agents Claude/Codex et les modèles d'équipes.
- Choix et annulation du sélecteur natif d'export sur le bureau.
- Fermeture/réouverture complète avec ses données habituelles.
- macOS et installateur non testés par l'assistant.

## Correctif du launcher Windows

Le launcher a été recompilé. Il prépare une copie locale `node_modules/electron/dist/Orchestra.exe` avec le nom produit et le logo Orchestra, puis la lance. La copie réutilise les bibliothèques Electron existantes ; l'original `electron.exe` reste intact. Elle ajoute environ 250 Mo dans un dossier ignoré et n'est régénérée qu'en cas de changement du runtime, du logo ou de la version.

1. Fermer complètement l'ancienne instance d'Orchestra, puis lancer **le launcher.exe de ce worktree update3**. Ne pas tester avec un launcher d'une autre branche.
2. Vérifier nom et logo dans la barre des tâches, Alt+Tab et le Gestionnaire des tâches. Si un ancien raccourci épinglé garde encore son ancienne icône, le désépingler puis épingler la nouvelle fenêtre.
3. Quitter et relancer : le runtime doit être réutilisé, sans nouvelle préparation complète. Aucun agent ou processus ouvert n'est fermé par le lanceur pour mettre à jour son runtime.
4. La préparation se reproduit après un `npm ci` ou un changement de version/logo. Si l'ancien `Orchestra.exe` est encore ouvert lors d'une telle mise à jour, un message demande sa fermeture au lieu de le remplacer ou de tuer ses agents.

Vérifié automatiquement : nom produit, neuf tailles d'icônes, original Electron inchangé, cache, régénération et douze parcours Electron via la copie réelle. Windows extrait bien le logo Orchestra du fichier ; les propriétés de barre des tâches et de relancement sont contrôlées. Le mode Node utilisé par les serveurs MCP reste fonctionnel. L'affichage avec les raccourcis et la session habituelle de l'utilisateur nécessite encore son retest.

Après validation manuelle, commit proposé : `feat: add lightweight task tracking and task reports`. `PLAN.md`, `AGENTS.md` et `CLAUDE.md` restent privés et ignorés ; ne pas les forcer dans le commit.
