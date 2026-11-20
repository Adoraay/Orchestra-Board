const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ipcMain } = require('electron');
const { createMcpCatalog } = require('../electron/mcpCatalog.cjs');
const ptyManager = require('../electron/ptyManager.cjs');

module.exports = async ({ evaluate, until, data, errors }) => {
  ipcMain.removeHandler('agents:testCommand');
  ipcMain.handle('agents:testCommand', () => ({ ok: true }));
  const catalog = createMcpCatalog(data);
  const launches = new Map();
  ptyManager.create = ({ id, cwd }) => {
    const { boards, activeBoardId } = require('../electron/workspaceStore.cjs').get();
    const board = boards.find((board) => board.id === activeBoardId);
    launches.set(id, { cwd, servers: Object.keys(catalog.resolve(board.id, id)) });
    return { buffer: '' };
  };
  const projectA = path.join(data, 'project-a');
  const projectB = path.join(data, 'project-b');
  const projectC = path.join(data, 'project-c');
  fs.mkdirSync(projectA);
  fs.mkdirSync(projectB);
  fs.mkdirSync(projectC);
  const existingBacklog = '- [~] Existing project item\r\n';
  fs.writeFileSync(path.join(projectA, 'BACKLOG.md'), existingBacklog);

  const click = async (selector) => {
    await until(`!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const button = async (name) => {
    const element = `[...document.querySelectorAll('.team-modal button')].find(b => b.textContent.trim() === ${JSON.stringify(name)})`;
    await until(`!!(${element}) && !(${element}).disabled`);
    await evaluate(`(${element}).click()`);
  };
  const type = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  const created = async (name, project, url, enterprise = false) => {
    await button('Create a new board');
    await until(`!document.querySelector('.team-modal') && document.querySelector('.board-tab.active')?.textContent.includes(${JSON.stringify(name)})`);
    await until(`document.querySelectorAll('.react-flow__node-terminal .xterm-screen').length === ${enterprise ? 7 : 3}`);
    const { activeBoardId, boards } = await evaluate('window.workspace.get()');
    const board = boards.find((entry) => entry.id === activeBoardId);
    const lead = board.nodes.find((node) => node.data.label === (enterprise ? 'Tech lead' : 'Lead'));
    const qa = board.nodes.find((node) => node.data.label === (enterprise ? 'QA auditor' : 'QA'));
    const runner = board.nodes.find((node) => node.type === 'visualTest');
    const plan = board.nodes.find((node) => node.type === 'note');
    assert.ok(board.nodes.filter((node) => node.type === 'terminal').every((node) => node.data.cwd === project));
    assert.deepEqual(launches.get(lead.id), { cwd: project, servers: ['linear'] });
    assert.deepEqual(launches.get(qa.id), { cwd: project, servers: ['chrome-devtools'] });
    assert.equal(runner.data.url, url);
    assert.ok(board.edges.some(({ source, target, data }) => source === qa.id && target === runner.id && data.mode === 'visual'));
    const { state: file } = await evaluate(`window.notes.getFile(${JSON.stringify(plan.id)})`);
    assert.equal(file.name, 'BACKLOG.md');
    assert.equal(path.relative(project, file.file), 'BACKLOG.md');
    if (project === projectA) assert.match(file.text, /Existing project item/);
    else assert.match(fs.readFileSync(path.join(project, 'BACKLOG.md'), 'utf8'), /Confirm the issue and acceptance criteria/);
    return board;
  };

  await until("!!document.querySelector('.topbar') && !document.querySelector('.splash')");
  await click('.teams-toggle');
  await until("[...document.querySelectorAll('.team-item strong')].some(el => el.textContent === 'Project maintenance')");
  await evaluate("[...document.querySelectorAll('.team-item')].find(el => el.textContent.includes('Project maintenance')).click()");
  await until("document.querySelector('.team-details')?.textContent.includes('chrome-devtools')");
  await type('.team-details .field-row input', projectA);
  await type('.team-details input[inputmode="url"]', 'http://localhost:3001/tasks');
  const first = await created('Project maintenance', projectA, 'http://localhost:3001/tasks');
  assert.equal(fs.readFileSync(path.join(projectA, 'BACKLOG.md'), 'utf8'), existingBacklog);

  await click('.teams-toggle');
  await button('Save this board');
  await type('.team-details input[maxlength="40"]', 'Saved maintenance');
  await button('Save as a template');
  await until("document.querySelector('.team-heading')?.textContent === 'Saved maintenance'");
  await type('.team-details .field-row input', projectB);
  await type('.team-details input[inputmode="url"]', 'http://localhost:3002');
  const second = await created('Saved maintenance', projectB, 'http://localhost:3002/tasks');
  assert.ok(second.nodes.every((node) => !first.nodes.some(({ id }) => id === node.id)));

  await click('.teams-toggle');
  await until("[...document.querySelectorAll('.team-item strong')].some(el => el.textContent === 'Enterprise squad')");
  await evaluate("[...document.querySelectorAll('.team-item')].find(el => el.textContent.includes('Enterprise squad')).click()");
  await until("document.querySelector('.team-heading')?.textContent === 'Enterprise squad'");
  await type('.team-details .field-row input', projectC);
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.team-agent-row')].find(element => element.textContent.includes('Backend developer'));
    const select = row.querySelector('select');
    select.value = 'claude-code';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const squad = await created('Enterprise squad', projectC, '', true);
  assert.equal(squad.nodes.find((node) => node.data.label === 'Architect').data.agentId, 'antigravity');
  assert.equal(squad.nodes.find((node) => node.data.label === 'Backend developer').data.agentId, 'claude-code');
  assert.equal(squad.nodes.find((node) => node.data.label === 'QA auditor').data.agentId, 'codex');
  assert.deepEqual(errors, []);
};
