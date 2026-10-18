// Serveur MCP « orchestra » (PLAN.md §3.11), lancé par Claude Code avec le Node d'Electron
// (ELECTRON_RUN_AS_NODE=1). Protocole : JSON-RPC sur stdin/stdout, un message par ligne.
// Il ne décide rien : chaque appel d'outil est relayé à Orchestra (ORCHESTRA_URL, avec l'id de la case
// et le jeton), qui vérifie les liens et la limite de tours.
const http = require('http');

const ORCHESTRA_URL = process.env.ORCHESTRA_URL;
const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'list_agents',
    description:
      "Liste les agents d'Orchestra que tu peux joindre : ceux reliés à ta case par un lien en Délégation sur la map. " +
      'Donne pour chacun son nom, le type d\'agent, son dossier, sa branche Git et son statut.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'send_to_agent',
    description:
      "Envoie un message à un agent joignable (voir list_agents), comme si l'utilisateur le tapait dans son terminal. " +
      "Ne bloque pas : l'agent travaille en parallèle, tu peux écrire à plusieurs agents à la suite. " +
      "S'il est occupé, le message lui est remis dès qu'il a fini. Récupère ensuite sa réponse avec wait_for_replies. " +
      "L'agent ne voit pas ta conversation : le message doit être complet.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Nom de l'agent, tel que donné par list_agents (ex. « Claude Code 2 »)." },
        message: { type: 'string', description: 'Le message complet à lui envoyer.' },
      },
      required: ['name', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'wait_for_replies',
    description:
      'Attend la réponse finale des agents à qui tu as envoyé un message, et la renvoie. ' +
      'Sans « names », attend tous ceux qui ont un message en cours. ' +
      'Au bout de timeout_seconds (180 par défaut, 300 au maximum), renvoie ce qui est arrivé et dit qui travaille encore : ' +
      "tu peux alors rappeler l'outil.",
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Noms des agents à attendre.' },
        timeout_seconds: { type: 'integer', minimum: 10, maximum: 300 },
      },
      additionalProperties: false,
    },
  },
];

function callOrchestra(name, args) {
  return new Promise((resolve) => {
    const failed = () => resolve({ text: "Orchestra ne répond pas (l'app a peut-être été fermée).", isError: true });
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
      return send({ id, error: { code: -32601, message: `Méthode inconnue : ${method}` } });
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
