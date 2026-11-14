// Serveur MCP « orchestra » (PLAN.md §3.11, §3.17), lancé par Claude Code ou Codex avec le Node d'Electron
// (ELECTRON_RUN_AS_NODE=1). Protocole : JSON-RPC sur stdin/stdout, un message par ligne.
// Il ne décide rien : chaque appel d'outil est relayé à Orchestra (ORCHESTRA_URL, avec l'id de la case
// et le jeton), qui vérifie les liens et la limite de tours. Textes en anglais : ce processus ne lit pas les
// paramètres, et ses descriptions sont lues par Claude (les réponses des outils, elles, suivent la langue du chat).
const http = require('http');

const ORCHESTRA_URL = process.env.ORCHESTRA_URL;
const PROTOCOL_VERSION = '2025-06-18';

// annotations : ce que fait vraiment le handler côté Orchestra (delegation, terminalLink, noteLink), pas son nom.
const TOOLS = [
  {
    name: 'list_agents',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      'Lists the Orchestra agents you can reach: those linked to your tile by a Delegation link on the map. ' +
      'Gives the name, agent type, folder, Git branch and status of each one.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'send_to_agent',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description:
      'Sends a message to a reachable agent (see list_agents), as if the user typed it in its terminal. ' +
      'Does not block: the agent works in parallel, you can write to several agents in a row. ' +
      'Returns a unique task ID. Requests to the same target are queued in order without overwriting earlier requests. Get replies with wait_for_replies. ' +
      'The agent does not see your conversation: the message must be self-contained. Write it in the language of your conversation with the user.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the agent, as given by list_agents (e.g. "Claude Code 2").' },
        message: { type: 'string', description: 'The complete message to send to it.' },
      },
      required: ['name', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'wait_for_replies',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description:
      'Waits for the final reply of the agents you sent a message to, and returns it. ' +
      'Use task_ids to select exact requests, or names to select agents. Without either, waits for all your outstanding tasks. Completed replies are consumed. ' +
      'After timeout_seconds (180 by default, 300 at most), returns what arrived and says who is still working: ' +
      'you can then call the tool again.',
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Names of the agents to wait for.' },
        task_ids: { type: 'array', items: { type: 'string' }, description: 'Task IDs returned by send_to_agent. Only your own tasks are accessible.' },
        timeout_seconds: { type: 'integer', minimum: 10, maximum: 300 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_terminals',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      'Lists the Orchestra terminals linked to your tile by a Terminal link on the map: name, folder, and whether a command ' +
      'you started is still being watched. Use these visible terminals (run_in_terminal) for commands the user should see, ' +
      'such as dev servers, builds or tests.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_in_terminal',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    description:
      'Types a command in a linked terminal (see list_terminals) and presses Enter, in its current shell and folder. ' +
      'Waits until the shell prompt comes back, or at most wait_seconds (30 by default, 300 at most), then returns ' +
      'the output that appeared. A long-running command (dev server, watcher) is reported as still running once its output ' +
      'goes quiet: read it later with read_terminal and stop it with interrupt_terminal. A terminal whose command is still ' +
      'running refuses new commands.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the terminal, as given by list_terminals (e.g. "Terminal 1").' },
        command: { type: 'string', description: "The command to type, in the syntax of that terminal's shell." },
        wait_seconds: { type: 'integer', minimum: 1, maximum: 300 },
      },
      required: ['name', 'command'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_terminal',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Returns the last lines shown in a linked terminal (ANSI codes removed).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the terminal.' },
        lines: { type: 'integer', minimum: 1, maximum: 500, description: 'Number of lines (50 by default).' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'interrupt_terminal',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    description: 'Sends Ctrl+C to a linked terminal, to stop the command running in it.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name of the terminal.' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_notes',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      'Lists the Orchestra sticky notes linked to your tile by a Note link on the map. Use them when the user asks you to ' +
      'note, track or show something there (a plan, phases and their status, a checklist, findings).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_note',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: 'Returns the current text of a linked sticky note. The user may have edited it: read it before rewriting it.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name of the note, as given by list_notes (e.g. "Note 1").' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_note',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    description:
      'Replaces the whole text of a linked sticky note; the user sees it at once on the map. Keep it short. ' +
      'Status lines are shown with icons: "- [x] Done", "- [~] In progress", "- [ ] To do". Other lines are plain text.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the note.' },
        text: { type: 'string', description: 'The complete new text of the note.' },
      },
      required: ['name', 'text'],
      additionalProperties: false,
    },
  },
];

