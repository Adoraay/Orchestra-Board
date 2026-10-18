const crypto = require('crypto');
const http = require('http');

// Petit serveur local qui reçoit les hooks de Claude Code (PLAN.md §3.2, statuts) et les appels
// d'outils du serveur MCP d'Orchestra (§3.11).
// Uniquement sur 127.0.0.1, port choisi par le système, jeton secret renouvelé à chaque lancement :
// un autre programme du PC ne peut pas envoyer de faux statuts ni de faux messages.
const MAX_BODY = 1024 * 1024;
const token = crypto.randomBytes(16).toString('hex');
let port = null;

// onHook(id, payload) ; onTool(id, name, args, signal) -> Promise<{ text, isError }>.
function start(onHook, onTool) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const match = url.pathname.match(/^\/(hook|tool)\/([\w-]{1,128})$/);
    if (req.method !== 'POST' || !match || url.searchParams.get('t') !== token) {
      res.writeHead(404).end();
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch {}
      const [, kind, id] = match;

      if (kind === 'hook') {
        onHook(id, payload);
        // Réponse vide et immédiate : Claude attend la fin du hook avant de continuer.
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        return;
      }

      // wait_for_replies peut attendre plusieurs minutes : si Claude abandonne l'appel, on arrête d'attendre.
      const aborted = new AbortController();
      res.on('close', () => aborted.abort());
      Promise.resolve(onTool(id, payload.name, payload.arguments ?? {}, aborted.signal))
        .catch(() => ({ text: "Erreur interne d'Orchestra", isError: true }))
        .then((result) => {
          if (!res.writableEnded) res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
        });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve(port);
    });
  });
}

const hookUrl = (id) => `http://127.0.0.1:${port}/hook/${id}?t=${token}`;
const toolUrl = (id) => `http://127.0.0.1:${port}/tool/${id}?t=${token}`;

module.exports = { start, hookUrl, toolUrl };
