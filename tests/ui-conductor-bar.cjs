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

  // Les actions s'affichent au fil de l'eau ; la map reçoit la case et le post-it.
  await until("document.querySelectorAll('.conductor-tool').length === 3");
  await until("[...document.querySelectorAll('.conductor-msg.assistant')].some((m) => m.textContent.includes('Fait : BUILD a small team'))");
  await until("!document.querySelector('.conductor-pill') && !document.querySelector('.conductor-send.stop')");
  const tools = await evaluate("[...document.querySelectorAll('.conductor-tool')].map((t) => ({ text: t.textContent, error: t.classList.contains('error') }))");
  assert.match(tools[0].text, /Creating the agent Worker \(Terminal\)/);
  assert.match(tools[1].text, /Writing the sticky note Plan/);
  assert.equal(tools[2].error, true, 'a refused tool is shown in red with its reason');
  assert.equal(tools[0].error, false);
  await until("[...document.querySelectorAll('.react-flow__node-terminal')].some((n) => n.textContent.includes('Worker'))");
  await until("[...document.querySelectorAll('.react-flow__node-note')].some((n) => n.textContent.includes('Build'))");
  const saved = JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards[0];
  const worker = saved.nodes.find((n) => n.data.label === 'Worker');
  assert.equal(worker.data.createdBy, 'conductor');
  assert.equal(worker.data.cwd, path.join(data, 'project'));
  await sleep(900);
  await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(100);
  fs.writeFileSync(path.join(data, 'conductor-bar.png'), (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG());
  const log = await evaluate('window.activityLog.get()');
  assert.ok(log.filter((e) => e.kind === 'conductor').every((e) => e.fromName === 'Conductor'));

  // Échap : bulle fermée, pastille ; la conversation reste à la réouverture.
  await evaluate("document.querySelector('.conductor-form textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await until("!!document.querySelector('.conductor-pill') && !document.querySelector('.conductor-bar')");
  await evaluate("document.querySelector('.conductor-pill').click()");
  await until("document.querySelectorAll('.conductor-msg.user').length === 2");

  // Erreur du CLI (pas connecté…) : affichée dans la conversation.
  await type('FAIL now');
  await enter();
  await until("[...document.querySelectorAll('.conductor-msg.error')].some((m) => m.textContent.includes('not logged in'))");
  await until("!document.querySelector('.conductor-send.stop')");

  // Nouvelle conversation : historique vidé.
  await evaluate(`document.querySelector('.conductor-header button[title="New conversation"]').click()`);
  await until("!!document.querySelector('.conductor-empty')");
  assert.deepEqual(errors, []);
};
