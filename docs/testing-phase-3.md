# Vérifier la phase 3 de la 0.1.3

Branche de travail : `update3`. Les phases 1 et 2 ont été validées et commitées par l'utilisateur (`5986896`, `2a8b70d`). La phase 3 ne contient aucun commit effectué par l'assistant ; la phase 4 attend un nouveau go.

## Vérifications reproductibles

```powershell
npm test
npm run build
npm run test:ui
```

Pour les seuls parcours Electron de phase 3 : `npm run test:ui -- phase3 phase3-fr`.

Les tests unitaires (`tests/phase3.test.cjs`) couvrent le brouillon à valider (modification, envoi, abandon, lien retiré), l'annulation d'une délégation en file pendant que la cible travaille, le refus d'annuler un message déjà en cours de collage, le tableau de chaque événement du journal et les cas du diagnostic. Le parcours Electron utilise un profil temporaire : un « Writer » à hooks simulés (vrai serveur HTTP local) transmet à un vrai terminal cmd par un lien à valider ; il vérifie aussi les filtres, l'épinglage, le terminal agrandi, la recherche et l'onglet Diagnostic, en anglais et en français. Aucun modèle n'est sollicité. L'onglet Diagnostic lance seulement `claude --version`, `codex --version` et `gemini --version` s'ils sont installés. Captures dans `out/ui-smoke`.

## 3.1 — Relais avec validation et annulation des messages en attente

**Préparer et envoyer un brouillon**
1. Pose deux Claude Code (ou Claude Code puis Codex) et relie-les en **Transmission**. Écris une consigne, par exemple `Relis ceci : {reponse}`, puis coche **Valider avant l'envoi** dans le panneau du lien.
2. Demande quelque chose de court à la source. Quand elle a fini : la cible ne reçoit **rien**, l'étiquette du lien affiche « À valider pour … » (trait jaune pointillé), et un point apparaît sur la languette du Journal.
3. Ouvre le Journal : la section **En attente (1)** montre le message préparé. Modifie le texte, puis **Envoyer** : la cible reçoit exactement le texte modifié. Dans le journal, la même tâche passe par « À valider », « Transmission » puis « Remis ».
4. Clique sur l'étiquette du lien : le panneau montre aussi les messages en attente de ce lien.

**Refuser le suivant**
5. Redemande quelque chose à la source. Clique **Abandonner** (sur la pastille du lien, dans le Journal ou dans le panneau du lien) : rien ne part, une ligne « Annulé » apparaît, et le compteur de tours n'augmente pas.

**Annuler un message en file**
6. Décoche la validation, et mets la cible au travail (demande-lui une tâche un peu longue). Pendant qu'elle travaille, fais finir la source : le message apparaît « En file » dans le Journal.
7. Clique **Annuler**. Quand la cible a fini, vérifie que le message ne lui est **pas** collé.
8. Variante Délégation : un chef délègue à un agent occupé ; annule la demande en file. Le chef obtient « Annulé par l'utilisateur avant la livraison » via `wait_for_replies` au lieu d'attendre indéfiniment.
9. Un message « En cours de collage » ne propose plus d'annulation : un message déjà remis ne peut pas être rappelé.

**Résultat attendu** : le relais automatique (sans la case) fonctionne comme avant. Les brouillons et la file restent en mémoire : ils disparaissent à la fermeture d'Orchestra. Supprimer ou inverser le lien abandonne son brouillon.

**Valider directement sur le lien — ajout après revue de la phase 3**
1. Écarte assez les deux cases pour voir la pastille au milieu du lien, puis prépare un relais à valider. La pastille s'agrandit légèrement, présente un aperçu et les boutons **Envoyer / Abandonner** (**Send / Discard** en anglais).
2. Clique **Envoyer** : un seul message part vers la destination affichée, sans ouvrir le panneau. La pastille reprend son aspect habituel quand aucun brouillon ne reste. Un clic sur son en-tête ouvre toujours le panneau pour modifier le texte complet.
3. Prépare deux brouillons sur le même lien : le compteur affiche deux messages ; le premier aperçu correspond au plus ancien. Abandonne le premier : le second le remplace et reste à valider. Abandonne-le aussi : aucun des deux n'arrive à la cible.
4. Avec un lien bidirectionnel, vérifie la destination affichée pour chaque brouillon. Si les cases sont trop proches pour afficher une pastille, les actions restent disponibles dans le panneau et le Journal.
5. Pendant qu'un relais attend une cible occupée, ferme la cible : sa tâche finit en **refusé** dans le Journal, sans rester en attente. Une validation refusée conserve le brouillon et affiche l'erreur.

