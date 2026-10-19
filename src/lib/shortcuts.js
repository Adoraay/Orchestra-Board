// Raccourcis clavier, affichés dans Paramètres › Raccourcis et dans les infobulles.
// Ceux de « Partout » marchent même dans un terminal : ils évitent les Ctrl+lettre utilisés par les CLI
// (Claude Code prend Ctrl+T, Ctrl+R, Ctrl+O…).
export const SHORTCUT_GROUPS = [
  {
    title: 'Partout',
    items: [
      { keys: ['Ctrl', 'Tab'], label: 'Tableau suivant' },
      { keys: ['Ctrl', 'Maj', 'Tab'], label: 'Tableau précédent' },
      { keys: ['Ctrl', '1…9'], label: 'Aller au tableau 1 à 8, 9 = le dernier' },
      { keys: ['Ctrl', 'Maj', 'T'], label: 'Nouveau tableau' },
      { keys: ['Ctrl', ','], label: 'Paramètres' },
      { keys: ['Ctrl', 'Maj', 'E'], label: 'Afficher / masquer les documents' },
      { keys: ['Ctrl', 'Maj', 'A'], label: 'Afficher / masquer les agents actifs' },
      { keys: ['Ctrl', 'Maj', 'U'], label: "Afficher / masquer l'utilisation" },
    ],
  },
  {
    title: 'Map (hors terminal et champ de texte)',
    items: [
      { keys: ['V'], label: 'Sélection' },
      { keys: ['P'], label: 'Stylo' },
      { keys: ['N'], label: 'Post-it' },
      { keys: ['T'], label: 'Texte' },
      { keys: ['L'], label: 'Lien' },
      { keys: ['F'], label: 'Afficher toutes les cases' },
      { keys: ['Échap'], label: "Revenir à l'outil Sélection" },
      { keys: ['Suppr'], label: 'Supprimer la sélection (cases comprises), après confirmation' },
      { keys: ['F2'], label: 'Renommer la case terminal choisie (marche aussi dans son terminal)' },
      { keys: ['Ctrl', 'Z'], label: 'Annuler' },
      { keys: ['Ctrl', 'Y'], label: 'Rétablir (ou Ctrl+Maj+Z)' },
    ],
  },
  {
    title: 'Terminal',
    items: [
      { keys: ['Ctrl', 'C'], label: "Copier la sélection (sans sélection : interrompre, comme d'habitude)" },
      { keys: ['Ctrl', 'Maj', 'C'], label: 'Copier la sélection' },
      { keys: ['Ctrl', 'V'], label: 'Coller (ou Ctrl+Maj+V)' },
    ],
  },
];
