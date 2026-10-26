# Tâches préparées / Prepared tasks

Une tâche est une suite de prompts enregistrée. Orchestra attend la fin de la réponse à chaque prompt avant d’envoyer le suivant, au même agent ou à un autre. Les agents compatibles sont Claude Code et Codex, dont les hooks permettent de suivre les réponses. Les agents doivent être lancés ; une case restaurée qui attend ton choix de reprise doit d’abord être ouverte.

## Préparer et lancer

1. Lance les agents destinataires sur tes tableaux et donne-leur des noms reconnaissables.
2. Ouvre **Tâches** dans la barre du haut, puis **Nouvelle tâche**.
3. Donne un nom à la tâche. Choisis un départ au clic sur **Lancer**, ou après la fin d’un agent précis. Si cet agent est inactif, sa prochaine réponse sera attendue.
4. Choisis l’agent de la première étape et écris son prompt.
5. Clique sur **Ajouter une étape**. Choisis le même agent ou un autre, puis son prompt. **Joindre la réponse précédente** transmet la réponse avec tes consignes. **Attendre ma validation** bloque l’envoi jusqu’au clic sur **Valider et envoyer cette étape**.
6. Réordonne les étapes avec les flèches, puis **Enregistrer** et **Lancer**.

La fenêtre peut être fermée pendant l’exécution. Le moteur continue tant qu’Orchestra reste ouvert, même si tu changes de tableau. Rouvre **Tâches** et sélectionne la tâche pour suivre sa progression et consulter les réponses. **Dupliquer** prépare une nouvelle tâche indépendante et permet de changer les agents.

Dans la version 0.1.3, **Suivi et historique** ouvre le suivi des tâches préexistant, avec ses dépendances, résultats et comparaisons de fichiers depuis leur début. Les séquences utilisent un stockage distinct et ne modifient pas cet historique.

Les boutons Tâches, Rechercher, Équipes, Réception et Paramètres sont des icônes compactes. **Paramètres → Apparence → Agrandir les boutons de la barre au survol** active ou désactive l’apparition de leurs noms au survol/focus clavier. Le réglage est appliqué immédiatement et conservé après redémarrage.

## Pause, arrêt et reprise

- **Mettre en pause** empêche l’envoi de l’étape suivante. Un prompt déjà collé est soumis normalement et l’agent termine sa réponse. **Reprendre** continue la séquence.
- **Arrêter la séquence** retire ses messages qui n’ont pas commencé à être envoyés. Cela ne tue pas l’agent et ne rappelle pas un prompt déjà remis.
- Si un agent travaille ou attend une permission, les envois attendent. Orchestra n’approuve jamais les permissions à ta place.
- Si un agent est fermé, change de session, ou reçoit un nouveau prompt pendant une étape en cours, la séquence s’arrête avec une explication. Si l’envoi n’est pas confirmé par le CLI, vérifie son terminal avant de relancer.
- Après fermeture complète d’Orchestra, un lancement actif devient **Interrompu**. Aucun prompt n’est renvoyé automatiquement. **Relancer depuis le début** demande confirmation et renvoie toutes les étapes ; vérifie le travail déjà effectué avant de choisir cette option.

Une fin de réponse n’est pas une validation de la qualité du travail. Utilise une étape de relecture ou une validation manuelle si nécessaire. Les liens en Transmission automatique ne partent pas pour les tours gérés par une tâche : les étapes définissent explicitement le passage de relais. Les délégations utilisées par l’agent pendant son travail restent disponibles.

## Stockage et limites

Les tâches et leur dernier lancement sont enregistrés dans `task-sequences.json`, dans le dossier de données d’Orchestra. Les anciennes données `tasks.json` ne sont ni converties ni supprimées. Limites : 50 tâches, 50 étapes par tâche, 20 000 caractères par prompt et par réponse conservée/jointe. Une réponse plus longue est tronquée. Une réponse absente bloque une étape qui demande de la joindre. Si le stockage est illisible ou ne peut plus être sauvegardé, l’exécution est désactivée et le fichier existant est préservé.

Plusieurs tâches peuvent être lancées. Elles partagent la file d’envoi des relais et délégations : un terminal est réservé pendant le collage, la réponse et sa lecture. Évite de saisir un autre prompt à la main dans un agent pendant qu’une étape l’utilise.

## Vérification manuelle avec les vrais agents

1. **Même agent :** prépare deux étapes pour un Claude : « Réponds uniquement PREMIER », puis « Réponds uniquement SECOND ». Lance. Attendu : un seul prompt à la fois, deux réponses enregistrées, tâche terminée.
2. **Autre agent :** Claude Dev reçoit « Écris une phrase de présentation ». Claude Reviewer reçoit « Traduis la réponse en anglais », avec la réponse précédente jointe. Attendu : le reviewer reçoit ta consigne et la réponse du développeur après sa fin.
3. **Déclencheur :** choisis un Claude actif comme déclencheur et un autre comme destinataire. Attendu : aucun envoi avant la fin du déclencheur ; une seule séquence est lancée. Avec un agent inactif, sa prochaine réponse est attendue.
4. **Validation :** coche la validation sur l’étape 2. Attendu : l’étape attend ton clic après la réponse 1.
5. **Pause :** pendant la réponse 1, mets en pause. Attendu : la réponse est conservée, aucune étape 2 avant **Reprendre**. Essaie aussi de mettre en pause un envoi en attente d’un agent occupé.
6. **Arrêt :** arrête pendant la réponse 1. Attendu : l’agent continue mais l’étape 2 ne part jamais.
7. **Permission :** provoque une demande de permission dans une étape. Attendu : la suite reste en attente jusqu’à ton intervention puis à la réponse finale.
8. **Concurrence :** lance deux tâches vers le même agent. Attendu : les prompts et leurs réponses restent distincts, aucun collage mélangé.
9. **Fermeture d’agent :** ferme une case utilisée. Attendu : tâche bloquée avec explication, aucune suite envoyée.
10. **Persistance :** enregistre une tâche, ferme et rouvre Orchestra. Attendu : modèle conservé ; si une séquence tournait, état **Interrompu**, aucun nouvel envoi automatique.
11. **Interface :** duplique, réordonne, supprime une étape ; modifie un prompt puis ferme la fenêtre. Attendu : choix d’abandon des modifications non enregistrées. Vérifie aussi le français, l’anglais et le thème clair.

## Automated checks

Run `node --test tests/task-sequences.test.cjs` for the scheduler and shared queue. Run `npm run build`, then `node tests/ui-task-sequences.cjs` for the real Electron renderer, preload, IPC and local HTTP hooks, using isolated temporary profiles and simulated agents. These UI checks cover English, French and the light theme without calling an AI model. Screenshots are written to `out/task-sequences/`.

The real Claude/Codex prompt submission, platform-specific CLI behavior and model responses still require the manual checks above. macOS and installers are not covered by these Windows checks.
