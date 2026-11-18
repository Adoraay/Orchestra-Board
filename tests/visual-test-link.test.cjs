const test = require('node:test');
const assert = require('node:assert/strict');
const { load, i18n } = require('./helpers.cjs');

const visualLink = load('visualTestLink.cjs', { './i18n.cjs': i18n });
const workspaceStore = load('workspaceStore.cjs', {
  electron: {}, './settingsStore.cjs': { MODEL: /^[\w.-]+$/ }, './i18n.cjs': i18n,
});
const position = { x: 0, y: 0 };
const agent = (id, agentId = 'codex') => ({ id, type: 'terminal', position, data: { agentId } });
const runner = (id, data = {}) => ({ id, type: 'visualTest', position, data });
const link = (source, target, enabled = true) => ({ id: `${source}-${target}`, source, target, data: { mode: 'visual', enabled } });
const board = (nodes, edges) => workspaceStore.sanitizeContent({ nodes, edges });
const call = (boards, caller, name, args, isRunning = () => false) => visualLink.callTool({ boards }, caller, name, args, isRunning);

test('a visual link exposes only the current board’s enabled outgoing runners', () => {
  const boards = [
    board([agent('qa'), agent('dev'), agent('shell', 'shell'), runner('test'), runner('disabled'), runner('foreign')], [
      link('qa', 'test'), link('qa', 'disabled', false), link('dev', 'foreign'), link('shell', 'test'),
    ]),
    board([agent('other'), runner('other-test')], [link('other', 'other-test')]),
  ];
  assert.equal(boards[0].edges[0].data.mode, 'visual');
  const listed = JSON.parse(call(boards, 'qa', 'list_visual_tests', {}, (id) => id === 'test').text);
  assert.deepEqual(listed, {
    runners: [{ runner_id: 'test', configured_url: null, running: true, last_finished_at: null }],
    total: 1,
  });
  for (const id of ['disabled', 'foreign', 'other-test', 'qa']) {
    assert.equal(call(boards, 'qa', 'read_visual_test', { runner_id: id }).isError, true);
  }
  assert.equal(call(boards, 'shell', 'read_visual_test', {}).isError, true);
  assert.equal(JSON.parse(call(boards, 'qa', 'read_visual_test', {}).text).last_run, null);
});

test('the runner summary bounds diagnostics and keeps sensitive payloads on the board', () => {
  const boards = [board([agent('qa'), runner('test', {
    url: 'https://name:password@example.test/start?key=secret#fragment',
    lastResult: {
      finishedAt: 1, expectedStatus: 200, status: 200, duration: 10, url: 'https://example.test/start?key=secret',
      failure: 'step', failedStep: 2, detail: 'hidden detail', errors: ['hidden console text'],
      network: [
        { url: 'https://example.test/ok?key=secret', method: 'GET', status: 200 },
        ...Array.from({ length: 15 }, (_, index) => ({ url: `https://example.test/broken/${index}?key=secret`, method: 'GET', status: 500 })),
      ],
      screenshot: 'data:image/jpeg;base64,AAAA',
    },
  })], [link('qa', 'test')])];
  const response = call(boards, 'qa', 'read_visual_test', {});
  const result = JSON.parse(response.text);
  assert.equal(result.configured_url, 'https://example.test/start');
  assert.equal(result.last_run.passed, false);
  assert.equal(result.last_run.failed_step, 2);
  assert.equal(result.last_run.console_error_count, 1);
  assert.equal(result.last_run.network_failure_count, 15);
  assert.equal(result.last_run.network_failures.length, 12);
  assert.equal(result.last_run.network_failures[0].url, 'https://example.test/broken/0');
  assert.equal(result.last_run.screenshot_on_board, true);
  assert.doesNotMatch(response.text, /secret|password|fragment|hidden|base64/);
});

test('a runner must be selected when several are linked', () => {
  const boards = [board([agent('qa'), runner('a'), runner('b')], [link('qa', 'a'), link('qa', 'b')])];
  assert.equal(call(boards, 'qa', 'read_visual_test', {}).isError, true);
  assert.equal(JSON.parse(call(boards, 'qa', 'read_visual_test', { runner_id: 'b' }).text).runner_id, 'b');
});
