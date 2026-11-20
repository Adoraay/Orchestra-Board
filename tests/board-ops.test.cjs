const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Règles partagées par l'interface et le chef d'orchestre (src/lib/boardOps.js).
async function boardOps() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'boardOps.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

const agent = (id, agentId = 'claude-code') => ({ id, type: 'terminal', data: { agentId } });
const shell = (id) => agent(id, 'shell');
const note = (id) => ({ id, type: 'note', data: { text: '' } });

test('linkRule keeps the link rules of the Link tool', async () => {
  const { linkRule } = await boardOps();
  const hooks = (agentId) => ['claude-code', 'codex', 'antigravity'].includes(agentId);
  const fallback = { terminalFallback: true, review: true };
  assert.deepEqual(linkRule(agent('a'), agent('b'), 'relay', hooks), { source: 'a', target: 'b', mode: 'relay' });
  assert.deepEqual(linkRule(agent('a'), agent('b'), 'delegate', hooks), { source: 'a', target: 'b', mode: 'delegate' });
  // Une Transmission depuis un agent sans hooks passe par l'écran de son terminal, toujours à valider.
  assert.deepEqual(linkRule(agent('g', 'aider'), agent('b'), 'relay', hooks), { source: 'g', target: 'b', mode: 'relay', extra: fallback });
  // Note : toujours de l'agent vers le post-it, quel que soit l'ordre des clics.
  assert.deepEqual(linkRule(note('n'), agent('a'), 'relay', hooks), { source: 'a', target: 'n', mode: 'note' });
  assert.deepEqual(linkRule(agent('a'), note('n'), 'relay', hooks), { source: 'a', target: 'n', mode: 'note' });
  // Agent → Terminal : lien Terminal ; Terminal → agent (ou Terminal) : Transmission de sa sortie, à valider.
  assert.deepEqual(linkRule(agent('a'), shell('s'), 'delegate', hooks), { source: 'a', target: 's', mode: 'terminal' });
  assert.deepEqual(linkRule(shell('s'), agent('a'), 'delegate', hooks), { source: 's', target: 'a', mode: 'relay', extra: fallback });
  assert.deepEqual(linkRule(shell('s'), shell('t'), 'delegate', hooks), { source: 's', target: 't', mode: 'relay', extra: fallback });
  // Navigateur et Test visuel : d'un agent à hooks vers la case, dans un sens ou dans l'autre.
  const browser = { id: 'w', type: 'interactiveBrowser', data: {} };
  const visual = { id: 'v', type: 'visualTest', data: {} };
  assert.deepEqual(linkRule(browser, agent('a'), 'relay', hooks), { source: 'a', target: 'w', mode: 'browser' });
  assert.deepEqual(linkRule(agent('a'), visual, 'relay', hooks), { source: 'a', target: 'v', mode: 'visual' });
  assert.equal(linkRule(agent('g', 'aider'), visual, 'relay', hooks), null, 'only agents with hooks have these tools');
  assert.equal(linkRule(shell('s'), browser, 'relay', hooks), null);
  // Impossibles : deux post-it, post-it et Terminal, même case, case absente ou panneau.
  assert.equal(linkRule(note('n'), note('m'), 'relay', hooks), null);
  assert.equal(linkRule(note('n'), shell('s'), 'relay', hooks), null);
  assert.equal(linkRule(agent('a'), agent('a'), 'relay', hooks), null);
  assert.equal(linkRule(agent('a'), undefined, 'relay', hooks), null);
  assert.equal(linkRule(agent('a'), { id: 'p', type: 'panel', data: { panel: 'log' } }, 'relay', hooks), null);
});

test('numberedName takes the smallest free number and edgeId matches React Flow', async () => {
  const { numberedName, edgeId } = await boardOps();
  const nodes = [{ data: { label: 'Claude Code 1' } }, { data: { label: 'Claude Code 3' } }, { data: {} }];
  assert.equal(numberedName('Claude Code', nodes), 'Claude Code 2');
  assert.equal(numberedName('Codex', nodes), 'Codex 1');
  assert.equal(edgeId('a', 'b'), 'xy-edge__a-b');
});
