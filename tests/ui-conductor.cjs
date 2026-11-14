const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

// Chef d'orchestre (PLAN.md §3.25) : outils appelés par le vrai serveur local, comme le ferait le serveur MCP
// d'une case Claude Code avec le réglage de test. Seules des cases Terminal sont créées : aucun CLI IA lancé.
module.exports = async ({ evaluate, until, sleep, data, errors }) => {
  const status = require('../electron/agentStatus.cjs');
  const hooks = require('../electron/hookServer.cjs');
  const conductor = require('../electron/conductor.cjs');
  const tool = async (caller, name, args = {}) => {
    const response = await fetch(hooks.toolUrl(caller), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) });
    return response.json();
  };
  const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8'));
  const node = (id) => `.react-flow__node[data-id="${id}"]`;

  await until("!!document.querySelector('.react-flow__node[data-id=\"lead\"]')");
  for (let i = 0; i < 100 && !status.info('lead'); i++) await sleep(100);
  assert.ok(status.info('lead'), 'the lead tile runs');
  await sleep(4200); // écran de démarrage

  // Une case Terminal crée une autre case sous elle : visible, nommée, sauvegardée comme créée par le chef d'orchestre.
  const created = await tool('lead', 'create_agent', { type: 'terminal', name: 'Runner', near: 'Lead' });
  assert.equal(created.isError, false, created.text);
  const id = created.text.match(/[0-9a-f-]{36}/)[0];
  await until(`!!document.querySelector('${node(id)}')`);
  await until(`document.querySelector('${node(id)}').textContent.includes('Runner')`);
  const runner = saved().boards[0].nodes.find((n) => n.id === id);
  assert.equal(runner.data.createdBy, 'conductor');
  const lead = saved().boards[0].nodes.find((n) => n.id === 'lead');
  assert.ok(runner.position.y > lead.position.y + 300, 'placed below its lead');
  assert.equal(conductor.tileTools(id), false);

  const sticky = await tool('lead', 'create_sticky', { text: '- [ ] Build\n- [ ] Test', name: 'Plan' });
  assert.equal(sticky.isError, false, sticky.text);
  await until("[...document.querySelectorAll('.react-flow__node-note')].some((n) => n.textContent.includes('Build'))");
  const link = await tool('lead', 'create_link', { from: 'Lead', to: 'Runner', mode: 'delegate' });
  assert.equal(link.isError, false, link.text);
  await until("document.querySelectorAll('.react-flow__edge').length === 1");
  assert.equal(saved().boards[0].edges[0].data.mode, 'delegate');
  assert.equal((await tool('lead', 'update_sticky', { sticky: 'Plan', text: '- [x] Build' })).isError, false);
  await until("[...document.querySelectorAll('.react-flow__node-note')].some((n) => n.textContent.includes('Build') && !n.textContent.includes('Test'))");

  const view = JSON.parse((await tool('lead', 'read_board')).text);
  assert.deepEqual(view.terminals.map((t) => t.name).sort(), ['Lead', 'Runner']);
  assert.equal(view.links[0].from, 'Lead');
  assert.equal(view.stickies[0].name, 'Plan');
  assert.ok(view.recent_log.some((entry) => entry.kind === 'conductor'));
  const output = await tool('lead', 'read_agent_output', { agent: 'Lead' });
  assert.equal(output.isError, false);
  assert.ok(output.text.split('\n').length <= 80);

  // La case créée ne peut pas utiliser ces outils.
  for (let i = 0; i < 100 && !status.info(id); i++) await sleep(100);
  assert.equal((await tool(id, 'create_sticky', { text: 'nope' })).isError, true);

  // Retirer : case et terminal fermés, lien retiré.
  assert.equal((await tool('lead', 'remove_agent', { agent: 'Runner' })).isError, false);
  await until(`!document.querySelector('${node(id)}')`);
  await until("document.querySelectorAll('.react-flow__edge').length === 0");
  for (let i = 0; i < 50 && status.info(id); i++) await sleep(100);
  assert.equal(status.info(id), null, 'its terminal is closed');

  // Journal : une entrée par action, au nom de la case qui a appelé.
  const log = await evaluate("window.activityLog.get()");
  const entries = log.filter((e) => e.kind === 'conductor');
  assert.equal(entries.length, 5);
  assert.ok(entries.every((e) => e.fromName === 'Lead'));

  // Session du chef d'orchestre sur un autre tableau : ce tableau s'ouvre, le changement y est appliqué.
  conductor.openSession('conductor-other', { boardId: 'other', folder: data, preview: false });
  const remote = await tool('conductor-other', 'create_sticky', { text: 'Other board plan', name: 'Remote plan' });
  assert.equal(remote.isError, false, remote.text);
  await until("[...document.querySelectorAll('.react-flow__node-note')].some((n) => n.textContent.includes('Other board plan'))");
  assert.equal(saved().activeBoardId, 'other');
  assert.ok(saved().boards.find((b) => b.id === 'other').nodes.some((n) => n.data.text === 'Other board plan'));
  conductor.closeSession('conductor-other');
  assert.equal((await tool('conductor-other', 'read_board')).isError, true);

  assert.deepEqual(errors, []);
};
