const crypto = require('crypto');
const http = require('http');

// Petit serveur local qui reçoit les hooks de Claude Code (PLAN.md §3.2, statuts) et les appels
// d'outils du serveur MCP d'Orchestra (§3.11).
// Uniquement sur 127.0.0.1, avec un secret par lancement pour les hooks et un jeton MCP propre à chaque case.
const MAX_BODY = 1024 * 1024;
const hookToken = crypto.randomBytes(16).toString('hex');
const toolSecret = crypto.randomBytes(32);
const toolToken = (id) => crypto.createHmac('sha256', toolSecret).update(id).digest('hex');
let port = null;

// onHook(id, payload) -> réponse au hook (ou rien = {}) ; onTool(id, name, args, signal) -> Promise<{ text, isError }>.
function start(onHook, onTool) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    // Jeton dans ?t=… ; pour les hooks de Codex, dans le chemin suivi de l'événement (pas de & ni de ? dans
    // leur commande, voir codexProfile.cjs) : /hook/<id>/<jeton>/<événement>.
    const match = url.pathname.match(/^\/(hook|tool)\/([\w-]{1,128})(?:\/(\w{1,64})\/\w{1,32})?$/);
    if (req.method !== 'POST' || !match) {
      res.writeHead(404).end();
      return;
    }
    const [, kind, id, pathToken] = match;
    const expectedToken = kind === 'hook' ? hookToken : toolToken(id);
    if ((pathToken ?? url.searchParams.get('t')) !== expectedToken) {
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
      if (kind === 'hook') {
        // Réponse immédiate (l'agent attend la fin du hook avant de continuer) : {} ne décide rien.
        const response = onHook(id, payload) ?? {};
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(response));
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

const hookUrl = (id) => `http://127.0.0.1:${port}/hook/${id}?t=${hookToken}`;
const toolUrl = (id) => `http://127.0.0.1:${port}/tool/${id}?t=${toolToken(id)}`;
// Base à compléter par /<événement> (hooks de Codex).
const hookBase = (id) => `http://127.0.0.1:${port}/hook/${id}/${hookToken}`;

module.exports = { start, hookUrl, toolUrl, hookBase };
