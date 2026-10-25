const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

// Paramètres de l'app (PLAN.md §3.3), dans userData/settings.json.
// Agents de base : toujours présents, seuls leur ordre et « masqué » sont modifiables.
// resumeArgs : capacité de reprise ; main.cjs impose la session exacte pour Claude/Codex,
// les autres CLI utilisent leurs propres arguments.
// hooks : 'claude' ou 'codex' = statut, réponses et orchestration par les hooks et le serveur MCP de l'agent
// (sinon statut déduit de l'activité du terminal).
const BUILTIN_AGENTS = [
  { id: 'claude-code', name: 'Claude Code', command: 'claude', color: '#d97757', resumeArgs: '--continue', hooks: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex', color: '#10a37f', resumeArgs: 'resume --last', hooks: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', color: '#4285f4', resumeArgs: '--resume latest' },
  { id: 'shell', name: 'Terminal', command: null, color: '#8b93a7' }, // juste un terminal vide
];

// Catalogue : agents connus, absents du dock tant qu'on ne les ajoute pas (Paramètres › Agents). Logos dans
// src/assets/agents/<id>, descriptions dans src/locales (catalog.<id>). resumeArgs seulement quand l'option de reprise est sûre.
const CATALOG_AGENTS = [
  { id: 'antigravity', name: 'Antigravity', command: 'agy', color: '#3186ff', resumeArgs: '--continue' }, // successeur de Gemini CLI
  { id: 'aider', name: 'Aider', command: 'aider', color: '#14b014', resumeArgs: '--restore-chat-history' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen', color: '#615ced' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', color: '#8b93a7', resumeArgs: '--continue' },
  { id: 'copilot', name: 'GitHub Copilot CLI', command: 'copilot', color: '#8b93a7', resumeArgs: '--continue' },
  { id: 'cursor', name: 'Cursor CLI', command: 'cursor-agent', color: '#8b93a7' },
  { id: 'hermes', name: 'Hermes Agent', command: 'hermes', color: '#8b93a7' },
  { id: 'goose', name: 'Goose', command: 'goose session', color: '#8b93a7' },
  { id: 'amp', name: 'Amp', command: 'amp', color: '#f34e3f' },
  { id: 'kimi', name: 'Kimi CLI', command: 'kimi', color: '#1783ff' },
];

const DEFAULTS = {
  // glow : points de la grille colorés autour de la souris, glowColor null = couleur d'accent, glowSize = rayon en px.
  appearance: { theme: 'standard', accent: null, terminalFontSize: 13, grid: 'dots', glow: true, glowColor: null, glowSize: 110 },
  general: { language: 'en', rootPath: null, shell: 'default', confirmClose: true, notifySound: true, notifyDesktop: true, linkMode: 'relay', trustFolders: true, codexOrchestration: true, pinned: {} },
};

const THEMES = ['standard', 'light', 'chatgpt', 'gemini', 'vscode', 'github', 'dracula', 'nord'];
const GRIDS = ['dots', 'lines', 'none'];
const SHELLS = ['default', 'powershell', 'pwsh', 'cmd', 'bash'];
const LANGUAGES = ['en', 'fr']; // langue de l'interface (PLAN.md §3.15), anglais par défaut
const LINK_MODES = ['relay', 'delegate']; // type des nouveaux liens (PLAN.md §3.11)
const PANELS = ['log', 'usage', 'agentsBar']; // panneaux qui peuvent rester épinglés ouverts
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const CUSTOM_ID = /^custom-[a-z0-9]{4,32}$/;
const LOGO_FILE = /^custom-[a-z0-9]{4,32}\.(png|jpg|jpeg|svg|webp|gif)$/;
// Nom de modèle passé à --model (Claude Code) ou -m (Codex) : un alias (« opus ») ou un nom complet.
const MODEL = /^[a-z0-9][\w.\-\[\]]{0,63}$/i;

const filePath = () => path.join(app.getPath('userData'), 'settings.json');
const logosDir = () => path.join(app.getPath('userData'), 'logos');

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\r\n]/.test(value);

function sanitizeAgents(input) {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const agents = [];

  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || seen.has(raw.id)) continue;
    const builtin = BUILTIN_AGENTS.find((b) => b.id === raw.id);
    const catalog = CATALOG_AGENTS.find((c) => c.id === raw.id);
    if (builtin) {
      agents.push({ ...builtin, builtin: true, hidden: raw.hidden === true, logo: null });
    } else if (catalog) {
      agents.push({ ...catalog, builtin: false, catalog: true, hidden: raw.hidden === true, logo: null });
    } else if (CUSTOM_ID.test(raw.id) && isText(raw.name, 40) && isText(raw.command, 200)) {
      agents.push({
        id: raw.id,
        name: raw.name.trim(),
        command: raw.command.trim(),
        color: HEX_COLOR.test(raw.color) ? raw.color.toLowerCase() : '#8b93a7',
        builtin: false,
        hidden: raw.hidden === true,
        logo: typeof raw.logo === 'string' && LOGO_FILE.test(raw.logo) ? raw.logo : null,
      });
    } else {
      continue;
    }
    seen.add(raw.id);
  }

  // Un agent de base absent du fichier (première ouverture, ou nouvel agent de base) est ajouté à la fin.
  for (const builtin of BUILTIN_AGENTS) {
    if (!seen.has(builtin.id)) agents.push({ ...builtin, builtin: true, hidden: false, logo: null });
  }
  return agents;
}

