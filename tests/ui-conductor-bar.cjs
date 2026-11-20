const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

// Bulle du chef d'orchestre (PLAN.md §3.25) avec un faux claude dans le PATH (tests/fake-claude.cjs) : la
// session cachée appelle les vrais outils d'Orchestra, la map se met à jour. Aucun modèle sollicité.
module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const key = (init) => `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ bubbles: true, cancelable: true, ...init })}))`;
  const type = (text) => evaluate(`(() => {
    const el = document.querySelector('.conductor-form textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const enter = () => evaluate("document.querySelector('.conductor-form textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))");

  await until("!!document.querySelector('.conductor-pill')");
  await sleep(4200); // écran de démarrage

  // Ctrl+Maj+O ouvre la bulle, Échap la referme.
  await evaluate(key({ key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true }));
  await until("!!document.querySelector('.conductor-bar .conductor-empty')");
  await until("document.activeElement === document.querySelector('.conductor-form textarea')");

  // Sans dossier choisi : la racine de l'explorateur sert de dossier de travail.
  await type('hello');
  await enter();
  await until("[...document.querySelectorAll('.conductor-msg.assistant')].some((m) => m.textContent.includes('Fait : hello'))");
  assert.ok((await evaluate("document.querySelector('.conductor-folder').title")).includes(data));
  await until("!document.querySelector('.conductor-send.stop')");

  await evaluate("[...document.querySelectorAll('.tree-row.folder')].find((row) => row.textContent.includes('project')).click()");
  await until("document.querySelector('.conductor-folder').textContent.includes('project')");
  await type('BUILD a small team');
  await enter();
  await until("!document.querySelector('.conductor-error')");

  // Aperçu (par défaut) : les actions s'affichent au fil de l'eau, la map montre des fantômes, rien n'est créé.
  const settled = "!document.querySelector('.conductor-send.stop') && !!document.querySelector('.conductor-plan')";
  await until("document.querySelectorAll('.conductor-tool').length === 3");
  await until("[...document.querySelectorAll('.conductor-msg.assistant')].some((m) => m.textContent.includes('Fait : BUILD a small team'))");
  await until(settled);
  const tools = await evaluate("[...document.querySelectorAll('.conductor-tool')].map((t) => ({ text: t.textContent, error: t.classList.contains('error') }))");
  assert.match(tools[0].text, /Creating the agent Worker \(Terminal\)/);
  assert.match(tools[1].text, /Writing the sticky note Plan/);
  assert.equal(tools[2].error, true, 'a refused tool is shown in red with its reason');
  assert.equal(tools[0].error, false);
  await until("document.querySelectorAll('.react-flow__node-ghost').length === 2");
  assert.match(await evaluate("document.querySelector('.conductor-plan-title').textContent"), /Proposed plan · 2 actions/);
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__node-terminal').length"), 0, 'nothing is created before approval');
  assert.match(await evaluate("document.querySelector('.ghost-agent').textContent"), /Worker.*Proposed/);
  const savedBoard = () => JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards[0];
  assert.equal(savedBoard().nodes.some((n) => n.type === 'ghost'), false, 'ghosts are never saved');
  await sleep(900);
  await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(100);
  // Fantômes visibles sous la bulle (la caméra cadre la partie de la map qu'elle ne cache pas).
  const barBottom = await evaluate("document.querySelector('.conductor-bar').getBoundingClientRect().bottom");
  const ghostTops = await evaluate("[...document.querySelectorAll('.react-flow__node-ghost')].map((g) => g.getBoundingClientRect().top)");
  assert.ok(ghostTops.every((top) => top > barBottom), `ghosts hidden behind the bar: ${ghostTops} <= ${barBottom}`);
  fs.writeFileSync(path.join(data, 'conductor-preview.png'), (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG());

  // Correction en une phrase : l'ancien plan disparaît, un nouveau est proposé.
  await type('BUILD it again');
  await enter();
  await until("!document.querySelector('.conductor-plan')");
  await until("[...document.querySelectorAll('.conductor-msg.assistant')].some((m) => m.textContent.includes('rejected your proposed plan'))");
  await until(settled);
  await until("document.querySelectorAll('.react-flow__node-ghost').length === 2");

  // Annuler : plus de fantômes, rien de créé.
  await evaluate("[...document.querySelectorAll('.conductor-plan-actions button')].find((b) => b.textContent.includes('Cancel')).click()");
  await until("document.querySelectorAll('.react-flow__node-ghost').length === 0 && !document.querySelector('.conductor-plan')");
  await until("[...document.querySelectorAll('.conductor-msg.info')].some((m) => m.textContent.includes('Plan cancelled'))");
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__node-terminal').length"), 0);

  // Pendant la construction : encart au centre, aucun fantôme ; tout apparaît une fois le plan fini.
  await type('BUILD final PAUSE');
  await enter();
  await until("!!document.querySelector('.conductor-composing')");
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__node-ghost').length"), 0, 'nothing shows while composing');
  await until("/Writing the sticky note Plan/.test(document.querySelector('.conductor-composing')?.textContent ?? '')");
  await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(100);
  fs.writeFileSync(path.join(data, 'conductor-composing.png'), (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG());
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__node-ghost').length"), 0);
  await until(settled);
  assert.equal(await evaluate("!!document.querySelector('.conductor-composing')"), false);

  // Réponse en Markdown : gras et code mis en forme, aucune marque visible.
  const reply = "[...document.querySelectorAll('.conductor-msg.assistant')].at(-1)";
  await until(`${reply}.querySelector('li strong')?.textContent === 'Worker'`);
  assert.equal(await evaluate(`${reply}.querySelector('li code').textContent`), 'Plan');
  assert.equal(await evaluate(`${reply}.textContent.includes('**')`), false);

  // Valider : les cases arrivent là où étaient les fantômes.
  await until("document.querySelectorAll('.react-flow__node-ghost').length === 2");
  const ghostAt = await evaluate("(() => { const g = document.querySelector('.react-flow__node-ghost .ghost-agent').closest('.react-flow__node'); return g.style.transform; })()");
  await evaluate("[...document.querySelectorAll('.conductor-plan-actions button')].find((b) => b.textContent.includes('Approve')).click()");
  await until("[...document.querySelectorAll('.react-flow__node-terminal')].some((n) => n.textContent.includes('Worker'))");
  await until("[...document.querySelectorAll('.react-flow__node-note')].some((n) => n.textContent.includes('Build'))");
  await until("document.querySelectorAll('.react-flow__node-ghost').length === 0");
  await until("[...document.querySelectorAll('.conductor-msg.info')].some((m) => m.textContent.includes('Plan applied: 2 of 2'))");
  const workerAt = await evaluate("[...document.querySelectorAll('.react-flow__node-terminal')].find((n) => n.textContent.includes('Worker')).style.transform");
  assert.equal(workerAt, ghostAt, 'the tile lands where its ghost was');
  for (let i = 0; i < 30 && !savedBoard().nodes.some((n) => n.data.label === 'Worker'); i++) await sleep(100);
  const worker = savedBoard().nodes.find((n) => n.data.label === 'Worker');
  assert.equal(worker.data.createdBy, 'conductor');
  assert.equal(worker.data.cwd, path.join(data, 'project'));
  const log = await evaluate('window.activityLog.get()');
  assert.equal(log.filter((e) => e.kind === 'conductor').length, 2, 'only approved changes reach the log');
  assert.ok(log.filter((e) => e.kind === 'conductor').every((e) => e.fromName === 'Conductor'));

  // Échap : bulle fermée, pastille ; la conversation reste à la réouverture.
  await evaluate("document.querySelector('.conductor-form textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await until("!!document.querySelector('.conductor-pill') && !document.querySelector('.conductor-bar')");
  await evaluate("document.querySelector('.conductor-pill').click()");
  await until("document.querySelectorAll('.conductor-msg.user').length === 4");

  // Erreur du CLI (pas connecté…) : affichée dans la conversation.
  await type('FAIL now');
  await enter();
  await until("[...document.querySelectorAll('.conductor-msg.error')].some((m) => m.textContent.includes('not logged in'))");
  await until("!document.querySelector('.conductor-send.stop')");

  // « Fais un nouveau tableau avec… » : le tableau s'ouvre, le plan s'y affiche, la conversation le suit.
  const tabs = "document.querySelectorAll('.board-tab').length";
  const before = await evaluate(tabs);
  await type('NEWBOARD with a server');
  await enter();
  await until(`${tabs} === ${before + 1}`);
  await until("document.querySelector('.board-tab.active')?.textContent.includes('API')");
  await until("!document.querySelector('.conductor-send.stop') && !!document.querySelector('.conductor-plan')");
  await until("document.querySelectorAll('.react-flow__node-ghost').length === 1");
  assert.ok(await evaluate("[...document.querySelectorAll('.conductor-msg.user')].some((m) => m.textContent.includes('NEWBOARD'))"), 'same conversation on the new board');
  await evaluate("[...document.querySelectorAll('.conductor-plan-actions button')].find((b) => b.textContent.includes('Approve')).click()");
  await until("[...document.querySelectorAll('.react-flow__node-terminal')].some((n) => n.textContent.includes('Server'))");
  for (let i = 0; i < 30 && !JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards.some((b) => b.name === 'API' && b.nodes.some((n) => n.data.label === 'Server')); i++) await sleep(100);
  assert.ok(JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards.some((b) => b.name === 'API' && b.nodes.some((n) => n.data.label === 'Server')));

  // Même demande puis Annuler : le tableau créé pour l'aperçu, resté vide, disparaît.
  await type('NEWBOARD again');
  await enter();
  await until(`${tabs} === ${before + 2}`);
  await until("!document.querySelector('.conductor-send.stop') && !!document.querySelector('.conductor-plan')");
  await evaluate("[...document.querySelectorAll('.conductor-plan-actions button')].find((b) => b.textContent.includes('Cancel')).click()");
  await until(`${tabs} === ${before + 1}`);

  // Nouvelle conversation : historique vidé.
  await until(`document.querySelector('.conductor-header button[title="New conversation"]')?.disabled === false && !document.querySelector('.conductor-send.stop')`);
  await sleep(300);
  await evaluate(`document.querySelector('.conductor-header button[title="New conversation"]').click()`);
  await until("!!document.querySelector('.conductor-empty')");
  assert.deepEqual(errors, []);
};
