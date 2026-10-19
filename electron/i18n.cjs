// Textes produits côté Node (PLAN.md §3.15) : erreurs renvoyées à l'interface, notifications Windows,
// libellés d'utilisation, noms par défaut, et messages de l'orchestration. Ceux de l'interface sont dans
// src/locales. Une valeur est une chaîne avec des {variables} ou une fonction (pluriels).
const settingsStore = require('./settingsStore.cjs');

const DICTIONARIES = {
  en: {
    'agent.missing': 'Deleted agent',
    'board.defaultName': 'Board {n}',
    'notify.finished': '{name} finished its task',
    'dialog.pickRoot': 'Choose the root folder',
    'dialog.pickLogo': 'Choose a logo',
    'dialog.images': 'Images',

    'fs.folderNotFound': 'Folder not found',
    'fs.accessDenied': 'Access denied',
    'fs.itemNotFound': 'Item not found',
    'fs.nameInvalid': 'Invalid name',
    'fs.nameEmpty': 'The name cannot be empty',
    'fs.nameTooLong': 'Name too long',
    'fs.nameChars': 'These characters are not allowed: \\ / : * ? " < > |',
    'fs.nameEnd': 'The name cannot end with a dot or a space',
    'fs.nameReserved': '"{name}" is a name reserved by Windows',
    'fs.exists': '"{name}" already exists',
    'fs.createFailed': 'Could not create the folder (access denied?)',
    'fs.renameFailed': 'Could not rename (item open in another program?)',
    'fs.trashFailed': 'Could not move to the Recycle Bin (item open in another program?)',
    'fs.protectedDrive': 'A drive root cannot be changed',
    'fs.protectedHome': 'Your home folder cannot be changed',
    'fs.protectedRoot': 'This is the explorer root (or a folder that contains it)',
    'fs.protectedWorktree': 'Git worktree created by Orchestra: remove it with "git worktree remove"',
    'fs.protectedUsed': 'The tile "{name}" is working in this folder',

    'git.notRepo': 'This folder is not a Git repository',
    'git.noGit': 'Git was not found on this computer',
    'git.branchNotFound': 'Branch not found',
    'git.folderExists': 'The folder {path} already exists',
    'git.worktreeFailed': 'Could not create the worktree',

    'agents.invalid': 'Invalid agent',
    'agents.logoFormat': 'Unsupported format',
    'agents.logoTooBig': 'Image too large (1 MB max)',
    'agents.emptyCommand': 'Empty command',
    'agents.fileNotFound': 'File not found',
    'agents.notInPath': '"{program}" not found in the PATH',

    'link.targetGone': 'The target agent is no longer running',
    'link.targetNotRunning': 'The target agent is not running',
    'link.noReply': 'Reply not found in the transcript',

    'usage.session': 'Session (5 h)',
    'usage.weekAll': 'Week (all models)',
    'usage.weekOpus': 'Week (Opus)',
    'usage.weekSonnet': 'Week (Sonnet)',
    'usage.week': 'Week',
    'usage.days': '{n} days',
    'usage.hours': '{n} h',
    'usage.codexNote': 'Updated with every Codex reply.',
    'usage.geminiUnavailable': "Gemini CLI doesn't record its quota on this computer.",
    'usage.unknownAgent': 'No known quota for this agent.',
    'usage.noAnswer': "Claude didn't answer /usage.",

    // Orchestration : lus par les agents (et visibles dans leur terminal)
    'delegate.status.idle': 'free',
    'delegate.status.working': 'working',
    'delegate.status.waiting': 'waiting for a permission',
    'delegate.status.done': 'done',
    'delegate.notRunningStatus': 'not running',
    'delegate.youAre': 'You are "{name}" in Orchestra.',
    'delegate.noneReachable': 'No reachable agent: the user must draw a Delegation link from your tile on the Orchestra map.',
    'delegate.unknownAgent': 'No reachable agent is called "{name}". Reachable agents: {names}.',
    'delegate.reachable': 'Agents you can reach with send_to_agent:',
    'delegate.agent': 'agent: {value}',
    'delegate.folder': 'folder: {value}',
    'delegate.branch': 'branch: {value}',
    'delegate.statusLabel': 'status: {value}',
    'delegate.unsupported': 'unreachable for now (only Claude Code and Codex agents are supported)',
    'delegate.emptyMessage': 'The message is empty.',
    'delegate.tooLong': 'Message too long ({max} characters maximum).',
    'delegate.noHooks': '{name} is neither Claude Code nor Codex: delegation does not support it yet.',
    'delegate.notRunning': '{name} is not running (tile stopped or board not opened yet).',
    'delegate.limit': 'Limit of {max} message(s) to {name} reached for this request. The user can raise it in the link panel.',
    'delegate.header': 'Message from "{name}" (via Orchestra):',
    'delegate.footer': '(Your final reply will be sent back to it automatically.)',
    'delegate.queued': "{name} is busy: the message will be delivered as soon as it's done.",
    'delegate.delivered': 'Message delivered to {name}.',
    'delegate.getReply': 'Get its reply with wait_for_replies.',
    'delegate.emptyReply': '(empty reply)',
    'delegate.nothingPending': 'No message waiting for a reply: send a message with send_to_agent first.',
    'delegate.notSent': '(no message sent to this agent)',
    'delegate.closed': '(no reply: the tile was closed or stopped)',
    'delegate.stillWorking': '(still working after {seconds} s: call wait_for_replies again to wait for its reply)',
    'delegate.callerNotRunning': 'This tile is not running in Orchestra.',
    'delegate.unknownTool': 'Unknown tool: {name}',
    // Lien Terminal (outils lus par les agents)
    'terminal.none': 'No linked terminal: the user must draw a link from your tile to a Terminal tile on the Orchestra map.',
    'terminal.list': 'Terminals you can use with run_in_terminal:',
    'terminal.unknown': 'No linked terminal is called "{name}". Linked terminals: {names}.',
    'terminal.notRunning': '{name} is not running (tile stopped or board not opened yet).',
    'terminal.state.free': 'free',
    'terminal.state.busy': 'a command is running',
    'terminal.state.stopped': 'not running',
    'terminal.emptyCommand': 'The command is empty.',
    'terminal.tooLong': 'Command too long ({max} characters maximum).',
    'terminal.busy': '{name} is still running a command (its prompt has not come back): read it with read_terminal, or stop it with interrupt_terminal.',
    'terminal.noOutput': '(no output)',
    'terminal.truncated': '(beginning of the output cut)',
    'terminal.stillRunning': '(still running after {seconds} s: read the rest with read_terminal, stop it with interrupt_terminal)',
    'terminal.interrupted': 'Ctrl+C sent to {name}.',
    'terminal.notFinished': '(the command is still running, its prompt has not come back: read the rest with read_terminal, stop it with interrupt_terminal)',
  },
  fr: {
    'agent.missing': 'Agent supprimé',
    'board.defaultName': 'Tableau {n}',
    'notify.finished': '{name} a terminé sa tâche',
    'dialog.pickRoot': 'Choisir le dossier racine',
    'dialog.pickLogo': 'Choisir un logo',
    'dialog.images': 'Images',

    'fs.folderNotFound': 'Dossier introuvable',
    'fs.accessDenied': 'Accès refusé',
    'fs.itemNotFound': 'Élément introuvable',
    'fs.nameInvalid': 'Nom invalide',
    'fs.nameEmpty': 'Le nom ne peut pas être vide',
    'fs.nameTooLong': 'Nom trop long',
    'fs.nameChars': 'Ces caractères sont interdits : \\ / : * ? " < > |',
    'fs.nameEnd': 'Le nom ne peut pas finir par un point ou une espace',
    'fs.nameReserved': '« {name} » est un nom réservé par Windows',
    'fs.exists': '« {name} » existe déjà',
    'fs.createFailed': 'Impossible de créer le dossier (accès refusé ?)',
    'fs.renameFailed': 'Impossible de renommer (élément ouvert dans un autre programme ?)',
    'fs.trashFailed': 'Impossible de mettre à la corbeille (élément ouvert dans un autre programme ?)',
    'fs.protectedDrive': "On ne touche pas à la racine d'un disque",
    'fs.protectedHome': 'On ne touche pas au dossier personnel',
    'fs.protectedRoot': "C'est la racine de l'explorateur (ou un dossier qui la contient)",
    'fs.protectedWorktree': 'Worktree Git créé par Orchestra : à retirer avec « git worktree remove »',
    'fs.protectedUsed': 'La case « {name} » travaille dans ce dossier',

    'git.notRepo': "Ce dossier n'est pas un dépôt Git",
    'git.noGit': 'Git est introuvable sur cet ordinateur',
    'git.branchNotFound': 'Branche introuvable',
    'git.folderExists': 'Le dossier {path} existe déjà',
    'git.worktreeFailed': 'Impossible de créer le worktree',

    'agents.invalid': 'Agent invalide',
    'agents.logoFormat': 'Format non pris en charge',
    'agents.logoTooBig': 'Image trop lourde (1 Mo max)',
    'agents.emptyCommand': 'Commande vide',
    'agents.fileNotFound': 'Fichier introuvable',
    'agents.notInPath': '« {program} » introuvable dans le PATH',

    'link.targetGone': "L'agent cible n'est plus lancé",
    'link.targetNotRunning': "L'agent cible n'est pas lancé",
    'link.noReply': 'Réponse introuvable dans le transcript',

    'usage.session': 'Session (5 h)',
    'usage.weekAll': 'Semaine (tous modèles)',
    'usage.weekOpus': 'Semaine (Opus)',
    'usage.weekSonnet': 'Semaine (Sonnet)',
    'usage.week': 'Semaine',
    'usage.days': '{n} jours',
    'usage.hours': '{n} h',
    'usage.codexNote': 'Mis à jour à chaque réponse de Codex.',
    'usage.geminiUnavailable': "Gemini CLI n'enregistre pas son quota sur cet ordinateur.",
    'usage.unknownAgent': 'Pas de quota connu pour cet agent.',
    'usage.noAnswer': "Claude n'a pas répondu à /usage.",

    'delegate.status.idle': 'libre',
    'delegate.status.working': 'travaille',
    'delegate.status.waiting': 'attend une permission',
    'delegate.status.done': 'a fini',
    'delegate.notRunningStatus': 'pas lancé',
    'delegate.youAre': 'Tu es « {name} » dans Orchestra.',
    'delegate.noneReachable': "Aucun agent joignable : l'utilisateur doit tracer un lien en Délégation depuis ta case sur la map d'Orchestra.",
    'delegate.unknownAgent': "Aucun agent joignable ne s'appelle « {name} ». Agents joignables : {names}.",
    'delegate.reachable': 'Agents que tu peux joindre avec send_to_agent :',
    'delegate.agent': 'agent : {value}',
    'delegate.folder': 'dossier : {value}',
    'delegate.branch': 'branche : {value}',
    'delegate.statusLabel': 'statut : {value}',
    'delegate.unsupported': "injoignable pour l'instant (seuls Claude Code et Codex sont pris en charge)",
    'delegate.emptyMessage': 'Le message est vide.',
    'delegate.tooLong': 'Message trop long ({max} caractères maximum).',
    'delegate.noHooks': "{name} n'est ni Claude Code ni Codex : la délégation ne le prend pas encore en charge.",
    'delegate.notRunning': "{name} n'est pas lancé (case arrêtée ou tableau pas encore ouvert).",
    'delegate.limit': "Limite de {max} message(s) vers {name} atteinte pour cette demande. L'utilisateur peut l'augmenter dans le panneau du lien.",
    'delegate.header': 'Message de « {name} » (via Orchestra) :',
    'delegate.footer': '(Ta réponse finale lui sera transmise automatiquement.)',
    'delegate.queued': "{name} est occupé : le message lui sera remis dès qu'il aura fini.",
    'delegate.delivered': 'Message remis à {name}.',
    'delegate.getReply': 'Récupère sa réponse avec wait_for_replies.',
    'delegate.emptyReply': '(réponse vide)',
    'delegate.nothingPending': "Aucun message en attente de réponse : envoie d'abord un message avec send_to_agent.",
    'delegate.notSent': '(aucun message envoyé à cet agent)',
    'delegate.closed': '(pas de réponse : la case a été fermée ou arrêtée)',
    'delegate.stillWorking': '(travaille encore après {seconds} s : rappelle wait_for_replies pour attendre sa réponse)',
    'delegate.callerNotRunning': "Cette case n'est pas lancée dans Orchestra.",
    'delegate.unknownTool': 'Outil inconnu : {name}',
    // Lien Terminal (outils lus par les agents)
    'terminal.none': "Aucun terminal relié : l'utilisateur doit tracer un lien de ta case vers une case Terminal sur la map d'Orchestra.",
    'terminal.list': 'Terminaux utilisables avec run_in_terminal :',
    'terminal.unknown': "Aucun terminal relié ne s'appelle « {name} ». Terminaux reliés : {names}.",
    'terminal.notRunning': "{name} n'est pas lancé (case arrêtée ou tableau pas encore ouvert).",
    'terminal.state.free': 'libre',
    'terminal.state.busy': 'une commande tourne',
    'terminal.state.stopped': 'pas lancé',
    'terminal.emptyCommand': 'La commande est vide.',
    'terminal.tooLong': 'Commande trop longue ({max} caractères maximum).',
    'terminal.busy': "{name} exécute encore une commande (son invite n'est pas revenue) : lis-la avec read_terminal, ou arrête-la avec interrupt_terminal.",
    'terminal.noOutput': '(aucune sortie)',
    'terminal.truncated': '(début de la sortie coupé)',
    'terminal.stillRunning': '(tourne encore après {seconds} s : lis la suite avec read_terminal, arrête-la avec interrupt_terminal)',
    'terminal.interrupted': 'Ctrl+C envoyé à {name}.',
    'terminal.notFinished': "(la commande tourne encore, son invite n'est pas revenue : lis la suite avec read_terminal, arrête-la avec interrupt_terminal)",
  },
};

