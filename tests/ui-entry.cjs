const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { app, BrowserWindow } = require('electron');

const data = process.env.ORCHESTRA_SMOKE_DATA;
if (!data || !path.basename(data).startsWith('orchestra-ui-') || path.dirname(data) !== fs.realpathSync(os.tmpdir())) throw new Error('Isolated test data required');
const mode = process.env.ORCHESTRA_SMOKE_MODE;
app.setPath('userData', data);
app.setPath('appData', path.join(data, 'appdata'));
process.env.CODEX_HOME = path.join(data, 'codex');
process.env.CLAUDE_CONFIG_DIR = path.join(data, 'claude');
// Le test n'enregistre aucun raccourci et ne montre pas de fenêtre sur le bureau de l'utilisateur.
app.setAppUserModelId = () => {};
BrowserWindow.prototype.show = () => {};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.on('browser-window-created', (_event, win) => {
  win.webContents.setBackgroundThrottling(false);
  let started = false;
  const errors = [];
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message);
  });
  win.webContents.on('did-finish-load', async () => {
    if (started) return;
    started = true;
    const evaluate = async (expression) => {
      try { return await win.webContents.executeJavaScript(expression); }
      catch (error) { throw new Error(`${expression}: ${error.message}; renderer: ${errors.join('; ')}`); }
    };
    const until = async (expression) => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error(`Timed out: ${expression}; page: ${await evaluate('document.body.textContent.slice(0, 800)')}; errors: ${errors.join('; ')}`);
    };
    try {
      if (mode === 'normal') {
        await until("!!document.querySelector('.topbar')");
        for (let i = 0; i < 50 && !require('../electron/ptyManager.cjs').ids().length; i++) await sleep(100);
        assert.deepEqual(require('../electron/ptyManager.cjs').ids(), ['smoke-terminal']);
        await evaluate(`document.querySelector('button[title^="Settings"]').click()`);
        await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(b => b.textContent === 'General').click()`);
        await until("document.body.textContent.includes('0.1.3')");
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Browse backups').click()`);
      }
      await until("!!document.querySelector('#backup-select')");
      await until("!document.querySelector('.splash') && Number(getComputedStyle(document.querySelector('.splash-backdrop')).opacity) === 0");
      if (mode !== 'no-backup') {
        await win.webContents.capturePage(undefined, { stayHidden: true });
        await sleep(250);
        const image = await win.webContents.capturePage(undefined, { stayHidden: true });
        fs.writeFileSync(path.join(data, `${mode}-backups.png`), image.toPNG());
      }
      await evaluate(`(() => {
        const select = document.querySelector('#backup-select');
        select.value = ${mode === 'no-backup' ? "'new'" : "[...select.options].find(o => o.value && o.value !== 'new').value"};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await evaluate(`document.querySelector('#backup-title').closest('.dialog').querySelector('.dialog-actions button:last-child').click()`);
      await until("!document.querySelector('#backup-select')");
      await evaluate(`document.querySelector('#backup-title').closest('.dialog').querySelector('.dialog-actions button:last-child').click()`);
      await sleep(1000);
      await until(mode === 'no-backup' ? "!!document.querySelector('.topbar')" : "document.body.textContent.includes('Restored original note')");
      await sleep(800);
      const workspace = JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8'));
      assert.deepEqual(require('../electron/ptyManager.cjs').ids(), []);
      if (mode !== 'no-backup') assert.equal(workspace.boards[0].name, 'Original');
      else assert.equal(workspace.boards[0].nodes.length, 0);
      if (mode !== 'normal') {
        const preserved = fs.readdirSync(data).find((file) => file.startsWith('workspace-corrupt-'));
        assert.equal(fs.readFileSync(path.join(data, preserved), 'utf8'), '{ broken');
      }
      assert.deepEqual(errors, []);
      console.log(`PASS UI ${mode}: restored, reloaded, saved correctly; no renderer errors`);
      app.quit();
    } catch (error) {
      console.error(error.stack);
      app.exit(1);
    }
  });
});

require('../electron/main.cjs');
