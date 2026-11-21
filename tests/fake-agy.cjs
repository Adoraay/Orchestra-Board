// Faux `agy -p --output-format stream-json` pour les tests du chef d'orchestre (aucun modèle sollicité).
// Le prompt arrive dans -p=… ; « BUILD » : appelle le vrai outil create_agent d'Orchestra par l'adresse de la config
// MCP du dossier de travail (.agents/mcp_config.json) ; « FAIL » : résultat en erreur.
// FAKE_CLAUDE_LOG : fichier où sont ajoutés les arguments reçus (une ligne JSON par appel).
const fs = require('fs');
const http = require('http');
const path = require('path');
const { randomUUID } = require('crypto');

const args = process.argv.slice(2);
if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(args) + '\n');
const out = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const prompt = args.find((a) => a.startsWith('-p='))?.slice(3) ?? '';
const conversation = args.includes('--conversation') ? args[args.indexOf('--conversation') + 1] : randomUUID();
const step = (index, fields) => out({ event: 'step_update', step_update: { conversation_id: conversation, step_index: index, ...fields } });

function tool(name, input) {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.agents', 'mcp_config.json'), 'utf8'));
  return new Promise((resolve) => {
    const req = http.request(config.mcpServers.orchestra.env.ORCHESTRA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve({ text: 'unreachable', isError: true }));
    req.end(JSON.stringify({ name, arguments: input }));
  });
}

(async () => {
  out({ event: 'init', conversation_id: conversation, init: { cwd: process.cwd(), tools: ['call_mcp_tool', 'read_file'] } });
  step(0, { state: 'DONE', step_type: 'user_input' });
  if (prompt.includes('FAIL')) {
    out({ event: 'result', result: { conversation_id: conversation, status: 'ERROR', error: { message: 'boom: sign in to Antigravity' } } });
    return;
  }
  // Lecture du schéma d'un outil MCP (cachée dans la bulle), puis l'appel.
  step(1, { state: 'DONE', step_type: 'tool', tool_name: 'read_file', tool_info: { name: 'read_file', parameters: { Path: 'C:\\Users\\u\\.gemini\\antigravity-cli\\mcp\\orchestra\\create_agent.json' } } });
  if (prompt.includes('BUILD')) {
    const params = { ServerName: 'orchestra', ToolName: 'create_agent', Arguments: { type: 'terminal', name: 'Worker' } };
    step(2, { state: 'ACTIVE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { name: 'call_mcp_tool', parameters: params } });
    const result = await tool('create_agent', params.Arguments);
    step(2, { state: result.isError ? 'ERROR' : 'DONE', step_type: 'tool', tool_name: 'call_mcp_tool', tool_info: { name: 'call_mcp_tool', parameters: params, output: result.text, ...(result.isError && { error: { message: result.text } }) } });
  }
  const reply = `Agy : ${prompt.split('\n').at(-1)}`;
  step(3, { state: 'ACTIVE', step_type: 'agent_response', text_delta: reply.slice(0, 5) });
  step(3, { state: 'DONE', step_type: 'agent_response', text_delta: reply.slice(5) });
  out({ event: 'result', result: { conversation_id: conversation, status: 'SUCCESS', response: reply } });
})();
