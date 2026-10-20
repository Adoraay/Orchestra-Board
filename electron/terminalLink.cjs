const { t } = require('./i18n.cjs');

// Lien Terminal (PLAN.md §3.17) : un agent relié à une case Terminal y lance ses commandes, visibles par
// l'utilisateur. Outils MCP list_terminals, run_in_terminal, read_terminal, interrupt_terminal, appelés via
// le serveur local comme ceux de la Délégation ; chaque appel est vérifié contre les liens de la map.
const QUIET_DELAY = 1500; // ms sans sortie : fini si l'invite n'est pas reconnue, sinon « tourne encore »
const SETTLE_DELAY = 200; // ms de calme après le retour de l'invite
const DEFAULT_WAIT = 30; // s
const MAX_WAIT = 300; // s
const MAX_OUTPUT = 20000; // caractères renvoyés à l'agent
const DEFAULT_LINES = 50;
const MAX_LINES = 500;
const MAX_COMMAND = 4000;

let deps = { write: () => {}, buffer: () => null, info: () => null, arm: () => {}, emit: () => {}, log: () => {} };
let terminals = new Map(); // id d'une case Terminal -> { name, cwd }
let reachable = new Map(); // agent -> [{ id (lien), target }]
const running = new Map(); // case Terminal -> { output } : run_in_terminal en cours
const knownPrompts = new Set(); // cases Terminal dont l'invite du shell a été reconnue au moins une fois

// write(id, data), buffer(id) : dernières sorties, info(id) : statut ou null si pas lancé,
// arm(id) : la sortie qui suit = travaille, emit(linkId, event) : animation du lien,
// log(entrée) : journal des échanges (activityLog).
function init(d) {
  deps = d;
}

// Appelé à chaque sauvegarde de workspace.json (déjà validé), tous tableaux confondus.
function setWorkspace(workspace, agentName) {
  terminals = new Map();
  reachable = new Map();
  for (const board of workspace.boards) {
    for (const node of board.nodes) {
      if (node.type === 'terminal' && node.data.agentId === 'shell') {
        terminals.set(node.id, { name: node.data.label || agentName('shell'), cwd: node.data.worktree ?? node.data.cwd });
      }
    }
    for (const edge of board.edges) {
      if (edge.data.mode !== 'terminal' || !terminals.has(edge.target)) continue;
      reachable.set(edge.source, [...(reachable.get(edge.source) ?? []), { id: edge.id, target: edge.target }]);
    }
  }
}

const isTool = (name) => ['list_terminals', 'run_in_terminal', 'read_terminal', 'interrupt_terminal'].includes(name);
const result = (text, isError = false) => ({ text, isError });
const linksOf = (caller) => reachable.get(caller) ?? [];
const normalize = (name) => String(name ?? '').trim().toLowerCase();

