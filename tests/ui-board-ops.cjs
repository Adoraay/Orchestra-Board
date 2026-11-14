const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

// Opérations du tableau passées par useBoardOps (outil Lien, panneau du lien, post-it, texte, suppression) :
// elles doivent se comporter exactement comme avant la mise en commun avec le chef d'orchestre.
const board = (data) => {
  try { return JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards[0]; } catch { return null; }
};
const key = (init) => `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ bubbles: true, ...init })}))`;
const node = (id) => `.react-flow__node[data-id="${id}"]`;

module.exports = async ({ evaluate, until, sleep, data, errors }) => {
  const saved = async (check, label) => {
    for (let i = 0; i < 50; i++) {
      const b = board(data);
      if (b && check(b)) return b;
      await sleep(100);
    }
    throw new Error(`Not saved: ${label}; workspace: ${JSON.stringify(board(data))}`);
  };
  const clickPane = (x, y) => evaluate(`(() => {
    const pane = document.querySelector('.react-flow__pane');
    for (const type of ['mousedown', 'mouseup', 'click']) pane.dispatchEvent(new MouseEvent(type, { bubbles: true, view: window, clientX: ${x}, clientY: ${y}, button: 0 }));
    return true;
  })()`);

  await until(`!!document.querySelector('${node('ops-a')}') && !!document.querySelector('${node('ops-b')}')`);
  await sleep(4200); // écran de démarrage

  // Outil Lien : A puis B = lien A → B du type par défaut (Transmission), un clic de plus ne double pas le lien.
  await evaluate(key({ key: 'l' }));
  await until("!!document.querySelector('.board.tool-link')");
  await evaluate(`document.querySelector('${node('ops-a')}').click()`);
  await evaluate(`document.querySelector('${node('ops-b')}').click()`);
  await until("document.querySelectorAll('.react-flow__edge').length === 1");
  await evaluate(`document.querySelector('${node('ops-a')}').click()`);
  await evaluate(`document.querySelector('${node('ops-b')}').click()`);
  await sleep(200);
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__edge').length"), 1);
  let saved1 = await saved((b) => b.edges.length === 1, 'link');
  assert.deepEqual([saved1.edges[0].source, saved1.edges[0].target, saved1.edges[0].data.mode], ['ops-a', 'ops-b', 'relay']);

  // Panneau du lien : Délégation, puis inverser le sens.
  await evaluate(key({ key: 'Escape' }));
  await until("!!document.querySelector('.board.tool-select')");
  await until("!!document.querySelector('.link-label-main')");
  await evaluate("document.querySelector('.link-label-main').click()");
  await until("!!document.querySelector('.link-panel')");
  await evaluate("document.querySelectorAll('.link-panel .link-mode')[1].click()");
  saved1 = await saved((b) => b.edges[0]?.data.mode === 'delegate', 'link mode');
  await evaluate("document.querySelector('.link-direction .text-button').click()");
  saved1 = await saved((b) => b.edges[0]?.source === 'ops-b', 'swap');
  assert.equal(saved1.edges[0].target, 'ops-a');
  assert.equal(saved1.edges[0].data.mode, 'delegate');

  // Supprimer depuis le panneau.
  await evaluate("document.querySelector('.link-panel .link-delete, .link-panel .danger')?.click()");
  await saved((b) => b.edges.length === 0, 'link removed from panel');

  // Clic droit sur un lien en mode Lien : supprimé.
  await evaluate(key({ key: 'l' }));
  await evaluate(`document.querySelector('${node('ops-a')}').click()`);
  await evaluate(`document.querySelector('${node('ops-b')}').click()`);
  await until("document.querySelectorAll('.react-flow__edge').length === 1");
  await evaluate("document.querySelector('.react-flow__edge').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))");
  await until("document.querySelectorAll('.react-flow__edge').length === 0");
  await saved((b) => b.edges.length === 0, 'link removed by right click');
  await evaluate(key({ key: 'Escape' }));
  await evaluate(key({ key: 'Escape' }));

  // Outil Post-it puis Texte : posés au clic, nommé « Note 1 » / ouvert en saisie, retour en Sélection.
  await evaluate(key({ key: 'n' }));
  await until("!!document.querySelector('.board.tool-note')");
  await clickPane(400, 650);
  await until("document.querySelectorAll('.react-flow__node-note').length === 1");
  await until("!!document.querySelector('.board.tool-select')");
  const note = await saved((b) => b.nodes.some((n) => n.type === 'note'), 'note');
  assert.equal(note.nodes.find((n) => n.type === 'note').data.label, 'Note 1');
  await evaluate("document.activeElement?.blur()");
  await evaluate(key({ key: 't' }));
  await until("!!document.querySelector('.board.tool-text')");
  await clickPane(800, 650);
  await until("document.querySelectorAll('.react-flow__node-text').length === 1");
  await evaluate("document.activeElement?.blur()");

  // Suppr sur une case terminal choisie : confirmation, puis case et terminal retirés.
  await sleep(300);
  await evaluate(`document.querySelector('${node('ops-b')} .drag-handle, ${node('ops-b')} .terminal-header').click()`);
  await until(`!!document.querySelector('${node('ops-b')}.selected')`);
  await evaluate(key({ key: 'Delete' }));
  await until("!!document.querySelector('.dialog #delete-title')");
  await evaluate("document.querySelector('.dialog .danger-fill').click()");
  await until(`!document.querySelector('${node('ops-b')}')`);
  await saved((b) => !b.nodes.some((n) => n.id === 'ops-b'), 'terminal removed');
  assert.deepEqual(errors, []);
};
