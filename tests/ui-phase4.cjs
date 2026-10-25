const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { stripVTControlCharacters } = require('util');

module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const french = process.env.ORCHESTRA_SMOKE_MODE.endsWith('-fr');
  const tr = (en, fr) => french ? fr : en;
  const click = async (selector) => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const button = async (text, scope = 'document') => {
    const expression = `[...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
    await until(`!!(${expression})`); await evaluate(`(${expression}).click()`);
  };
  const setValue = (selector, text, proto = 'HTMLInputElement') => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const key = (init) => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ bubbles: true, cancelable: true, ...init })}))`);
  const tasks = () => evaluate('window.tasks.list().then(r => r.value.tasks)');
  const taskButton = (text) => button(text, "document.querySelector('.task-editor')");
  const chooseTask = async (title) => evaluate(`[...document.querySelectorAll('.task-item')].find(b => b.querySelector('strong').textContent === ${JSON.stringify(title)}).click()`);
  const capture = async (name) => {
    await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(200);
    fs.writeFileSync(path.join(data, name + (french ? '-fr' : '') + '.png'), (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG());
  };
  const closeTasks = () => click(`.tasks-modal button[title=${JSON.stringify(tr('Close', 'Fermer'))}]`);
  const openTasks = () => click(`.topbar button[title=${JSON.stringify(tr('Tasks', 'Tâches'))}]`);
  const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8'));
  const waitSave = async (predicate) => { for (let i = 0; i < 40; i++) { if (predicate(saved())) return; await sleep(100); } throw new Error('Workspace save did not match expectation'); };
  const create = async (title, depends) => {
    await button(tr('New task', 'Nouvelle tâche'));
    await setValue('.task-title-input', title);
    await setValue('.task-owner-input', 'reader', 'HTMLSelectElement');
    if (depends) await evaluate(`[...document.querySelectorAll('.task-dependencies label')].find(label => label.textContent.includes(${JSON.stringify(depends)})).querySelector('input').click()`);
    await taskButton(tr('Create task', 'Créer la tâche'));
    await until(`window.tasks.list().then(r => r.value.tasks.some(task => task.title === ${JSON.stringify(title)}))`);
  };

  await until(`document.body.textContent.includes(${JSON.stringify(tr('Resume your conversations?', 'Reprendre tes discussions ?'))})`);
  await button(tr('View board', 'Voir le tableau'));
  await until("!document.querySelector('.splash') && Number(getComputedStyle(document.querySelector('.splash-backdrop')).opacity) === 0");
  await until("!!document.querySelector('.react-flow__node[data-id=\"reader\"] .xterm-screen')");
  const ptys = require('../electron/ptyManager.cjs');
  for (let i = 0; i < 80 && !(ptys.buffer('reader') ?? '').includes('>'); i++) await sleep(100);

  // 4.1 — création, cycle refusé, puis réponse distincte de validation.
  await openTasks();
  await create('Build task');
  await create('Review task', 'Build task');
  let list = await tasks();
  assert.equal(list.find((task) => task.title === 'Review task').state, 'blocked');
  await chooseTask('Build task');
  await evaluate("[...document.querySelectorAll('.task-dependencies label')].find(label => label.textContent.includes('Review task')).querySelector('input').click()");
  await taskButton(tr('Save changes', 'Enregistrer les modifications'));
  await until(`document.querySelector('.task-editor [role=alert]')?.textContent.includes(${JSON.stringify(tr('Circular', 'circulaires'))})`);
  await evaluate("document.querySelector('.task-dependencies input').click()");

  // Sans référence, aucun diff HEAD de substitution.
  await taskButton(tr('Changes since task start', 'Changements depuis le début'));
  await until(`document.querySelector('.changes-modal')?.textContent.includes(${JSON.stringify(tr('No task reference', 'Aucune référence de tâche'))})`);
  await click(`.changes-modal button[title=${JSON.stringify(tr('Close', 'Fermer'))}]`);
  await taskButton(tr('Start tracking', 'Démarrer le suivi'));
  await until("window.tasks.list().then(r => r.value.tasks.find(task => task.title === 'Build task')?.state === 'running')");
  const build = (await tasks()).find((task) => task.title === 'Build task');
  assert.equal(build.baseline.state, 'available');
  const repo = path.join(data, 'task-repo');
  fs.writeFileSync(path.join(repo, 'task.txt'), 'already dirty\nnew task line\n');
  fs.writeFileSync(path.join(repo, 'new.txt'), 'new file during task\n');
  await taskButton(tr('Changes since task start', 'Changements depuis le début'));
  await until("document.querySelectorAll('.changes-file').length === 2");
  await click('.changes-file[title="task.txt"]');
  await until("document.querySelector('.changes-code')?.textContent.includes('+new task line')");
  assert.doesNotMatch(await evaluate("document.querySelector('.changes-code').textContent"), /\+already dirty/);
  assert.match(await evaluate("document.querySelector('.shared-worktree').textContent"), /Writer/);
  await capture('phase4-task-diff');
  await click(`.changes-modal button[title=${JSON.stringify(tr('Close', 'Fermer'))}]`);
  await setValue('.task-result-input', 'Result checked manually', 'HTMLTextAreaElement');
  await taskButton(tr('Mark reply received', 'Marquer la réponse reçue'));
  await until("window.tasks.list().then(r => r.value.tasks.find(task => task.title === 'Build task')?.state === 'responded')");
  assert.equal((await tasks()).find((task) => task.title === 'Review task').state, 'blocked');
  await capture('phase4-tasks');
  await taskButton(tr('Validate result', 'Valider le résultat'));
  await until("window.tasks.list().then(r => r.value.tasks.find(task => task.title === 'Review task')?.state === 'todo')");
  await chooseTask('Review task');
  await taskButton(tr('Start tracking', 'Démarrer le suivi'));
  await until("window.tasks.list().then(r => r.value.tasks.find(task => task.title === 'Review task')?.state === 'running')");
  await taskButton(tr('Mark failed', 'Marquer en échec'));
  await until("window.tasks.list().then(r => r.value.tasks.find(task => task.title === 'Review task')?.state === 'failed')");
  await closeTasks();

  // 4.2 — sélection réelle au clic droit, formations, groupe, déplacement et Ctrl+Z.
  const box = await evaluate("(() => { const rects = [...document.querySelectorAll('.react-flow__node')].map(el => el.getBoundingClientRect()); return { x: Math.floor(Math.min(...rects.map(r => r.left)) - 8), y: Math.floor(Math.min(...rects.map(r => r.top)) - 8), right: Math.ceil(Math.max(...rects.map(r => r.right)) + 8), bottom: Math.ceil(Math.max(...rects.map(r => r.bottom)) + 8) }; })()");
  win.webContents.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: box.right, y: box.bottom, modifiers: ['rightButtonDown'] });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: box.right, y: box.bottom, button: 'right', clickCount: 1 });
  await until("document.querySelectorAll('.react-flow__node.selected').length === 4 && !!document.querySelector('.layout-toolbar')");
  await click('.layout-toggle');
  await until("document.querySelectorAll('.layout-choice .formation-illustration').length === 6");
  assert.match(await evaluate("document.querySelector('.layout-choice[data-formation=grid]').textContent"), /2 × 2/);
  await capture('phase4-formations');
  await click('.layout-choice[data-formation="grid"]');
  await until("!document.querySelector('.layout-choices')");
  for (const formation of ['rows3', 'column', 'grid']) {
    await sleep(300);
    await click('.layout-toggle');
    await click(`.layout-choice[data-formation="${formation}"]`);
    await sleep(350);
    const rectangles = await evaluate("[...document.querySelectorAll('.react-flow__node')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })");
    for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
      const a = rectangles[i], b = rectangles[j];
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `no overlap after ${formation}`);
    }
    await capture('phase4-formation-' + formation);
  }
  await setValue('.layout-toolbar input', 'Review team');
  await click(`.layout-toolbar button[title=${JSON.stringify(tr('Group selected tiles', 'Grouper les cases sélectionnées'))}]`);
  await until("document.querySelector('.board-group-name')?.textContent === 'Review team'");
  await evaluate("document.querySelector('.board-group-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  await setValue('.board-group-header input', 'Named team');
  await evaluate("document.querySelector('.board-group-header input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
  await waitSave((workspace) => workspace.boards[0].groups[0]?.name === 'Named team');
  const beforeMove = saved().boards[0].nodes.map(({ id, position }) => ({ id, position }));
  const zoom = await evaluate("new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a");
  const handle = await evaluate("(() => { const r = document.querySelector('.board-group-name').getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + r.height / 2) }; })()");
  win.webContents.sendInputEvent({ type: 'mouseDown', ...handle, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: handle.x + 36, y: handle.y + 24, modifiers: ['leftButtonDown'] });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: handle.x + 36, y: handle.y + 24, button: 'left', clickCount: 1 });
  await waitSave((workspace) => Math.abs(workspace.boards[0].nodes[0].position.x - beforeMove[0].position.x - 36 / zoom) < 1);
  const moved = saved().boards[0].nodes;
  assert.ok(moved.every((node, i) => Math.abs(node.position.x - beforeMove[i].position.x - 36 / zoom) < 1));
  assert.ok(moved.every((node, i) => Math.abs(node.position.y - beforeMove[i].position.y - 24 / zoom) < 1));
  await key({ key: 'z', code: 'KeyZ', ctrlKey: true });
  await waitSave((workspace) => Math.abs(workspace.boards[0].nodes[0].position.x - beforeMove[0].position.x) < 1);
  await capture('phase4-group');
  await evaluate("[...document.querySelectorAll('.board-tab-name')].find(el => el.textContent === 'Other board').closest('.board-tab').click()");
  await until("document.querySelector('.board-tab.active .board-tab-name')?.textContent === 'Other board'");
  await evaluate("[...document.querySelectorAll('.board-tab-name')].find(el => el.textContent === 'Main').closest('.board-tab').click()");
  await until("document.querySelector('.board-group-name')?.textContent === 'Named team'");
  await click(`.board-group button[title=${JSON.stringify(tr('Ungroup without closing tiles', 'Dissocier sans fermer les cases'))}]`);
  await until("!document.querySelector('.board-group')");
  assert.equal(await evaluate("document.querySelectorAll('.react-flow__node').length"), 4);
  assert.deepEqual(ptys.ids(), ['reader']);

  // 4.1 + 4.4 — relais réel dans cmd, même identifiant de tâche, puis export filtré et annulation native.
  const status = require('../electron/agentStatus.cjs');
  const hooks = require('../electron/hookServer.cjs');
  status.register('writer', 'hooks', { name: 'Writer', cwd: repo, notify: false });
  const hook = (event, extra = {}) => fetch(hooks.hookUrl('writer'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hook_event_name: event, ...extra }) }).then((r) => r.json());
  await hook('UserPromptSubmit');
  await hook('Stop', { last_assistant_message: 'echo phase4-automatic' });
  await until("!!document.querySelector('.link-review-controls')");
  await button(tr('Send', 'Envoyer'), "document.querySelector('.link-review-controls')");
  for (let i = 0; i < 50 && !(ptys.buffer('reader') ?? '').includes('phase4-automatic'); i++) await sleep(100);
  assert.match(ptys.buffer('reader'), /phase4-automatic/);
  const auto = (await tasks()).find((task) => task.title === 'echo phase4-automatic');
  assert.ok(auto);
  assert.equal(auto.baseline.state, 'available');
  await until(`window.activityLog.get().then(list => list.some(entry => entry.taskId === ${JSON.stringify(auto.id)} && entry.kind === 'delivered'))`);
  for (let i = 0; i < 50 && !/\r?\nphase4-automatic/.test(stripVTControlCharacters(ptys.buffer('reader') ?? '')); i++) await sleep(100);
  assert.match(stripVTControlCharacters(ptys.buffer('reader')), /\r?\nphase4-automatic/, 'the command is executed, not merely pasted');
  const log = await evaluate('window.activityLog.get()');
  assert.ok(log.some((entry) => entry.taskId === auto.id && entry.kind === 'delivered'));
  await hook('UserPromptSubmit');
  await hook('Stop', { last_assistant_message: 'echo must-not-export-as-sent' });
  await until("!!document.querySelector('.link-review-controls')");
  await button(tr('Discard', 'Abandonner'), "document.querySelector('.link-review-controls')");
  await click('.log-wrap .usage-tab');
  await click(`.log-panel button[title=${JSON.stringify(tr('Filters', 'Filtres'))}]`);
  await setValue('.log-filters select:nth-of-type(3)', 'cancelled', 'HTMLSelectElement');
  await until("document.querySelectorAll('.log-entry').length === 1");
  await click('.log-entry .log-task');
  await click(`.log-panel button[title=${JSON.stringify(tr('Export log', 'Exporter le journal'))}]`);
  await until("!!document.querySelector('.log-export-dialog .link-warning')");
  assert.equal(fs.existsSync(path.join(data, 'export.json')), false);
  await capture('phase4-export');
  await button(tr('Choose file and export', 'Choisir le fichier et exporter'), "document.querySelector('.log-export-dialog')");
  await until("!!document.querySelector('.log-export-result')");
  const exported = JSON.parse(fs.readFileSync(path.join(data, 'export.json'), 'utf8'));
  assert.equal(exported.events.length, 1);
  assert.equal(exported.events[0].state, 'cancelled');
  assert.equal(exported.filter.kind, 'cancelled');
  assert.equal(exported.filter.task, exported.events[0].taskId);
  const previous = fs.readFileSync(path.join(data, 'export.json'), 'utf8');
  process.env.ORCHESTRA_EXPORT_CANCEL = '1';
  await button(tr('Choose file and export', 'Choisir le fichier et exporter'), "document.querySelector('.log-export-dialog')");
  await until(`document.querySelector('.log-export-dialog')?.textContent.includes(${JSON.stringify(tr('Export cancelled', 'Export annulé'))})`);
  assert.equal(fs.readFileSync(path.join(data, 'export.json'), 'utf8'), previous);
  assert.deepEqual(errors, []);
};
