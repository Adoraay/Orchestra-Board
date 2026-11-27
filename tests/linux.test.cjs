const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers.cjs');

// Charge un module d'electron/ avec un faux « process » (plateforme, variables d'environnement).
function loadWithProcess(name, fakeProcess, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../electron', name), 'utf8');
  const module = { exports: {} };
  new Function('require', 'module', 'process', source)((id) => mocks[id] ?? require(id), module, fakeProcess);
  return module.exports;
}

test('Linux terminals start the login shell of the user, fish included', () => {
  const manager = loadWithProcess('ptyManager.cjs', { platform: 'linux', env: { SHELL: '/usr/bin/fish' } }, { 'node-pty': {} });
  assert.deepEqual(manager.resolveShell('default'), { file: '/usr/bin/fish', args: ['-l'] });
  assert.deepEqual(manager.resolveShell('powershell'), { file: '/usr/bin/fish', args: ['-l'] });
  assert.deepEqual(manager.resolveShell('bash'), { file: '/bin/bash', args: ['-l'] });
});

test('Linux takes the PATH of the login shell at startup', async () => {
  const calls = [];
  const fakeProcess = { platform: 'linux', env: { SHELL: '/usr/bin/fish', PATH: '/usr/bin' } };
  const shellEnv = loadWithProcess('shellEnv.cjs', fakeProcess, {
    child_process: { execFile(file, args, _options, done) {
      calls.push({ file, args });
      done(null, '\u001b]10;rgb:e4/e1/e7\u001b\\__ORCHESTRA_PATH__/home/me/.local/bin:/usr/bin__ORCHESTRA_PATH__');
    } },
  });
  await shellEnv.loadLoginPath();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, '/usr/bin/fish');
  assert.equal(fakeProcess.env.PATH, '/home/me/.local/bin:/usr/bin');
});

test('Windows keeps its own PATH', async () => {
  const fakeProcess = { platform: 'win32', env: { PATH: 'C:\\Windows' } };
  const shellEnv = loadWithProcess('shellEnv.cjs', fakeProcess, {
    child_process: { execFile() { throw new Error('should not run'); } },
  });
  await shellEnv.loadLoginPath();
  assert.equal(fakeProcess.env.PATH, 'C:\\Windows');
});

test('Visual tests fall back to Chromium on Linux without Google Chrome', () => {
  const { browserOptions } = load('visualTestRunner.cjs');
  const envPath = ['/usr/local/bin', '/usr/bin'].join(path.delimiter);
  const only = (...files) => (file) => files.includes(file);

  assert.deepEqual(browserOptions({ platform: 'win32', envPath, exists: only() }), { channel: 'chrome' });
  assert.deepEqual(browserOptions({ platform: 'darwin', envPath, exists: only() }), { channel: 'chrome' });
  assert.deepEqual(browserOptions({ platform: 'linux', envPath, exists: only('/opt/google/chrome/chrome', '/usr/bin/chromium') }), { channel: 'chrome' });
  assert.deepEqual(
    browserOptions({ platform: 'linux', envPath, exists: only(path.join('/usr/bin', 'chromium')) }),
    { executablePath: path.join('/usr/bin', 'chromium') },
  );
  assert.deepEqual(
    browserOptions({ platform: 'linux', envPath, exists: only(path.join('/usr/bin', 'chromium'), path.join('/usr/bin', 'google-chrome-stable')) }),
    { executablePath: path.join('/usr/bin', 'google-chrome-stable') },
  );
  assert.deepEqual(browserOptions({ platform: 'linux', envPath, exists: only() }), { channel: 'chrome' });
});
