const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'out', 'ui-smoke');
fs.mkdirSync(artifacts, { recursive: true });
const original = { version: 2, activeBoardId: 'board-1', boards: [{ id: 'board-1', name: 'Original', nodes: [{ id: 'note-1', type: 'note', position: { x: 100, y: 100 }, data: { label: 'Plan', text: 'Restored original note' } }], edges: [], strokes: [], viewport: { x: 0, y: 0, zoom: 1 } }] };
const requested = process.argv.slice(2);
const modes = ['normal', 'corrupt', 'no-backup', 'phase2', 'phase2-fr', 'phase3', 'phase3-fr', 'changes', 'phase4', 'phase4-fr', 'onboarding', 'onboarding-fr'].filter((mode) => !requested.length || requested.includes(mode));
if (!modes.length) throw new Error('Choose a mode from tests/ui-smoke.cjs');
for (const mode of modes) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-ui-'));
  fs.writeFileSync(path.join(data, 'package.json'), JSON.stringify({ name: 'orchestra-smoke', version: require('../package.json').version, main: path.join(__dirname, 'ui-entry.cjs') }));
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ general: { tutorialDone: !mode.startsWith('onboarding'), checkUpdates: false, language: mode.endsWith('-fr') || mode === 'corrupt' ? 'fr' : 'en', rootPath: data, shell: 'cmd', trustFolders: false, confirmClose: false } }));
  fs.writeFileSync(path.join(data, 'agent-board-imported'), '');
  if (mode !== 'no-backup') {
    fs.mkdirSync(path.join(data, 'workspace-backups'));
    fs.writeFileSync(path.join(data, 'workspace-backups', '1700000000000-aaaaaaaa-1111.json'), JSON.stringify(original));
  }
  const liveTerminal = { id: 'smoke-terminal', type: 'terminal', position: { x: 100, y: 100 }, style: { width: 640, height: 400 }, data: { agentId: 'shell', label: 'Smoke terminal', cwd: data } };
  const phase2 = { version: 2, activeBoardId: 'roles', boards: [
    { id: 'roles', name: 'Roles', nodes: [{ ...liveTerminal, id: 'role-agent', data: { agentId: 'claude-code', label: 'Reviewer', role: 'Old active role', cwd: root } }, { ...liveTerminal, position: { x: 800, y: 100 } }], edges: [], strokes: [], viewport: { x: 0, y: 0, zoom: 0.7 } },
    { id: 'peer', name: 'Other board', nodes: [{ ...liveTerminal, id: 'peer-agent', data: { agentId: 'codex', label: 'Peer', cwd: path.join(root, 'src') } }], edges: [], strokes: [], viewport: null },
    { id: 'notes', name: 'Notes', nodes: original.boards[0].nodes, edges: [], strokes: [], viewport: null },
  ] };
  const phase3 = { version: 2, activeBoardId: 'main', boards: [
    { id: 'main', name: 'Main', viewport: { x: 0, y: 0, zoom: 0.6 }, strokes: [],
      nodes: [
        { ...liveTerminal, id: 'writer', data: { agentId: 'claude-code', label: 'Writer', cwd: data } },
        { ...liveTerminal, id: 'reader', position: { x: 1100, y: 100 }, data: { agentId: 'shell', label: 'Twin', cwd: data } },
      ],
      edges: [{ id: 'review-link', source: 'writer', target: 'reader', data: { mode: 'relay', prompt: '{response}', maxTurns: 3, enabled: true, review: true } }] },
    { id: 'other', name: 'Other board', viewport: null, strokes: [], edges: [],
      nodes: [{ ...liveTerminal, id: 'twin-2', data: { agentId: 'codex', label: 'Twin', cwd: data } }] },
  ] };
  const repo = process.env.ORCHESTRA_SMOKE_REPO || root;
  const taskRepo = path.join(data, 'task-repo');
  if (mode.startsWith('phase4')) {
    // Dépôt de test sans commit : aucun git init/commit ni écriture dans le dépôt du projet.
    fs.mkdirSync(path.join(taskRepo, '.git', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(taskRepo, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(taskRepo, '.git', 'HEAD'), 'ref: refs/heads/test\n');
    fs.writeFileSync(path.join(taskRepo, '.git', 'config'), '[core]\nrepositoryformatversion = 0\nbare = false\n');
    fs.writeFileSync(path.join(taskRepo, 'task.txt'), 'already dirty\n');
  }
  const phase4 = { version: 2, activeBoardId: 'main', boards: [
    { id: 'main', name: 'Main', viewport: { x: 0, y: 0, zoom: 0.6 }, strokes: [], groups: [],
      nodes: [
        { ...liveTerminal, id: 'reader', data: { agentId: 'shell', label: 'Worker', cwd: taskRepo } },
        { ...liveTerminal, id: 'writer', position: { x: 1100, y: 100 }, data: { agentId: 'claude-code', label: 'Writer', cwd: taskRepo } },
        { id: 'note-a', type: 'note', position: { x: 100, y: 620 }, style: { width: 270, height: 180 }, data: { label: 'Plan', text: 'One' } },
        { id: 'note-b', type: 'note', position: { x: 850, y: 630 }, style: { width: 270, height: 180 }, data: { label: 'Notes', text: 'Two' } },
      ], edges: [{ id: 'review-link', source: 'writer', target: 'reader', data: { mode: 'relay', prompt: '{response}', enabled: true, review: true, maxTurns: 3 } }] },
    { id: 'other', name: 'Other board', viewport: null, nodes: [], edges: [], strokes: [] },
  ] };
  const changes = { version: 2, activeBoardId: 'changes', boards: [{ id: 'changes', name: 'Changes regression', edges: [], strokes: [], viewport: { x: 0, y: 0, zoom: 0.8 }, nodes: [0, 1].map((i) => ({ ...liveTerminal, id: `diff-${i}`, position: { x: 100 + i * 760, y: 100 }, data: { agentId: 'claude-code', label: `Agent ${i + 1}`, cwd: repo } })) }] };
  fs.writeFileSync(path.join(data, 'workspace.json'), mode.startsWith('onboarding') ? JSON.stringify({ ...original, boards: [{ ...original.boards[0], nodes: [] }] }) : mode.startsWith('phase4') ? JSON.stringify(phase4) : mode === 'changes' ? JSON.stringify(changes) : mode.startsWith('phase3') ? JSON.stringify(phase3) : mode.startsWith('phase2') ? JSON.stringify(phase2) : mode === 'normal' ? JSON.stringify({ ...original, boards: [{ ...original.boards[0], name: 'Latest', nodes: [liveTerminal] }] }) : '{ broken');
  const env = { ...process.env, ORCHESTRA_SMOKE_DATA: data, ORCHESTRA_SMOKE_MODE: mode, ORCHESTRA_SMOKE_ARTIFACTS: artifacts };
  delete env.ELECTRON_RUN_AS_NODE;
  const branded = process.env.ORCHESTRA_SMOKE_BRANDED === '1';
  const result = spawnSync(branded ? path.join(root, 'node_modules', 'electron', 'dist', 'Orchestra.exe') : process.execPath, branded ? [data] : [path.join(root, 'node_modules', 'electron', 'cli.js'), data], { cwd: root, env, encoding: 'utf8', timeout: 90000, windowsHide: true });
  process.stdout.write(result.stdout || '');
  if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error || 'Electron smoke failed'));
    process.stderr.write(`\nTest data preserved: ${data}\n`);
    process.exit(1);
  }
  for (const file of fs.readdirSync(data).filter((name) => name.endsWith('.png'))) fs.copyFileSync(path.join(data, file), path.join(artifacts, file));
  fs.rmSync(data, { recursive: true, force: true });
}
