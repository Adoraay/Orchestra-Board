// Serveur MCP « orchestra » (PLAN.md §3.11, §3.17), lancé par Claude Code ou Codex avec le Node d'Electron
// (ELECTRON_RUN_AS_NODE=1). Protocole : JSON-RPC sur stdin/stdout, un message par ligne.
// Il ne décide rien : chaque appel d'outil est relayé à Orchestra (ORCHESTRA_URL, avec l'id de la case
// et le jeton), qui vérifie les liens et la limite de tours. Textes en anglais : ce processus ne lit pas les
// paramètres, et ses descriptions sont lues par Claude (les réponses des outils, elles, suivent la langue du chat).
const http = require('http');

const ORCHESTRA_URL = process.env.ORCHESTRA_URL;
const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'list_agents',
    description:
      'Lists the Orchestra agents you can reach: those linked to your tile by a Delegation link on the map. ' +
      'Gives the name, agent type, folder, Git branch and status of each one.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'send_to_agent',
    description:
      'Sends a message to a reachable agent (see list_agents), as if the user typed it in its terminal. ' +
      'Does not block: the agent works in parallel, you can write to several agents in a row. ' +
      'If it is busy, the message is delivered as soon as it is done. Then get its reply with wait_for_replies. ' +
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
    description:
      'Waits for the final reply of the agents you sent a message to, and returns it. ' +
      'Without "names", waits for all agents with a message in progress. ' +
      'After timeout_seconds (180 by default, 300 at most), returns what arrived and says who is still working: ' +
      'you can then call the tool again.',
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Names of the agents to wait for.' },
        timeout_seconds: { type: 'integer', minimum: 10, maximum: 300 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_terminals',
    description:
      'Lists the Orchestra terminals linked to your tile by a Terminal link on the map: name, folder, and whether a command ' +
      'you started is still being watched. Use these visible terminals (run_in_terminal) for commands the user should see, ' +
      'such as dev servers, builds or tests.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_in_terminal',
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
    description:
      'Lists the Orchestra sticky notes linked to your tile by a Note link on the map. Use them when the user asks you to ' +
      'note, track or show something there (a plan, phases and their status, a checklist, findings).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_note',
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
      return send({ id, result: { tools: TOOLS } });
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
