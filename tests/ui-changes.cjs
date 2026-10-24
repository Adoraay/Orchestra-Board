const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

module.exports = async ({ win, evaluate, until, sleep, data, errors }) => {
  const click = async (selector) => {
    await until(`!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  await until("document.body.textContent.includes('Resume your conversations?')");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'View board').click()");
  await until("!document.querySelector('.splash')");
  let last = Date.now(); let gap = 0;
  const heartbeat = setInterval(() => { const now = Date.now(); gap = Math.max(gap, now - last); last = now; }, 20);
  try {
    const started = Date.now();
    await click('.react-flow__node[data-id="diff-0"] .case-tab:first-child');
    await until("!!document.querySelector('.changes-scope') && document.querySelector('.shared-worktree')?.textContent.includes('Agent 2')");
    const elapsed = Date.now() - started;
    assert.ok(await evaluate("document.querySelectorAll('.changes-file').length <= 500"));
    if (await evaluate("!!document.querySelector('.changes-file[title=" + JSON.stringify('node_modules/') + "]')")) {
      await click('.changes-file[title="node_modules/"]');
      await until("!!document.querySelector('.changes-directory')");
      assert.equal(await evaluate("!!document.querySelector('.changes-code')"), false);
      await click('.changes-directory button');
      await until("!!document.querySelector('.changes-code') || !!document.querySelector('.changes-diff .changes-message')");
      assert.ok(await evaluate("document.querySelectorAll('.changes-file').length <= 500"));
    }
    const small = process.env.ORCHESTRA_SMOKE_FILE;
    if (small) {
      await click(`.changes-file[title=${JSON.stringify(small)}]`);
      await until("!!document.querySelector('.changes-code')");
      assert.ok(await evaluate("document.querySelectorAll('.changes-line').length <= 2001"));
    }
    for (let i = 0; i < 2; i++) {
      await click('.changes-actions button[title="Refresh"]');
      await until("!document.querySelector('.changes-actions button[title=" + JSON.stringify('Refresh') + "]').disabled");
      await until("!!document.querySelector('.changes-code') || !!document.querySelector('.changes-directory') || !!document.querySelector('.changes-diff .changes-message')");
    }
    await win.webContents.capturePage(undefined, { stayHidden: true }); await sleep(100);
    const image = await win.webContents.capturePage(undefined, { stayHidden: true });
    fs.writeFileSync(path.join(data, 'changes-regression.png'), image.toPNG());
    await click('.changes-modal button[title="Close"]');
    await until("!document.querySelector('.changes-modal')");
    assert.ok(gap < 1500, `Main process stalled for ${gap} ms`);
    assert.deepEqual(errors, []);
    console.log(`PASS UI changes: opened in ${elapsed} ms; bounded directory expansion, preview and refresh; maximum main-process heartbeat gap ${gap} ms`);
  } finally { clearInterval(heartbeat); }
};
