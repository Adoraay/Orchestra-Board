const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'out', 'task-sequences');
fs.mkdirSync(artifacts, { recursive: true });
for (const mode of ['en', 'fr', 'fr-light']) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-sequences-ui-'));
  fs.writeFileSync(path.join(data, 'package.json'), JSON.stringify({ name: 'orchestra-sequences-ui', version: require('../package.json').version, main: path.join(__dirname, 'ui-task-sequences-entry.cjs') }));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ appearance: { theme: mode.endsWith('light') ? 'light' : 'standard' }, general: { language: mode.startsWith('fr') ? 'fr' : 'en', tutorialDone: true, checkUpdates: false, rootPath: data, trustFolders: false, confirmClose: false } }));
  fs.writeFileSync(path.join(data, 'agent-board-imported'), '');
  fs.writeFileSync(path.join(data, 'workspace.json'), JSON.stringify({ version: 2, activeBoardId: 'test', boards: [{ id: 'test', name: 'Tasks demo', nodes: ['a', 'b'].map((id, index) => ({ id, type: 'terminal', position: { x: 40 + index * 720, y: 40 }, style: { width: 640, height: 400 }, data: { agentId: 'claude-code', label: index ? 'Claude Reviewer' : 'Claude Dev', cwd: data } })), edges: [], strokes: [], viewport: { x: 0, y: 0, zoom: 0.65 } }] }));
  const env = { ...process.env, ORCHESTRA_SEQUENCES_UI_DATA: data, ORCHESTRA_SEQUENCES_UI_MODE: mode, ORCHESTRA_SEQUENCES_UI_ARTIFACTS: artifacts };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'electron', 'cli.js'), data], { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  process.stdout.write(result.stdout || '');
  if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error || 'UI test failed'));
    process.stderr.write(`\nIsolated test data: ${data}\n`);
    process.exit(1);
  }
  const absolute = path.resolve(data);
  if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('orchestra-sequences-ui-')) throw new Error('Unsafe cleanup target');
  fs.rmSync(absolute, { recursive: true, force: true });
}
