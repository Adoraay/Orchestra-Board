const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { mcpServerPath } = require('./claudeHooks.cjs');
const { hookUrl, toolUrl } = require('./hookServer.cjs');

const DIRECTORY_VAR = 'ORCHESTRA_AGY_WORKSPACE';
const CONVERSATION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const runtimeDir = () => path.join(app.getPath('userData'), 'antigravity-sessions');
const workspaces = new Map();

// The CLI discovers hooks and MCPs in every workspace passed to --add-dir.
// A temporary workspace keeps these files scoped to this terminal.
function prepare(id, servers, shell) {
  fs.mkdirSync(runtimeDir(), { recursive: true, mode: 0o700 });
  const workspace = fs.mkdtempSync(path.join(runtimeDir(), 'session-'));
  try {
    const configDir = path.join(workspace, '.agents');
    fs.mkdirSync(configDir, { mode: 0o700 });
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const command = `${curl} -s -m 3 --data-binary @- "${hookUrl(id)}"`;
    const handler = { type: 'command', command, timeout: 5 };
    fs.writeFileSync(path.join(configDir, 'hooks.json'), JSON.stringify({
      orchestra: { SessionStart: [handler], PreInvocation: [handler], Stop: [handler] },
    }), { mode: 0o600 });
    const mcpServers = Object.fromEntries(Object.entries(servers).map(([name, { type, url, ...config }]) => [
      name, type === 'http' ? { serverUrl: url, ...config } : config,
    ]));
    mcpServers.orchestra = {
      command: process.execPath,
      args: [mcpServerPath()],
      env: { ELECTRON_RUN_AS_NODE: '1', ORCHESTRA_URL: toolUrl(id) },
      timeoutSeconds: 330,
    };
    fs.writeFileSync(path.join(configDir, 'mcp_config.json'), JSON.stringify({ mcpServers }), { mode: 0o600 });
  } catch (error) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
  workspaces.set(id, workspace);
  const powerShell = shell === 'powershell' || shell === 'pwsh' || (shell === 'default' && process.platform === 'win32');
  const directory = powerShell ? `$env:${DIRECTORY_VAR}` : shell === 'cmd' ? `%${DIRECTORY_VAR}%` : `$${DIRECTORY_VAR}`;
  return { args: ` --add-dir "${directory}"`, env: { [DIRECTORY_VAR]: workspace } };
}

function remove(id) {
  const workspace = workspaces.get(id);
  if (!workspace) return;
  workspaces.delete(id);
  try { fs.rmSync(workspace, { recursive: true, force: true }); }
  catch (error) { console.warn('Antigravity session cleanup failed:', error.code); }
}

function clearAll() {
  for (const id of workspaces.keys()) remove(id);
  try { fs.rmSync(runtimeDir(), { recursive: true, force: true }); }
  catch (error) { console.warn('Antigravity session cleanup failed:', error.code); }
}

function normalize(payload) {
  const event = payload?.hookEventName;
  if (!['SessionStart', 'PreInvocation', 'Stop'].includes(event)) return null;
  if (event === 'Stop' && payload.fullyIdle === false) return null;
  const sessionId = typeof payload.conversationId === 'string' && CONVERSATION_ID.test(payload.conversationId) ? payload.conversationId : null;
  return {
    provider: 'antigravity',
    hook_event_name: event === 'PreInvocation' ? 'UserPromptSubmit' : event,
    session_id: sessionId,
    transcript_path: sessionId ? transcriptFor(sessionId, payload.transcriptPath) : null,
  };
}

function transcriptFor(sessionId, reportedPath) {
  if (typeof reportedPath !== 'string' || !path.isAbsolute(reportedPath)) return null;
  const expected = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain', sessionId, '.system_generated', 'logs', 'transcript.jsonl');
  return path.relative(expected, reportedPath) === '' ? expected : null;
}

module.exports = { prepare, remove, clearAll, normalize };
