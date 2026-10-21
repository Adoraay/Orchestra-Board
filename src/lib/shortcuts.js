import { MOD_KEY, isMac } from './platform.js';

// Raccourcis clavier, affichés dans Paramètres › Raccourcis (textes dans src/locales : shortcuts.* et shortcut.*).
// Ceux de « Partout » marchent même dans un terminal : ils évitent les Ctrl+lettre utilisés par les CLI
// (Claude Code prend Ctrl+T, Ctrl+R, Ctrl+O…). Sur Mac, Cmd remplace Ctrl (sauf Ctrl+Tab).
// Shift, Esc et Del sont traduits à l'affichage (key.*).
export const SHORTCUT_GROUPS = [
  {
    title: 'shortcuts.everywhere',
    items: [
      { keys: ['Ctrl', 'Tab'], label: 'shortcut.nextBoard' },
      { keys: ['Ctrl', 'Shift', 'Tab'], label: 'shortcut.previousBoard' },
      { keys: [MOD_KEY, '1…9'], label: 'shortcut.goToBoard' },
      { keys: [MOD_KEY, 'Shift', 'T'], label: 'shortcut.newBoard' },
      { keys: [MOD_KEY, ','], label: 'shortcut.settings' },
      { keys: [MOD_KEY, 'Shift', 'E'], label: 'shortcut.toggleFiles' },
      { keys: [MOD_KEY, 'Shift', 'A'], label: 'shortcut.toggleAgents' },
      { keys: [MOD_KEY, 'Shift', 'U'], label: 'shortcut.toggleUsage' },
      { keys: [MOD_KEY, 'Shift', 'J'], label: 'shortcut.toggleLog' },
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
      { keys: [MOD_KEY, 'Z'], label: 'shortcut.undo' },
      isMac ? { keys: [MOD_KEY, 'Shift', 'Z'], label: 'shortcut.redoMac' } : { keys: ['Ctrl', 'Y'], label: 'shortcut.redo' },
    ],
  },
  {
    title: 'shortcuts.terminal',
    // Sur Mac, Cmd copie et colle (menu Édition), Ctrl reste au terminal.
    items: isMac
      ? [
          { keys: [MOD_KEY, 'C'], label: 'shortcut.copy' },
          { keys: [MOD_KEY, 'V'], label: 'shortcut.pasteMac' },
          { keys: ['Ctrl', 'C'], label: 'shortcut.interrupt' },
        ]
      : [
          { keys: ['Ctrl', 'C'], label: 'shortcut.copyOrInterrupt' },
          { keys: ['Ctrl', 'Shift', 'C'], label: 'shortcut.copy' },
          { keys: ['Ctrl', 'V'], label: 'shortcut.paste' },
        ],
  },
];

export const TRANSLATED_KEYS = ['Shift', 'Esc', 'Del'];