// Outils du chef d'orchestre (PLAN.md §3.25) : construire et diriger le tableau. Servis seulement si
// ORCHESTRA_TOOLSET le demande ('conductor' : eux seuls, pour la session cachée ; 'all' : en plus des
// outils d'une case, pour la tester depuis une case Claude Code). Orchestra revérifie l'appelant.
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const CHANGE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
const REF = (what) => ({ type: 'string', description: `${what}: its id or its exact name, as given by read_board (a temporary pending-N id works too).` });
const NEAR = REF('Existing tile to place the new one near (below it). Optional: without it Orchestra finds a free spot');
const CONDUCTOR_TOOLS = [
  {
    name: 'read_board',
    annotations: READ,
    description:
      'Returns the current Orchestra board as JSON: agents and terminals (id, name, type, status, folder, branch, role), sticky notes, ' +
      'links (from, to, mode, instruction, turns), pending changes waiting for the user\'s approval, and the last exchanges of the log. ' +
      'Call it first, and again before changing something you did not create.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_agent',
    annotations: ADD,
    description:
      'Adds a tile to the board: a Claude Code or Codex agent (each in its own visible terminal), or a plain terminal. ' +
      'role = lasting instructions given to the agent at the start of its session (who it is, what it must and must not do). ' +
      'prompt = its first task, sent once it has started; write it self-contained, the agent does not see your conversation. ' +
      'Agents that edit code in parallel must not share a folder: give each one its own worktree_branch. ' +
      'Returns the new id, usable at once by create_link.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['claude', 'codex', 'terminal'] },
        name: { type: 'string', description: 'Short unique tile name (40 characters max), e.g. "Backend". Other agents address it by this name.' },
        role: { type: 'string', description: 'Role of the agent (2,000 characters max). Claude and Codex only.' },
        prompt: { type: 'string', description: 'First message sent to the agent. Claude and Codex only.' },
        folder: { type: 'string', description: 'Existing subfolder of the working folder (relative path). Default: the working folder.' },
        worktree_branch: { type: 'string', description: 'Run the agent in a Git worktree of this branch, created from HEAD if it does not exist (e.g. "maestro/backend"). The folder must be in a Git repository.' },
        near: NEAR,
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_link',
    annotations: ADD,
    description:
      'Links two tiles. Between agents: mode "delegate" lets the source agent talk to the target itself with its own tools ' +
      '(list_agents, send_to_agent, wait_for_replies) and get its reply back; mode "relay" sends the source\'s final answer to the target ' +
      'automatically each time the source finishes, with the instruction ({response} is replaced by that answer). ' +
      'An agent linked to a terminal can run commands in it; an agent linked to a sticky note can read and rewrite it.',
    inputSchema: {
      type: 'object',
      properties: {
        from: REF('Source tile'),
        to: REF('Target tile'),
        mode: { type: 'string', enum: ['delegate', 'relay'], description: 'Between two agents. Default: delegate. Ignored for terminal and sticky-note links.' },
        instruction: { type: 'string', description: 'Relay only: message sent to the target with the source\'s answer, e.g. "Review this code: {response}".' },
        max_turns: { type: 'integer', minimum: 1, maximum: 20, description: 'How many times the link can be used in one chain (default 3), against endless loops.' },
        bidirectional: { type: 'boolean', description: 'Both directions (default false).' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_link',
    annotations: CHANGE,
    description: 'Changes a link: its instruction, turn limit, mode, direction or whether it is enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        link: { type: 'string', description: 'Link id from read_board. Or give from and to instead.' },
        from: REF('Source tile'),
        to: REF('Target tile'),
        mode: { type: 'string', enum: ['delegate', 'relay'] },
        instruction: { type: 'string' },
        max_turns: { type: 'integer', minimum: 1, maximum: 20 },
        bidirectional: { type: 'boolean' },
        enabled: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'remove_link',
    annotations: CHANGE,
    description: 'Removes a link between two tiles.',
    inputSchema: {
      type: 'object',
      properties: { link: { type: 'string', description: 'Link id. Or give from and to instead.' }, from: REF('Source tile'), to: REF('Target tile') },
      additionalProperties: false,
    },
  },
  {
    name: 'create_sticky',
    annotations: ADD,
    description:
      'Adds a sticky note to the board, e.g. to write the plan. Status lines are shown with icons: "- [x] Done", "- [~] In progress", "- [ ] To do". ' +
      'Link an agent to it (create_link) if that agent should update it.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, name: { type: 'string', description: 'Short unique name, e.g. "Plan".' }, near: NEAR },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_sticky',
    annotations: CHANGE,
    description: 'Replaces the whole text of a sticky note. The user may have edited it: read_board first.',
    inputSchema: {
      type: 'object',
      properties: { sticky: REF('Sticky note'), text: { type: 'string' } },
      required: ['sticky', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_role',
    annotations: CHANGE,
    description: 'Sets the role of a Claude or Codex agent. A running agent applies it from its next session.',
    inputSchema: {
      type: 'object',
      properties: { agent: REF('Agent'), role: { type: 'string', description: 'New role; empty to remove it.' } },
      required: ['agent', 'role'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_to',
    annotations: ADD,
    description:
      'Sends a message to a running Claude or Codex agent, as if the user typed it (queued until the agent is free). ' +
      'Use it to give a new task or to unblock an agent. Its answer is not returned to you: check later with read_board or read_agent_output.',
    inputSchema: {
      type: 'object',
      properties: { agent: REF('Agent'), message: { type: 'string', description: 'Self-contained message.' } },
      required: ['agent', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_agent',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    description: 'Closes an agent or terminal tile and removes it with its links. Refused while the agent is working.',
    inputSchema: { type: 'object', properties: { agent: REF('Agent or terminal') }, required: ['agent'], additionalProperties: false },
  },
  {
    name: 'read_agent_output',
    annotations: READ,
    description: 'Returns the last lines shown in an agent\'s or terminal\'s screen (ANSI codes removed, 80 lines at most), e.g. to see why it is stuck.',
    inputSchema: {
      type: 'object',
      properties: { agent: REF('Agent or terminal'), lines: { type: 'integer', minimum: 1, maximum: 80, description: 'Default 40.' } },
      required: ['agent'],
      additionalProperties: false,
    },
  },
];
CONDUCTOR_TOOLS.push({
  name: 'arrange',
  annotations: CHANGE,
  description:
    'Moves tiles into the shape the user asked for. "pyramid": rows centered under each other, the top tile in the middle above ' +
    'the next row (rows follow the links from the top, e.g. a lead above two workers); "row", "column", "grid": a line, a column ' +
    'or a near-square grid. Call it after creating the tiles, and after their links for a pyramid.',
  inputSchema: {
    type: 'object',
    properties: {
      layout: { type: 'string', enum: ['pyramid', 'row', 'column', 'grid'] },
      tiles: { type: 'array', items: { type: 'string' }, description: 'Ids or names of the tiles to arrange. Default: all agents and terminals of the board.' },
      top: REF('Pyramid only: the tile at the top'),
    },
    required: ['layout'],
    additionalProperties: false,
  },
});
const TOOLSET = process.env.ORCHESTRA_TOOLSET;
const SERVED = TOOLSET === 'conductor' ? CONDUCTOR_TOOLS : TOOLSET === 'all' ? [...TOOLS, ...CONDUCTOR_TOOLS] : TOOLS;

function callOrchestra(name, args) {
  return new Promise((resolve) => {
    const failed = () => resolve({ text: 'Orchestra is not responding (the app may have been closed).', isError: true });
    if (!ORCHESTRA_URL) return failed();
    const body = JSON.stringify({ name, arguments: args });
    const req = http.request(ORCHESTRA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ text: String(result.text ?? ''), isError: Boolean(result.isError) });
        } catch {
          failed();
        }
      });
    });
    req.on('error', failed);
    req.end(body);
  });
}

const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');

async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return; // notification (initialized, cancelled…) : rien à répondre

  switch (method) {
    case 'initialize':
      return send({
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'orchestra', version: '1.0.0' },
        },
      });
    case 'ping':
      return send({ id, result: {} });
    case 'tools/list':
      return send({ id, result: { tools: SERVED } });
    case 'tools/call': {
      const { text, isError } = await callOrchestra(params?.name, params?.arguments ?? {});
      return send({ id, result: { content: [{ type: 'text', text }], isError } });
    }
    default:
      return send({ id, error: { code: -32601, message: `Unknown method: ${method}` } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: 'JSON invalide' } });
      continue;
    }
    handle(message);
  }
});
process.stdin.on('end', () => process.exit(0));
