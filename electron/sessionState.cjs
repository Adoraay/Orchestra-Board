const fs = require('fs');
const path = require('path');

const SESSION_ID = /^[0-9a-f-]{8,64}$/i;

function sanitizeSession(value) {
  if (!value || !SESSION_ID.test(value.id ?? '') || typeof value.agentId !== 'string' ||
      typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd) ||
      typeof value.transcriptPath !== 'string' || !path.isAbsolute(value.transcriptPath) ||
      !value.transcriptPath.endsWith('.jsonl')) return null;
  return { id: value.id, agentId: value.agentId.slice(0, 64), cwd: value.cwd, transcriptPath: value.transcriptPath };
}

function canResume(session, agentId, cwd) {
  if (!session || session.agentId !== agentId || typeof cwd !== 'string') return false;
  try {
    const normalize = (value) => {
      const real = fs.realpathSync(value);
      return process.platform === 'win32' ? real.toLowerCase() : real;
    };
    return normalize(cwd) === normalize(session.cwd) && fs.statSync(session.transcriptPath).isFile();
  } catch { return false; }
}

module.exports = { sanitizeSession, canResume };
