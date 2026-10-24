const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

// Phase 3 sans CLI IA : un « Writer » à hooks simulés transmet à un vrai terminal cmd par un lien à valider.
module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const french = process.env.ORCHESTRA_SMOKE_MODE === 'phase3-fr';
  const tr = (en, fr) => (french ? fr : en);
  const click = async (selector) => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const button = async (text, scope = 'document') => {
    const expression = `[...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
    await until(`!!(${expression})`); await evaluate(`(${expression}).click()`);
  };
  const setValue = (selector, text, proto = 'HTMLTextAreaElement') => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const key = (init) => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ bubbles: true, cancelable: true, ...init })}))`);
  const capture = async (name) => {
    await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(400);
    const image = await win.webContents.capturePage(undefined, { stayHidden: true });
    fs.writeFileSync(path.join(data, name + (french ? '-fr' : '') + '.png'), image.toPNG());
  };
  const settings = () => JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));

  await until(`document.body.textContent.includes(${JSON.stringify(tr('Resume your conversations?', 'Reprendre tes discussions ?'))})`);
  await button(tr('View board', 'Voir le tableau'));
  await until("!document.querySelector('.splash') && Number(getComputedStyle(document.querySelector('.splash-backdrop')).opacity) === 0");
  await until("!!document.querySelector('.react-flow__node[data-id=\"reader\"] .xterm-screen')");
  const ptys = require('../electron/ptyManager.cjs');
  for (let i = 0; i < 100 && !(ptys.buffer('reader') ?? '').includes('>'); i++) await sleep(100);

  // 3.1 — le hook Stop du Writer prépare un brouillon : rien ne part avant l'envoi.
  const status = require('../electron/agentStatus.cjs');
  const hooks = require('../electron/hookServer.cjs');
  status.register('writer', 'hooks', { name: 'Writer', cwd: data, notify: false });
  const hook = (id, event, extra = {}) => fetch(hooks.hookUrl(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hook_event_name: event, ...extra }) }).then((r) => r.json());
  await hook('writer', 'UserPromptSubmit');
  await hook('writer', 'Stop', { last_assistant_message: 'echo first-draft' });
  await until("window.relay.pending().then(list => list.length === 1 && list[0].state === 'draft')");
  await click('.log-wrap .usage-tab');
  await until("!!document.querySelector('.log-pending .pending-message.draft textarea')");
  await setValue('.log-pending textarea', 'echo approved-phase3');
  await button(tr('Send', 'Envoyer'), "document.querySelector('.log-pending')");
  for (let i = 0; i < 50 && !(ptys.buffer('reader') ?? '').includes('approved-phase3'); i++) await sleep(100);
  assert.match(ptys.buffer('reader'), /approved-phase3/);
  await until("!document.querySelector('.log-pending')");
  const log = await evaluate('window.activityLog.get()');
  const taskId = log.find((e) => e.kind === 'draft').taskId;
  assert.deepEqual(log.filter((e) => e.taskId === taskId).map((e) => e.kind), ['draft', 'relay', 'delivered']);
  assert.ok(log.every((e) => e.boardId === 'main'));
  await until(`document.querySelector('.log-state')?.textContent === ${JSON.stringify(tr('sent', 'envoyé'))}`);

  // Deuxième brouillon : visible dans le panneau du lien, abandonné, jamais envoyé.
  await hook('writer', 'UserPromptSubmit');
  await hook('writer', 'Stop', { last_assistant_message: 'echo must-not-run' });
  await until("!!document.querySelector('.log-pending .pending-message.draft')");
  await until("!!document.querySelector('.link-label.has-review .link-review-controls')");
  await click('.link-label-main');
  await until("!!document.querySelector('.link-panel .link-pending .pending-message.draft')");
  assert.equal(await evaluate("document.querySelector('.link-panel input[type=checkbox]:checked') !== null"), true);
  await capture('phase3-review');
  await click(`.link-panel button[title=${JSON.stringify(tr('Close', 'Fermer'))}]`);
  await capture('phase3-inline-review');
  await button(tr('Discard', 'Abandonner'), "document.querySelector('.link-review-controls')");
  await until("!document.querySelector('.pending-message')");
  await until("!document.querySelector('.link-label.has-review')");
  assert.equal(await evaluate("!!document.querySelector('.link-panel')"), false, 'discard does not open the link panel');
  await sleep(1500);
  assert.doesNotMatch(ptys.buffer('reader'), /must-not-run/);

  // 3.2 — filtres : type « Annulé » puis tâche ; les événements restent tous en mémoire.
  await click(`.log-panel button[title=${JSON.stringify(tr('Filters', 'Filtres'))}]`);
  await until("!!document.querySelector('.log-filters')");
  await setValue('.log-filters select:nth-of-type(3)', 'cancelled', 'HTMLSelectElement');
  await until("document.querySelectorAll('.log-entry').length === 1 && document.querySelector('.log-entry').classList.contains('cancelled')");
  await button(tr('Reset', 'Réinitialiser'), "document.querySelector('.log-filters')");
  await click('.log-task');
  await until("[...document.querySelectorAll('.log-entry')].length === 3 && !!document.querySelector('.log-chip')");
  await capture('phase3-log-filters');
  await button(tr('Reset', 'Réinitialiser'), "document.querySelector('.log-filters')");
  assert.equal((await evaluate('window.activityLog.get()')).length, log.length + 2);

  // Validation directement sur le lien : un seul envoi, puis deux brouillons abandonnés séparément.
  await hook('writer', 'UserPromptSubmit');
  await hook('writer', 'Stop', { last_assistant_message: 'echo inline-approved' });
  await until("document.querySelector('.link-review-preview')?.textContent === 'echo inline-approved'");
  await button(tr('Send', 'Envoyer'), "document.querySelector('.link-review-controls')");
  await until("window.relay.pending().then(list => list.length === 0)");
  for (let i = 0; i < 50 && !(ptys.buffer('reader') ?? '').includes('inline-approved'); i++) await sleep(100);
  assert.match(ptys.buffer('reader'), /inline-approved/);
  assert.equal(await evaluate("!!document.querySelector('.link-panel')"), false, 'send does not open the link panel');
  for (const [i, text] of ['echo inline-discard-first', 'echo inline-discard-second'].entries()) {
    await hook('writer', 'UserPromptSubmit');
    await hook('writer', 'Stop', { last_assistant_message: text });
    await until(`window.relay.pending().then(list => list.filter(item => item.state === 'draft').length === ${i + 1})`);
  }
  assert.equal(await evaluate("document.querySelector('.link-review-preview').textContent"), 'echo inline-discard-first');
  await capture('phase3-inline-multiple');
  await button(tr('Discard', 'Abandonner'), "document.querySelector('.link-review-controls')");
  await until("document.querySelector('.link-review-preview')?.textContent === 'echo inline-discard-second'");
  await button(tr('Discard', 'Abandonner'), "document.querySelector('.link-review-controls')");
  await until("!document.querySelector('.link-review-controls')");
  assert.doesNotMatch(ptys.buffer('reader'), /inline-discard/);
  if (!(await evaluate("document.querySelector('.log-wrap .usage-slide').classList.contains('open')"))) await click('.log-wrap .usage-tab');

  // 3.4 — Journal épinglé : un clic ailleurs ne le ferme plus, et la préférence est enregistrée.
  await click(`.log-panel button[title=${JSON.stringify(tr('Pin: keep this panel open', 'Épingler : garder ce panneau ouvert'))}]`);
  await evaluate("document.querySelector('.react-flow__pane').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  await sleep(3400);
  assert.equal(await evaluate("document.querySelector('.log-wrap .usage-slide').classList.contains('open')"), true);
  for (let i = 0; i < 20 && !settings().general.pinned.log; i++) await sleep(100);
  assert.equal(settings().general.pinned.log, true);

  // 3.3 — terminal agrandi : même processus, case inchangée, puis remis en place.
  const before = await evaluate("(({ transform, width, height }) => JSON.stringify({ transform, width, height }))(document.querySelector('.react-flow__node[data-id=\"reader\"]').style)");
  await click(`.react-flow__node[data-id="reader"] button[title=${JSON.stringify(tr('Enlarge the terminal (Ctrl+Shift+M)', 'Agrandir le terminal (Ctrl+Maj+M)'))}]`);
  await until("!!document.querySelector('.terminal-max .xterm-screen') && !!document.querySelector('.react-flow__node[data-id=\"reader\"] .terminal-elsewhere')");
  await evaluate("window.pty.write('reader', 'echo enlarged-ok\\r')");
  for (let i = 0; i < 50 && !(ptys.buffer('reader') ?? '').includes('enlarged-ok\r\n'); i++) await sleep(100);
  await capture('phase3-enlarged');
  await key({ key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true });
  await until("!document.querySelector('.terminal-max') && !!document.querySelector('.react-flow__node[data-id=\"reader\"] .terminal-body .xterm-screen')");
  assert.equal(await evaluate("(({ transform, width, height }) => JSON.stringify({ transform, width, height }))(document.querySelector('.react-flow__node[data-id=\"reader\"]').style)"), before);
  assert.deepEqual(ptys.ids().sort(), ['reader']);

  // 3.3 — recherche : un nom absent, puis une case d'un autre tableau.
  await key({ key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true });
  await until("!!document.querySelector('.search-palette input')");
  await setValue('.search-palette input', 'zzz-none', 'HTMLInputElement');
  await until(`document.querySelector('.search-results').textContent.includes(${JSON.stringify(tr('No tile has this name.', 'Aucune case ne porte ce nom.'))})`);
  await setValue('.search-palette input', 'twin', 'HTMLInputElement');
  await until("document.querySelectorAll('.search-result').length === 2");
  await capture('phase3-search');
  await evaluate("[...document.querySelectorAll('.search-result')].find(b => b.textContent.includes('Other board')).click()");
  await until("document.querySelector('.board-tab.active')?.textContent.includes('Other board') && !document.querySelector('.search-palette')");
  await until("document.querySelector('.react-flow__node[data-id=\"twin-2\"]')?.classList.contains('selected')");
  await sleep(400);
  assert.equal(await evaluate("document.querySelector('.log-wrap .usage-slide').classList.contains('open')"), true, 'pinned log survives a board change');

  // 3.5 — diagnostic : agents du dock et dernier hook de la case simulée.
  await click(`button[title^=${JSON.stringify(tr('Settings', 'Paramètres'))}]`);
  await button(tr('Diagnostics', 'Diagnostic'));
  await until("document.querySelectorAll('.diag-list')[0]?.children.length >= 3");
  await until(`[...document.querySelectorAll('.diag-row')].some(r => r.textContent.includes('Writer') && r.textContent.includes('Stop'))`);
  await capture('phase3-diagnostics');
  const agents = await evaluate('window.diagnostics.agents()');
  assert.ok(agents.every((a) => ['found', 'missing'].includes(a.state)));
  assert.ok(!agents.some((a) => a.id === 'shell'));
  await key({ key: 'Escape' });
  assert.deepEqual(errors, []);
};