// Texte dans une langue donnée (repli sur l'anglais, puis sur la clé).
function tIn(language, key, vars = {}) {
  const entry = DICTIONARIES[language]?.[key] ?? DICTIONARIES.en[key];
  if (entry === undefined) return key;
  if (typeof entry === 'function') return entry(vars);
  return entry.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
}

const appLanguage = () => settingsStore.load().general.language;

// Texte dans la langue de l'interface.
const t = (key, vars) => tIn(appLanguage(), key, vars);

// Langue d'un message (anglais ou français) d'après ses mots courants ; null si on ne sait pas.
const FRENCH = /\b(le|la|les|des|du|une|est|et|pour|que|qui|dans|avec|pas|sur|ce|cette|tu|vous|je|nous|il|elle|mon|ton|son|mais|ou|donc|aussi|très|peux|fais|merci|bonjour)\b|[àâçéèêëîïôûùœ]/gi;
const ENGLISH = /\b(the|and|is|are|to|of|for|that|this|with|you|your|it|in|on|can|please|what|how|be|not|but|or|so|my|we|do|thanks|hello)\b/gi;
function detectLanguage(text) {
  if (typeof text !== 'string') return null;
  const fr = (text.match(FRENCH) ?? []).length;
  const en = (text.match(ENGLISH) ?? []).length;
  if (fr === en) return null;
  return fr > en ? 'fr' : 'en';
}

module.exports = { t, tIn, appLanguage, detectLanguage };