// Codes ANSI (couleurs, curseur, titres) retirés : l'agent lit du texte simple.
function clean(text) {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b[@-Z\\-_=>]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Invite du shell en dernière ligne (PS C:\…>, C:\…>, user@pc:~$, %, ❯) : le shell attend une commande.
// Une invite personnalisée non reconnue : on retombe sur « le calme = fini ».
const PROMPT = /[>$#%❯]$/;
const lines = (text) => clean(text).split('\n').map((l) => l.trimEnd()).filter(Boolean);
const atPrompt = (text) => PROMPT.test(lines(text).at(-1) ?? '');

// Le shell attend-il une commande ? true / false, ou null si son invite n'a jamais été reconnue.
function shellIdle(id) {
  if (running.has(id)) return false;
  if (atPrompt(deps.buffer(id) ?? '')) {
    knownPrompts.add(id);
    return true;
  }
  return knownPrompts.has(id) ? false : null;
}

const truncate = (text) => (text.length > MAX_OUTPUT ? `${t('terminal.truncated')}\n${text.slice(-MAX_OUTPUT)}` : text);

// Terminal relié à caller par son nom, avec les vérifications communes aux outils.
function findTerminal(caller, name) {
  const links = linksOf(caller);
  if (!links.length) return { error: result(t('terminal.none'), true) };
  const link = links.find((l) => normalize(terminals.get(l.target).name) === normalize(name));
  if (!link) {
    const names = links.map((l) => terminals.get(l.target).name).join(', ');
    return { error: result(t('terminal.unknown', { name, names }), true) };
  }
  const terminal = terminals.get(link.target);
  if (!deps.info(link.target)) return { error: result(t('terminal.notRunning', { name: terminal.name }), true) };
  return { link, terminal };
}

function listTerminals(caller) {
  const links = linksOf(caller);
  if (!links.length) return result(t('terminal.none'));
  const lines = links.map((l) => {
    const { name, cwd } = terminals.get(l.target);
    const state = !deps.info(l.target) ? t('terminal.state.stopped') : shellIdle(l.target) === false ? t('terminal.state.busy') : t('terminal.state.free');
    return `- ${name} (${t('delegate.folder', { value: cwd ?? '?' })} · ${state})`;
  });
  return result(`${t('terminal.list')}\n${lines.join('\n')}`);
}

// Tape la commande puis Entrée, et renvoie la sortie apparue jusqu'au retour de l'invite (ou jusqu'au calme
// si l'invite n'est pas reconnue, ou jusqu'au délai). Refusé tant qu'une commande tourne dans le terminal.
async function runInTerminal(caller, { name, command, wait_seconds: wait } = {}, signal) {
  const found = findTerminal(caller, name);
  if (found.error) return found.error;
  const { link, terminal } = found;
  if (typeof command !== 'string' || !command.trim()) return result(t('terminal.emptyCommand'), true);
  if (command.length > MAX_COMMAND) return result(t('terminal.tooLong', { max: MAX_COMMAND }), true);
  const idle = shellIdle(link.target);
  if (idle === false) {
    const text = t('terminal.busy', { name: terminal.name });
    deps.log({ kind: 'refused', linkId: link.id, from: caller, to: link.target, text });
    return result(text, true);
  }
  const promptAware = idle === true;

  const seconds = Math.min(MAX_WAIT, Math.max(1, Number.isFinite(wait) ? Math.round(wait) : DEFAULT_WAIT));
  const run = { output: '', onOutput: null };
  running.set(link.target, run);
  deps.emit(link.id, { state: 'sent', to: link.target });
  deps.log({ kind: 'command', linkId: link.id, from: caller, to: link.target, text: command.trim() });
  deps.arm(link.target);
  deps.write(link.target, command.trim().replace(/\r?\n/g, '\r') + '\r');

  // 'done', 'running' (calme sans invite) ou 'timeout'.
  const outcome = await new Promise((resolve) => {
    let quiet;
    const finish = (value) => {
      clearTimeout(quiet);
      clearTimeout(limit);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish('done');
    run.onOutput = () => {
      clearTimeout(quiet);
      // La première ligne est l'écho de la commande : l'invite qui revient vient après.
      if (promptAware && lines(run.output).length > 1 && atPrompt(run.output)) quiet = setTimeout(() => finish('done'), SETTLE_DELAY);
      else quiet = setTimeout(() => finish(promptAware ? 'running' : 'done'), QUIET_DELAY);
    };
    const limit = setTimeout(() => finish('timeout'), seconds * 1000);
    signal?.addEventListener('abort', abort);
    run.onOutput();
  });
  running.delete(link.target);
  deps.emit(link.id, { state: 'sent', to: caller });

  const output = truncate(clean(run.output)) || t('terminal.noOutput');
  const note = outcome === 'done' ? '' : outcome === 'timeout' ? t('terminal.stillRunning', { seconds }) : t('terminal.notFinished');
  const text = note ? `${output}\n\n${note}` : output;
  deps.log({ kind: 'output', linkId: link.id, from: link.target, to: caller, text });
  return result(text);
}

function readTerminal(caller, { name, lines } = {}) {
  const found = findTerminal(caller, name);
  if (found.error) return found.error;
  const count = Math.min(MAX_LINES, Math.max(1, Number.isFinite(lines) ? Math.round(lines) : DEFAULT_LINES));
  const text = clean(deps.buffer(found.link.target) ?? '').split('\n').slice(-count).join('\n');
  return result(truncate(text) || t('terminal.noOutput'));
}

function interruptTerminal(caller, { name } = {}) {
  const found = findTerminal(caller, name);
  if (found.error) return found.error;
  deps.write(found.link.target, '\x03');
  knownPrompts.delete(found.link.target); // invite changée entre-temps : on ne reste pas « occupé » pour toujours
  deps.emit(found.link.id, { state: 'sent', to: found.link.target });
  deps.log({ kind: 'interrupt', linkId: found.link.id, from: caller, to: found.link.target, text: 'Ctrl+C' });
  return result(t('terminal.interrupted', { name: found.terminal.name }));
}

// Sortie d'une case : comptée pour la commande en cours, s'il y en a une.
function onOutput(id, data) {
  const run = running.get(id);
  if (!run) return;
  run.output = (run.output + data).slice(-4 * MAX_OUTPUT);
  run.onOutput?.();
}

async function callTool(caller, name, args, signal) {
  switch (name) {
    case 'list_terminals': return listTerminals(caller);
    case 'run_in_terminal': return runInTerminal(caller, args, signal);
    case 'read_terminal': return readTerminal(caller, args);
    case 'interrupt_terminal': return interruptTerminal(caller, args);
  }
}

module.exports = { init, setWorkspace, isTool, callTool, onOutput };