// Modèle choisi dans le dock pour chaque agent qui le permet (Claude Code, Codex) : agent -> modèle.
function sanitizeModels(input, agents) {
  const models = {};
  for (const agent of agents) {
    const model = input?.[agent.id];
    if (agent.hooks && typeof model === 'string' && MODEL.test(model)) models[agent.id] = model;
  }
  return models;
}

function sanitizeRoot(rootPath) {
  try {
    if (typeof rootPath === 'string' && path.isAbsolute(rootPath) && fs.statSync(rootPath).isDirectory()) return rootPath;
  } catch {}
  return null;
}

// Tout ce qui vient du disque ou de l'interface passe par ici : une valeur invalide reprend sa valeur par défaut.
function sanitize(input) {
  const a = { ...DEFAULTS.appearance, ...(input?.appearance ?? {}) };
  const g = { ...DEFAULTS.general, ...(input?.general ?? {}) };
  const fontSize = Number(a.terminalFontSize);
  const glowSize = Number(a.glowSize);
  const agents = sanitizeAgents(input?.agents);

  return {
    version: 2,
    appearance: {
      theme: pick(a.theme, THEMES, DEFAULTS.appearance.theme),
      accent: typeof a.accent === 'string' && HEX_COLOR.test(a.accent) ? a.accent.toLowerCase() : null,
      terminalFontSize: Number.isInteger(fontSize) && fontSize >= 10 && fontSize <= 24 ? fontSize : DEFAULTS.appearance.terminalFontSize,
      grid: pick(a.grid, GRIDS, DEFAULTS.appearance.grid),
      glow: a.glow !== false,
      glowColor: typeof a.glowColor === 'string' && HEX_COLOR.test(a.glowColor) ? a.glowColor.toLowerCase() : null,
      glowSize: Number.isInteger(glowSize) && glowSize >= 40 && glowSize <= 240 ? glowSize : DEFAULTS.appearance.glowSize,
    },
    agents,
    models: sanitizeModels(input?.models, agents),
    general: {
      language: pick(g.language, LANGUAGES, DEFAULTS.general.language),
      rootPath: sanitizeRoot(g.rootPath),
      shell: pick(g.shell, SHELLS, DEFAULTS.general.shell),
      confirmClose: g.confirmClose !== false,
      notifySound: g.notifySound !== false,
      notifyDesktop: g.notifyDesktop !== false,
      linkMode: pick(g.linkMode, LINK_MODES, DEFAULTS.general.linkMode),
      trustFolders: g.trustFolders !== false,
      codexOrchestration: g.codexOrchestration !== false,
      // Tutoriel du premier lancement (PLAN.md §3.21) : un settings.json d'avant le tutoriel = déjà fait.
      tutorialDone: typeof g.tutorialDone === 'boolean' ? g.tutorialDone : input != null,
      // Mises à jour (PLAN.md §3.22) : oui par défaut.
      checkUpdates: g.checkUpdates !== false,
      pinned: Object.fromEntries(PANELS.map((panel) => [panel, g.pinned?.[panel] === true])),
    },
  };
}

function load() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(filePath(), 'utf8')));
  } catch {
    return sanitize(null); // pas encore de fichier, ou fichier illisible
  }
}

// Écriture dans un fichier temporaire puis renommage : jamais de settings.json à moitié écrit.
function save(settings) {
  const clean = sanitize(settings);
  const tmp = filePath() + '.tmp';
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2));
  fs.renameSync(tmp, filePath());
  return clean;
}

// Orchestration Codex désactivée : Codex est lancé sans profil (`codex` tout court), comme un agent sans hooks.
// Le profil force Codex en mode intégré, sans le serveur partagé ni son « Agent command center » (flèche ←).
// Même règle côté interface dans SettingsContext.
function findAgent(settings, id) {
  const agent = settings.agents.find((a) => a.id === id);
  if (agent?.hooks === 'codex' && !settings.general.codexOrchestration) return { ...agent, hooks: null };
  return agent;
}

function register() {
  ipcMain.handle('settings:get', () => load());
  ipcMain.handle('settings:set', (_e, settings) => save(settings));
  ipcMain.handle('agents:catalog', () => CATALOG_AGENTS);
}

module.exports = { register, load, findAgent, logosDir, CUSTOM_ID, LOGO_FILE, MODEL };
