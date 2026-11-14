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
  assert.deepEqual(linkRule(agent('a'), agent('b'), 'relay'), { source: 'a', target: 'b', mode: 'relay' });
  assert.deepEqual(linkRule(agent('a'), agent('b'), 'delegate'), { source: 'a', target: 'b', mode: 'delegate' });
  // Note : toujours de l'agent vers le post-it, quel que soit l'ordre des clics.
  assert.deepEqual(linkRule(note('n'), agent('a'), 'relay'), { source: 'a', target: 'n', mode: 'note' });
  assert.deepEqual(linkRule(agent('a'), note('n'), 'relay'), { source: 'a', target: 'n', mode: 'note' });
  // Terminal : toujours vers la case Terminal.
  assert.deepEqual(linkRule(shell('s'), agent('a'), 'delegate'), { source: 'a', target: 's', mode: 'terminal' });
  assert.deepEqual(linkRule(agent('a'), shell('s'), 'delegate'), { source: 'a', target: 's', mode: 'terminal' });
  // Deux terminaux : type par défaut, comme avant.
  assert.deepEqual(linkRule(shell('s'), shell('t'), 'relay'), { source: 's', target: 't', mode: 'relay' });
  // Impossibles : deux post-it, post-it et Terminal, même case, case absente ou panneau.
  assert.equal(linkRule(note('n'), note('m'), 'relay'), null);
  assert.equal(linkRule(note('n'), shell('s'), 'relay'), null);
  assert.equal(linkRule(agent('a'), agent('a'), 'relay'), null);
  assert.equal(linkRule(agent('a'), undefined, 'relay'), null);
  assert.equal(linkRule(agent('a'), { id: 'p', type: 'panel', data: { panel: 'log' } }, 'relay'), null);
});

test('numberedName takes the smallest free number and edgeId matches React Flow', async () => {
  const { numberedName, edgeId } = await boardOps();
  const nodes = [{ data: { label: 'Claude Code 1' } }, { data: { label: 'Claude Code 3' } }, { data: {} }];
  assert.equal(numberedName('Claude Code', nodes), 'Claude Code 2');
  assert.equal(numberedName('Codex', nodes), 'Codex 1');
  assert.equal(edgeId('a', 'b'), 'xy-edge__a-b');
});
