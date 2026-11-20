// Faux `claude -p --output-format stream-json` pour les tests du chef d'orchestre (aucun modèle sollicité).
// Lit le message sur stdin. « FAIL » : erreur et code 2 ; « SLOW » : attend (test d'arrêt) ;
// « BUILD » : appelle les vrais outils d'Orchestra par l'adresse de la config MCP, comme le ferait Claude, et
// répond en Markdown ; « PAUSE » : 1,5 s entre deux outils (pour voir l'encart de construction).
// FAKE_CLAUDE_LOG : fichier où sont ajoutés les arguments reçus (une ligne JSON par appel).
const fs = require('fs');
const http = require('http');

const args = process.argv.slice(2);
const after = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const out = (message) => process.stdout.write(JSON.stringify(message) + '\n');
if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(args) + '\n');

function tool(url, name, input) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ name, arguments: input });
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve({ text: 'unreachable', isError: true }));
    req.end(body);
  });
}

let message = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (message += c));
process.stdin.on('end', async () => {
  if (message.includes('FAIL')) {
    process.stderr.write('boom: not logged in');
    process.exit(2);
  }
  const sessionId = after('--session-id') ?? after('--resume');
  out({ type: 'system', subtype: 'init', session_id: sessionId, mcp_servers: [{ name: 'orchestra', status: 'connected' }], tools: [] });
  if (message.includes('SLOW')) {
    setTimeout(() => {}, 60000);
    return;
  }
  for (const text of ['Je ', 'construis…']) out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
  // « NEWBOARD » : un nouveau tableau, puis une case dedans.
  const actions = message.includes('NEWBOARD')
    ? [['create_board', { name: 'API' }], ['create_agent', { type: 'terminal', name: 'Server' }]]
    : null;
  if (actions) {
    const config = JSON.parse(fs.readFileSync(after('--mcp-config'), 'utf8'));
    const url = config.mcpServers.orchestra.env.ORCHESTRA_URL;
    let n = 0;
    for (const [name, input] of actions) {
      const id = `board-tool-${++n}`;
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__orchestra__${name}`, input }] } });
      const result = await tool(url, name, input);
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: result.text }], is_error: result.isError }] } });
    }
  }
  if (message.includes('BUILD')) {
    const config = JSON.parse(fs.readFileSync(after('--mcp-config'), 'utf8'));
    const url = config.mcpServers.orchestra.env.ORCHESTRA_URL;
    const calls = [['create_agent', { type: 'terminal', name: 'Worker' }], ['create_sticky', { text: '- [ ] Build', name: 'Plan' }], ['create_link', { from: 'Worker', to: 'Nobody' }]];
    let n = 0;
    for (const [name, input] of calls) {
      const id = `tool-${++n}`;
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__orchestra__${name}`, input }] } });
      const result = await tool(url, name, input);
      if (message.includes('PAUSE')) await new Promise((r) => setTimeout(r, 1500));
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: result.text }], is_error: result.isError }] } });
    }
  }
  const markdown = message.includes('BUILD') ? '\n\n- **Worker** builds\n- `Plan` tracks' : '';
  out({ type: 'assistant', message: { content: [{ type: 'text', text: `Fait : ${message.trim()}${markdown}` }] } });
  out({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: sessionId });
});
