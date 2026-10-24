const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'out', 'phase1');
fs.mkdirSync(artifacts, { recursive: true });
const original = { version: 2, activeBoardId: 'board-1', boards: [{ id: 'board-1', name: 'Original', nodes: [{ id: 'note-1', type: 'note', position: { x: 100, y: 100 }, data: { label: 'Plan', text: 'Restored original note' } }], edges: [], strokes: [], viewport: { x: 0, y: 0, zoom: 1 } }] };
for (const mode of ['normal', 'corrupt', 'no-backup']) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-ui-'));
  fs.writeFileSync(path.join(data, 'package.json'), JSON.stringify({ name: 'orchestra-smoke', version: require('../package.json').version, main: path.join(__dirname, 'ui-entry.cjs') }));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ general: { tutorialDone: true, checkUpdates: false, language: mode === 'corrupt' ? 'fr' : 'en', rootPath: data, shell: 'cmd', trustFolders: false, confirmClose: false } }));
  fs.writeFileSync(path.join(data, 'agent-board-imported'), '');
  if (mode !== 'no-backup') {
    fs.mkdirSync(path.join(data, 'workspace-backups'));
    fs.writeFileSync(path.join(data, 'workspace-backups', '1700000000000-aaaaaaaa-1111.json'), JSON.stringify(original));
  }
  const liveTerminal = { id: 'smoke-terminal', type: 'terminal', position: { x: 100, y: 100 }, style: { width: 640, height: 400 }, data: { agentId: 'shell', label: 'Smoke terminal', cwd: data } };
  fs.writeFileSync(path.join(data, 'workspace.json'), mode === 'normal' ? JSON.stringify({ ...original, boards: [{ ...original.boards[0], name: 'Latest', nodes: [liveTerminal] }] }) : '{ broken');
  const env = { ...process.env, ORCHESTRA_SMOKE_DATA: data, ORCHESTRA_SMOKE_MODE: mode, ORCHESTRA_SMOKE_ARTIFACTS: artifacts };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'electron', 'cli.js'), data], { cwd: root, env, encoding: 'utf8', timeout: 90000, windowsHide: true });
  process.stdout.write(result.stdout || '');
  if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error || 'Electron smoke failed'));
    process.stderr.write(`\nTest data preserved: ${data}\n`);
    process.exit(1);
  }
  for (const file of fs.readdirSync(data).filter((name) => name.endsWith('.png'))) fs.copyFileSync(path.join(data, file), path.join(artifacts, file));
  fs.rmSync(data, { recursive: true, force: true });
}
