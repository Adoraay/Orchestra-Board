const { t } = require('./i18n.cjs');

const MAX_RUNNERS = 20;
const MAX_NETWORK_FAILURES = 12;
const FAILURE_CODES = new Set(['launch', 'navigation', 'status', 'step', 'console', 'timeout', 'unavailable']);
const isTool = (name) => name === 'list_visual_tests' || name === 'read_visual_test';
const result = (value) => ({ text: JSON.stringify(value), isError: false });
const error = (key) => ({ text: t(key), isError: true });

function route(value) {
  const url = typeof value === 'string' ? URL.parse(value) : null;
  return url && ['http:', 'https:'].includes(url.protocol) ? `${url.origin}${url.pathname}`.slice(0, 600) : null;
}

function runnersFor(workspace, caller) {
  const boards = workspace.boards.filter((board) =>
    board.nodes.some((node) => node.id === caller && node.type === 'terminal' && node.data.agentId !== 'shell'));
  if (boards.length !== 1) return [];
  const { nodes, edges } = boards[0];
  const targets = new Set(edges.filter((edge) =>
    edge.source === caller && edge.data.mode === 'visual' && edge.data.enabled !== false).map((edge) => edge.target));
  return nodes.filter((node) => node.type === 'visualTest' && targets.has(node.id));
}

function runnerSummary(node, isRunning) {
  return {
    runner_id: node.id,
    configured_url: route(node.data.url),
    running: isRunning(node.id),
    last_finished_at: node.data.lastResult ? new Date(node.data.lastResult.finishedAt).toISOString() : null,
  };
}

function summarizeRun(run) {
  if (!run) return null;
  const network = run.network.filter((entry) => entry.failure || entry.status >= 400);
  return {
    passed: !run.failure,
    url: route(run.url),
    expected_status: run.expectedStatus,
    status: run.status,
    duration_ms: run.duration,
    failure: run.failure ? (FAILURE_CODES.has(run.failure) ? run.failure : 'unavailable') : null,
    failed_step: run.failedStep,
    console_error_count: run.errors.length,
    network_failure_count: network.length,
    network_failures: network.slice(0, MAX_NETWORK_FAILURES).map((entry) => ({
      url: route(entry.url),
      method: /^[A-Z]{1,12}$/.test(entry.method) ? entry.method : null,
      status: entry.status,
      failed_to_load: Boolean(entry.failure),
    })),
    screenshot_on_board: Boolean(run.screenshot),
  };
}

function callTool(workspace, caller, name, args, isRunning) {
  const runners = runnersFor(workspace, caller);
  if (name === 'list_visual_tests') {
    return result({ runners: runners.slice(0, MAX_RUNNERS).map((node) => runnerSummary(node, isRunning)), total: runners.length });
  }
  if (!runners.length) return error('visualLink.none');
  const id = args?.runner_id;
  if (id == null && runners.length > 1) return error('visualLink.choose');
  const node = id == null ? runners[0] : runners.find((runner) => runner.id === id);
  if (!node) return error('visualLink.unknown');
  return result({ ...runnerSummary(node, isRunning), last_run: summarizeRun(node.data.lastResult) });
}

module.exports = { isTool, callTool };