Les tests de régression vérifient aussi un lien supprimé, désactivé, redirigé ou vidé pendant le délai de lecture de la réponse, ainsi que l'activation de la validation pendant ce délai : aucun relais ne contourne le réglage actuel. Les tests Electron couvrent l'envoi et l'abandon depuis la pastille et plusieurs brouillons successifs, en anglais et en français.

## 3.2 — Filtres et états du journal

1. Après les échanges de 3.1 (dans deux tableaux si possible), ouvre le Journal puis l'icône **Filtres**.
2. Filtre par tableau, par case, puis par type (« Remis », « Annulé », « Réponse »…). Retire les filtres avec **Réinitialiser** : tous les événements sont toujours là.
3. Clique sur un identifiant `#xxxxxxxx` sous un message : seul le parcours de cette tâche reste affiché (puce « Tâche #… », × pour la retirer).
4. Chaque message porte l'état actuel de sa tâche : « à valider », « en attente », « envoyé » (après livraison effective), « réponse reçue » (Délégation), « annulé » ou « refusé ».
5. Les anciens événements sans tâche (commandes Terminal, notes, refus) restent lisibles et filtrables par type et par case.

## 3.3 — Terminal agrandi et recherche de case

**Terminal agrandi**
1. Dans une case active (un Claude au travail ou un simple Terminal), clique l'icône d'agrandissement de la barre de titre, ou appuie sur **Ctrl+Maj+M**.
2. Le terminal occupe la map, avec la même conversation et le même processus. Tape dedans, fais défiler, sélectionne et copie.
3. **Remettre en place** (ou Ctrl+Maj+M) : la case revient à sa taille et sa position d'origine, le terminal toujours actif. Échap n'est pas utilisé, car les CLI s'en servent (Claude Code l'utilise pour interrompre).

**Recherche**
4. **Ctrl+Maj+F** ou l'icône loupe de la barre du haut : tape une partie du nom d'une case d'un autre tableau, puis Entrée (ou clic). Le tableau s'ouvre et la map se centre sur la case, qui devient choisie.
5. Deux cases du même nom : les deux s'affichent, chacune avec son dossier et son tableau (le tableau ouvert en premier).
6. Un nom absent affiche « Aucune case ne porte ce nom. ». Les post-it sont aussi trouvables par leur nom.

## 3.4 — Épingler les panneaux

1. Ouvre le Journal et clique la punaise. Clique sur la map, travaille dans un terminal, attends plus de 3 s : le Journal reste ouvert.
2. Change de tableau : il reste ouvert. Ferme puis rouvre Orchestra : il est rouvert au démarrage.
3. Ouvre l'Utilisation : elle remplace le Journal sur le bord droit (un seul à la fois). Épinglée elle aussi, elle reste ouverte ; si les deux sont épinglés, le Journal est rouvert au démarrage.
4. Même chose avec la barre des agents actifs (punaise au début de la barre).
5. Désépingle : un clic ailleurs referme de nouveau le panneau après 3 s.
6. Avec le Journal ou l'Utilisation ouverts, le panneau d'un lien se place à leur gauche.

## 3.5 — Diagnostic des intégrations

1. Paramètres › **Diagnostic**. Pour chaque agent du dock : chemin de la commande trouvée, version (Claude Code, Codex, Gemini CLI et agents connus du catalogue), « hooks Orchestra » ou « sans hooks ».
2. **Commande introuvable** : ajoute un agent personnalisé avec une commande inexistante : « Commande introuvable » en rouge.
3. **Version inconnue / non vérifiée** : un agent personnalisé installé affiche « version non vérifiée » (sa commande n'est jamais lancée) ; un agent connu dont la sortie ne contient pas de version affiche « version inconnue ».
4. **Agent sans hooks** : lance Gemini CLI ou un Terminal : la section « Cases lancées » indique que son statut suit l'activité du terminal.
5. **Dernier hook** : lance un Claude Code, envoie-lui un message : « Dernier hook : UserPromptSubmit / Stop, il y a … » se met à jour toutes les 5 s. Juste après le lancement : « Aucun hook reçu depuis le lancement ». Après 5 min sans événement : « (calme depuis un moment) », sans conclure à une panne.

Le diagnostic n'envoie rien au modèle et n'affiche aucun contenu d'échange, seulement les noms des événements et leurs heures.

## Limites connues

- Brouillons, file d'attente et journal restent en mémoire : rien n'est repris après fermeture complète.
- Une Transmission vers un CLI sans hooks reste en file tant que la cible n'a pas fini d'après l'activité de son terminal.
- La version n'est lue que pour les agents de base et du catalogue jugés sûrs (`VERSION_SAFE` dans `electron/diagnostics.cjs`) ; Antigravity et Hermes affichent « version non vérifiée ».
- Non testé par l'assistant : vrais échanges Claude/Codex (consomment du quota), macOS et l'installateur.
