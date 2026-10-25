const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load } = require('./helpers.cjs');

test('source and packaged windows use decoded PNGs and real ICO files for the Windows Shell', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-window-icon-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const png = fs.readFileSync(path.join(__dirname, '../build/icon.png'));
  const ico = fs.readFileSync(path.join(__dirname, '../build/icon.ico'));
  const image = { isEmpty: () => false };
  const { loadWindowIdentity } = load('windowIdentity.cjs', { electron: { nativeImage: { createFromBuffer: (buffer) => {
    assert.deepEqual(buffer, png);
    return image;
  } } } });
  const directory = path.join(root, 'resources', 'app.asar');
  fs.mkdirSync(path.join(directory, 'build'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'build', 'icon.png'), png);
  fs.writeFileSync(path.join(root, 'resources', 'Orchestra.ico'), ico);
  const executable = path.join(root, 'Orchestra.exe');
  const packaged = loadWindowIdentity({ directory, executable });
  assert.equal(packaged.icon, image);
  assert.equal(packaged.details.appId, require('../package.json').build.appId);
  assert.equal(packaged.details.appIconPath, path.join(root, 'resources', 'Orchestra.ico'));
  assert.deepEqual(fs.readFileSync(packaged.details.appIconPath), ico);
  assert.equal(packaged.details.relaunchCommand, `"${executable}"`);
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'build'), { recursive: true });
  fs.writeFileSync(path.join(source, 'build', 'icon.png'), png);
  fs.writeFileSync(path.join(source, 'build', 'icon.ico'), ico);
  fs.writeFileSync(path.join(source, 'launcher.exe'), 'launcher fixture');
  const development = loadWindowIdentity({ directory: source, executable });
  assert.equal(development.icon, image);
  assert.equal(development.details.appIconPath, path.join(source, 'build', 'icon.ico'));
  assert.equal(development.details.relaunchCommand, `"${path.join(source, 'launcher.exe')}"`);
});
