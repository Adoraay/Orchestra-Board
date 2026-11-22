const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

// Outil Lien vers une case Navigateur avec de vrais clics de souris (la page est une webview, un autre
// processus : un clic simulé en JavaScript ne dirait pas où le vrai clic arrive).
const board = (data) => {
  try { return JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards[0]; } catch { return null; }
};

module.exports = async ({ win, evaluate, until, sleep, data }) => {
  const center = (selector) => evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  const click = async ({ x, y }) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await sleep(150);
  };

  // Une fenêtre jamais affichée ne reçoit pas les clics : affichée hors de l'écran, sans prendre le focus.
  win.setPosition(-4000, -4000);
  win.showInactive();
  await until("!!document.querySelector('.react-flow__node[data-id=\"agent\"]') && !!document.querySelector('.browser-webview')");
  await sleep(4200); // écran de démarrage
  // « Reprendre tes discussions ? » : Voir le tableau, sans lancer l'agent (le lien ne dépend que de son type).
  await until("!!document.querySelector('[aria-labelledby=\"resume-title\"]')");
  const choice = process.env.BROWSER_LINK_RUNNING ? 2 : 1; // 2 = Nouvelle discussion : l'agent est lancé
  await evaluate(`document.querySelector('[aria-labelledby="resume-title"] .dialog-actions button:nth-child(${choice})').click()`);
  await until("!document.querySelector('[aria-labelledby=\"resume-title\"]')");
  // Une vraie page chargée (un clic sur une page vide ne prouve pas grand-chose).
  const server = require('http').createServer((_req, res) => res.end('<title>Fixture</title><h1 style="height:2000px">Page</h1>'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await evaluate(`document.querySelector('.browser-webview').loadURL(${JSON.stringify(url)}).then(() => true)`);
  await until("document.querySelector('.browser-tabs [role=tab][aria-selected=true]')?.textContent === 'Fixture'");
  server.close();
  // Comme en vrai : on a d'abord navigué dans la page (elle a le focus) avant de prendre l'outil Lien.
  await click(await center('.browser-pages'));
  await sleep(300);
  await click(await center('[data-tool="link"]'));
  await until("!!document.querySelector('.board.tool-link')");

  await click(await center('.react-flow__node[data-id="agent"] .terminal-header'));
  await until("!!document.querySelector('.link-source')");
  await click(await center('.browser-pages'));
  for (let i = 0; i < 30 && !board(data)?.edges.length; i++) await sleep(100);
  const edges = board(data)?.edges ?? [];
  assert.equal(edges.length, 1, `clicking the page of the browser card must create the link; link source: ${await evaluate("document.querySelector('.link-source')?.className ?? 'none'")}`);
  assert.deepEqual([edges[0].source, edges[0].target, edges[0].data.mode], ['agent', 'browser', 'browser']);
  // Sauvegardé ne suffit pas : le lien doit être dessiné sur la map (React Flow l'ignore sans poignées).
  await until("!!document.querySelector('.react-flow__edge path[d]:not([d=\"\"])')");
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__edge').length"), 1, 'the link is drawn on the map');
};
