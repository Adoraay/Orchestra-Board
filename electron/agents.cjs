// Catalogue côté processus principal : quelle commande lancer pour chaque agent.
// C'est le seul endroit à modifier pour ajouter un agent (+ src/agents.js pour l'affichage).
// La commande est tapée dans un shell, donc le binaire doit être dans ton PATH.
module.exports = {
  'claude-code': { command: 'claude' },
  codex: { command: 'codex' },
  gemini: { command: 'gemini' },
  shell: { command: null }, // juste un terminal vide
};
