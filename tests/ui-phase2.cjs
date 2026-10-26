const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const french = process.env.ORCHESTRA_SMOKE_MODE === 'phase2-fr';
  const tr = (en, fr) => french ? fr : en;
  const click = async (selector) => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const button = async (text) => {
    const expression = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
    await until(`!!(${expression})`); await evaluate(`(${expression}).click()`);
  };
  const type = async (selector, text) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const tab = async (name) => {
    const expression = `[...document.querySelectorAll('.board-tab')].find(b => b.textContent.trim() === ${JSON.stringify(name)})`;
    await until(`!!(${expression})`); await evaluate(`(${expression}).click()`);
  };
  const capture = async (name) => {
    await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(400);
    const image = await win.webContents.capturePage(undefined, { stayHidden: true });
    fs.writeFileSync(path.join(data, name + (french ? '-fr' : '') + '.png'), image.toPNG());
  };
  await until(`document.body.textContent.includes(${JSON.stringify(tr('Resume your conversations?', 'Reprendre tes discussions ?'))})`);
  await button(tr('View board', 'Voir le tableau'));
  await until("!document.querySelector('.splash') && Number(getComputedStyle(document.querySelector('.splash-backdrop')).opacity) === 0");

  // Enregistrer et réutiliser un vrai tableau de notes, sans lancer de CLI IA.
  await tab('Notes');
  await click(`button[title=${JSON.stringify(tr('Team templates', 'Modèles d’équipes'))}]`);
  await until(`document.body.textContent.includes(${JSON.stringify(tr('Developer + reviewer', 'Développeur + relecteur'))})`);
  await button(tr('Save this board', 'Enregistrer ce tableau'));
  await type('.team-modal input[maxlength="40"]', 'Smoke team');
  await button(tr('Save as a template', 'Enregistrer comme modèle'));
  await until("document.body.textContent.includes('Smoke team') && !!document.querySelector('.team-details')");
  await capture('phase2-teams');
  await evaluate(`[...document.querySelectorAll('.team-item')].find(b => b.textContent.includes(${JSON.stringify(tr('Lead + two workers', 'Chef + deux agents'))})).click()`);
  await until("document.querySelectorAll('.team-diagram .team-edge').length === 3");
  await capture('phase2-team-recipe');
  await evaluate("[...document.querySelectorAll('.team-item')].find(b => b.textContent.includes('Smoke team')).click()");
  await button(tr('Create a new board', 'Créer un nouveau tableau'));
  await until("!document.querySelector('.team-modal') && document.querySelector('.board-tab.active')?.textContent.includes('Smoke team')");
  await until("document.body.textContent.includes('Restored original note')");
  await sleep(700);
  const saved = JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8'));
  const fresh = saved.boards.find((board) => board.name === 'Smoke team');
  assert.equal(fresh.nodes.length, 1); assert.notEqual(fresh.nodes[0].id, 'note-1');
  assert.equal(saved.boards.find((board) => board.id === 'notes').nodes[0].id, 'note-1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'team-templates.json'), 'utf8')).length, 1);

  await tab('Roles');
  const status = require('../electron/agentStatus.cjs');
  const hooks = require('../electron/hookServer.cjs');
  // Les événements transitent par le vrai serveur de hooks ; aucun modèle n'est sollicité.
  status.register('role-agent', 'hooks', { name: 'Reviewer', cwd: path.resolve(__dirname, '..'), notify: false });
  const hook = async (id, event) => {
    const response = await fetch(hooks.hookUrl(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hook_event_name: event }) });
    return response.json();
  };
  const start = await hook('role-agent', 'SessionStart');
  assert.match(start.hookSpecificOutput.additionalContext, /Old active role/);
  await click('.react-flow__node[data-id="role-agent"] .case-tab:last-child');
  await until("document.querySelector('.role-session')?.textContent.includes('Old active role')");
  await evaluate(`(() => { const el = document.querySelector('#role-text'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'New saved role'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await button(tr('Save', 'Enregistrer'));
  await until("!!document.querySelector('.role-pending-text')");
  await capture('phase2-roles');
  const after = await evaluate("window.roles.get('role-agent')");
  assert.equal(after.activeRole, 'Old active role'); assert.equal(after.savedRole, 'New saved role'); assert.equal(after.pending, true);
  const cleared = await hook('role-agent', 'SessionStart');
  assert.match(cleared.hookSpecificOutput.additionalContext, /New saved role/);
  assert.equal((await evaluate("window.roles.get('role-agent')")).pending, false);
  await button(tr('Later', 'Plus tard'));

  // Le diff réel lit le dépôt courant sans y effectuer de mutation Git.
  await click('.react-flow__node[data-id="role-agent"] .case-tab:first-child');
  await until("document.querySelector('.changes-scope')?.textContent.includes('HEAD') && document.querySelector('.shared-worktree')?.textContent.includes('Peer')");
  await until("!!document.querySelector('.changes-code')");
  await capture('phase2-changes');
  await click(`.changes-modal button[title=${JSON.stringify(tr('Close', 'Fermer'))}]`);

  status.register('peer-agent', 'hooks', { name: 'Peer', cwd: path.join(__dirname, '..', 'src'), notify: false });
  await hook('peer-agent', 'UserPromptSubmit'); await hook('peer-agent', 'PermissionRequest');
  await click(`button[title=${JSON.stringify(tr('Blockers inbox', 'Boîte de réception des blocages'))}]`);
  await until("document.querySelector('.inbox-list')?.textContent.includes('Peer')");
  await capture('phase2-inbox');
  await click('.inbox-tab-resolved');
  await evaluate("document.querySelector('.inbox-clear')?.click()");
  await click('.inbox-tab-active');
  assert.equal((await evaluate('window.blockers.get()')).filter((entry) => !entry.resolved && entry.caseId === 'peer-agent').length, 1);
  await click('.inbox-case');
  await until("document.querySelector('.board-tab.active')?.textContent.includes('Other board')");
  await hook('peer-agent', 'PostToolUse');
  assert.equal((await evaluate('window.blockers.get()')).find((entry) => entry.caseId === 'peer-agent').resolved, true);

  // Un arrêt de terminal est signalé et une relance le résout.
  await tab('Roles');
  await until("!!document.querySelector('.react-flow__node[data-id=" + JSON.stringify('smoke-terminal') + "]')");
  await evaluate("window.pty.write('smoke-terminal', 'exit\\r')");
  await until("document.querySelector('.react-flow__node[data-id=" + JSON.stringify('smoke-terminal') + "] .badge')?.textContent.includes(" + JSON.stringify(tr('exited', 'terminé')) + ")");
  const stopped = await evaluate('window.blockers.get()');
  assert.ok(stopped.some((entry) => entry.kind === 'exit' && entry.caseId === 'smoke-terminal' && !entry.resolved));
  await click('.react-flow__node[data-id="smoke-terminal"] .header-button');
  await until("!document.querySelector('.react-flow__node[data-id=" + JSON.stringify('smoke-terminal') + "] .badge')");
  await until(`window.pty.create({ id: 'smoke-terminal', agentId: 'shell', cwd: ${JSON.stringify(data)} }).then(result => result?.buffer.includes('>'))`);
  await sleep(300); // ConPTY doit avoir attaché sa console avant la fermeture du processus de test.
  assert.equal((await evaluate('window.blockers.get()')).find((entry) => entry.kind === 'exit' && entry.caseId === 'smoke-terminal').resolved, true);
  // Encoche des permissions : lueur sur la case, Refuser = Échap, Accepter = « 1 », sans modèle sollicité.
  status.register('role-agent', 'hooks', { name: 'Reviewer', cwd: path.resolve(__dirname, '..'), notify: false, kind: 'claude' });
  const ask = async (command) => {
    await hook('role-agent', 'UserPromptSubmit');
    await fetch(hooks.hookUrl('role-agent'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command } }) });
    await until(`document.querySelector('.permission-notch')?.textContent.includes(${JSON.stringify(command)})`);
  };
  await ask('git init perm-repo');
  await until("!!document.querySelector('.react-flow__node[data-id=\"role-agent\"] .terminal-node.awaiting') && !document.querySelector('.react-flow__node[data-id=\"role-agent\"] .status-dot')");
  assert.match(await evaluate("document.querySelector('.permission-notch').textContent"), new RegExp(tr('Reviewer is waiting for your response', 'Reviewer attend ta réponse')));
  assert.equal(await evaluate("[...document.querySelectorAll('.permission-notch button')].filter(b => b.textContent.trim()).length"), 2, 'only yes and no');
  await capture('phase2-permission');
  await button(tr('Refuse', 'Refuser'), "document.querySelector('.permission-notch')");
  await until("!document.querySelector('.permission-notch') && !document.querySelector('.terminal-node.awaiting')");
  assert.equal((await evaluate("window.blockers.get()")).find((entry) => entry.caseId === 'role-agent' && entry.kind === 'permission').resolved, true);
  await ask('npm test');
  await button(tr('Accept', 'Accepter'), "document.querySelector('.permission-notch')");
  await until("!document.querySelector('.permission-notch')");
  assert.equal(status.info('role-agent').status, 'working');
  await hook('role-agent', 'Stop');
  assert.deepEqual(errors, []);
};
