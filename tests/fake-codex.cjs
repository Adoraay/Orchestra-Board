// Faux `codex exec --json` pour les tests du chef d'orchestre (aucun modèle sollicité). Lit le message sur
// stdin (« - »). « BUILD » : appelle les vrais outils d'Orchestra par l'adresse donnée dans -c mcp_servers.orchestra.env ;
// « FAIL » : tour échoué. FAKE_CLAUDE_LOG : fichier où sont ajoutés les arguments reçus (une ligne JSON par appel).
const fs = require('fs');
const http = require('http');
const { randomUUID } = require('crypto');

const args = process.argv.slice(2);
const out = (message) => process.stdout.write(JSON.stringify(message) + '\n');
if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(args) + '\n');
const resume = args[1] === 'resume';
const thread = resume ? args[args.length - 2] : randomUUID();
const config = (key) => args.filter((a, i) => args[i - 1] === '-c').find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);
const url = config('mcp_servers.orchestra.env')?.match(/ORCHESTRA_URL = "([^"]+)"/)?.[1];

function tool(name, input) {
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve({ text: 'unreachable', isError: true }));
    req.end(JSON.stringify({ name, arguments: input }));
  });
}

let message = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (message += c));
process.stdin.on('end', async () => {
  out({ type: 'thread.started', thread_id: thread });
  out({ type: 'turn.started' });
  if (message.includes('FAIL')) {
    out({ type: 'turn.failed', error: { message: 'boom: not logged in to Codex' } });
    process.exit(1);
  }
  if (message.includes('BUILD')) {
    let n = 0;
    for (const [name, input] of [['create_agent', { type: 'terminal', name: 'Worker' }], ['create_link', { from: 'Worker', to: 'Nobody' }]]) {
      const item = { id: `item_${++n}`, type: 'mcp_tool_call', server: 'orchestra', tool: name, arguments: input, status: 'in_progress' };
      out({ type: 'item.started', item });
      const result = await tool(name, input);
      out({ type: 'item.completed', item: { ...item, result: { content: [{ type: 'text', text: result.text }] }, error: null, status: result.isError ? 'failed' : 'completed' } });
    }
  }
  out({ type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: `Codex : ${message.trim()}` } });
  out({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
});
