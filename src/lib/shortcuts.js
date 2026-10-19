// Raccourcis clavier, affichés dans Paramètres › Raccourcis (textes dans src/locales : shortcuts.* et shortcut.*).
// Ceux de « Partout » marchent même dans un terminal : ils évitent les Ctrl+lettre utilisés par les CLI
// (Claude Code prend Ctrl+T, Ctrl+R, Ctrl+O…). Shift, Esc et Del sont traduits à l'affichage (key.*).
export const SHORTCUT_GROUPS = [
  {
    title: 'shortcuts.everywhere',
    items: [
      { keys: ['Ctrl', 'Tab'], label: 'shortcut.nextBoard' },
      { keys: ['Ctrl', 'Shift', 'Tab'], label: 'shortcut.previousBoard' },
      { keys: ['Ctrl', '1…9'], label: 'shortcut.goToBoard' },
      { keys: ['Ctrl', 'Shift', 'T'], label: 'shortcut.newBoard' },
      { keys: ['Ctrl', ','], label: 'shortcut.settings' },
      { keys: ['Ctrl', 'Shift', 'E'], label: 'shortcut.toggleFiles' },
      { keys: ['Ctrl', 'Shift', 'A'], label: 'shortcut.toggleAgents' },
      { keys: ['Ctrl', 'Shift', 'U'], label: 'shortcut.toggleUsage' },
    ],
  },
  {
    title: 'shortcuts.map',
    items: [
      { keys: ['V'], label: 'tool.select' },
      { keys: ['P'], label: 'tool.pen' },
      { keys: ['N'], label: 'tool.note' },
      { keys: ['T'], label: 'tool.text' },
      { keys: ['L'], label: 'tool.link' },
      { keys: ['F'], label: 'shortcut.fitView' },
      { keys: ['Esc'], label: 'shortcut.escape' },
      { keys: ['Del'], label: 'shortcut.delete' },
      { keys: ['F2'], label: 'shortcut.rename' },
      { keys: ['Ctrl', 'Z'], label: 'shortcut.undo' },
      { keys: ['Ctrl', 'Y'], label: 'shortcut.redo' },
    ],
  },
  {
    title: 'shortcuts.terminal',
    items: [
      { keys: ['Ctrl', 'C'], label: 'shortcut.copyOrInterrupt' },
      { keys: ['Ctrl', 'Shift', 'C'], label: 'shortcut.copy' },
      { keys: ['Ctrl', 'V'], label: 'shortcut.paste' },
    ],
  },
];

export const TRANSLATED_KEYS = ['Shift', 'Esc', 'Del'];
