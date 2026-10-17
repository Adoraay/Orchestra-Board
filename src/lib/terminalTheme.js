// xterm ne lit pas le CSS : on lui passe les valeurs des variables de theme.css.
const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// '#c96442' + 0.3 -> 'rgba(201, 100, 66, 0.3)'
function withAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function terminalTheme() {
  const accent = cssVar('--accent');
  return {
    background: cssVar('--terminal-bg'),
    foreground: cssVar('--text'),
    cursor: accent,
    cursorAccent: cssVar('--terminal-bg'),
    selectionBackground: withAlpha(accent, 0.3),
  };
}

export const terminalFont = () => cssVar('--font-mono');
