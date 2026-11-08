const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

// Glisse une languette sur la map avec de vrais événements de glisser-déposer du navigateur.
const dragScript = (tab, x, y, drop) => `(() => {
  const tab = document.querySelector('${tab} .usage-tab');
  const dataTransfer = new DataTransfer();
  const fire = (target, type) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y}, dataTransfer }));
  fire(tab, 'dragstart');
  const target = document.elementFromPoint(${x}, ${y});
  fire(target, 'dragover');
  window.__panelDrag = { fire, target };
  if (${drop}) fire(target, 'drop');
  return true;
})()`;

const saved = (data) => {
  try { return JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).boards[0].nodes.filter((n) => n.type === 'panel'); } catch { return []; }
};
const key = (init) => `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ bubbles: true, ...init })}))`;

// Utilisation et Journal sortis de leur languette et posés sur la map (PLAN.md §3.24).
module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  // Chiffres frais : aucun Claude invisible n'est lancé par le test.
  fs.mkdirSync(path.join(data, 'claude'), { recursive: true });
  const window5h = { utilization: 42, resets_at: new Date(Date.now() + 3600000).toISOString() };
  fs.writeFileSync(path.join(data, 'claude', '.claude.json'), JSON.stringify({ cachedUsageUtilization: { fetchedAtMs: Date.now() + 3600000, utilization: { five_hour: window5h } } }));

  await until("!!document.querySelector('.log-wrap .usage-tab')");
  await sleep(4200); // écran de démarrage
  const usageTab = await evaluate("document.querySelector('.usage-wrap:not(.log-wrap) .usage-tab').draggable");
  assert.equal(usageTab, true);

  // Pendant le survol : aperçu sur la map, rien de créé ; aucun aperçu au-dessus des languettes.
  await evaluate(dragScript('.usage-wrap:not(.log-wrap)', 500, 300, false));
  await until("!!document.querySelector('.drop-preview')");
  assert.equal(await evaluate("document.querySelectorAll('.panel-node').length"), 0);
  await evaluate(`(() => { const r = document.querySelector('.log-wrap .usage-tab').getBoundingClientRect(); const dt = new DataTransfer(); document.querySelector('.log-wrap .usage-tab').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); document.querySelector('.log-wrap .usage-tab').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2, dataTransfer: dt })); return true; })()`);
  await until("!document.querySelector('.drop-preview')");

  // Lâcher : une case de chaque, le tiroir ouvert de ce panneau se referme.
  await evaluate("document.querySelector('.usage-wrap:not(.log-wrap) .usage-tab').click()");
  await until("!!document.querySelector('.usage-wrap:not(.log-wrap) .usage-slide.open')");
  await evaluate(dragScript('.usage-wrap:not(.log-wrap)', 400, 250, true));
  await until("document.querySelectorAll('.panel-node').length === 1");
  await until("!document.querySelector('.usage-wrap:not(.log-wrap) .usage-slide.open')");
  await until("!document.querySelector('.drop-preview')");
  await evaluate(dragScript('.log-wrap', 800, 350, true));
  await until("document.querySelectorAll('.panel-node').length === 2");

  // La case Utilisation lit ses chiffres elle-même, et son agent est gardé.
  await until("document.querySelector('.panel-node .usage-percent')?.textContent.includes('42')");
  await until("[...document.querySelectorAll('.panel-node .usage-agent')].length >= 2");
  await evaluate("[...document.querySelectorAll('.panel-node .usage-agent')].find((b) => b.textContent.includes('Gemini')).click()");
  await until("document.querySelector('.panel-node .usage-agent.active')?.textContent.includes('Gemini')");
  await evaluate("[...document.querySelectorAll('.panel-node .usage-agent')].find((b) => b.textContent.includes('Claude')).click()");
  await until("document.querySelector('.panel-node .usage-agent.active')?.textContent.includes('Claude')");
  await until("document.querySelector('.panel-node .log-list')?.textContent.length > 0");
  await until("document.querySelector('.panel-node .usage-percent')?.textContent.includes('42')");

  // Sauvegarde validée côté Node, type et panneau gardés.
  for (let i = 0; i < 40 && saved(data).length < 2; i++) await sleep(100);
  assert.deepEqual(saved(data).map((n) => n.data.panel).sort(), ['log', 'usage']);
  assert.equal(saved(data).find((n) => n.data.panel === 'usage').data.agentId, 'claude-code');

  // Déplacement par l'en-tête avec une vraie souris ; depuis la liste, la case ne bouge pas.
  const mouse = async (x, y, type) => {
    win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: type === 'mouseMove' ? 0 : 1 });
    await sleep(40);
  };
  const dragFrom = async (selector) => {
    const box = await evaluate(`(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 12) }; })()`);
    await mouse(box.x, box.y, 'mouseMove');
    await mouse(box.x, box.y, 'mouseDown');
    for (const step of [20, 40, 60]) await mouse(box.x + step, box.y + step, 'mouseMove');
    await mouse(box.x + 60, box.y + 60, 'mouseUp');
    await sleep(100);
  };
  const logLeft = "document.querySelector('.panel-node .log-panel').getBoundingClientRect().left";
  const before = await evaluate(logLeft);
  await dragFrom('.panel-node .log-list');
  assert.equal(await evaluate(logLeft), before, 'the log body must not move the tile');
  await dragFrom('.panel-node .log-panel .usage-header');
  assert.ok((await evaluate(logLeft)) > before + 30, 'the header must move the tile');

  await sleep(300);
  await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(100);
  const image = await win.webContents.capturePage(undefined, { stayHidden: true });
  fs.writeFileSync(path.join(data, 'panels-on-map.png'), image.toPNG());

  // × retire la case sans confirmation ; Ctrl+Z la remet.
  await evaluate("document.querySelector('.panel-node .log-panel .panel-actions .icon-button:last-child').click()");
  await until("document.querySelectorAll('.panel-node').length === 1");
  await sleep(500); // une étape de l'historique
  await evaluate(key({ key: 'z', ctrlKey: true }));
  await until("document.querySelectorAll('.panel-node').length === 2");

  // Suppr sur la case choisie : confirmation qui la compte comme panneau.
  await sleep(500);
  await evaluate("document.querySelector('.panel-node .usage-title').click()");
  await until("!!document.querySelector('.panel-node.selected')");
  await evaluate(key({ key: 'Delete' }));
  await until("!!document.querySelector('.dialog #delete-title')");
  assert.ok(/panel/i.test(await evaluate("document.querySelector('#delete-text').textContent")));
  await evaluate("document.querySelector('.dialog .danger-fill').click()");
  await until("document.querySelectorAll('.panel-node').length === 1");

  // Les languettes restent, et le tiroir fonctionne toujours.
  await evaluate("document.querySelector('.log-wrap .usage-tab').click()");
  await until("!!document.querySelector('.log-wrap .usage-slide.open .log-list')");
  assert.deepEqual(errors, []);
};
