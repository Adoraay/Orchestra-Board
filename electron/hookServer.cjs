const crypto = require('crypto');
const http = require('http');

// Petit serveur local qui reçoit les hooks de Claude Code (PLAN.md §3.2, statuts).
// Uniquement sur 127.0.0.1, port choisi par le système, jeton secret renouvelé à chaque lancement :
// un autre programme du PC ne peut pas envoyer de faux statuts.
const MAX_BODY = 1024 * 1024;
const token = crypto.randomBytes(16).toString('hex');
let port = null;

function start(onHook) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const match = url.pathname.match(/^\/hook\/([\w-]{1,128})$/);
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
      onHook(match[1], payload);
      // Réponse vide et immédiate : Claude attend la fin du hook avant de continuer.
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
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

module.exports = { start, hookUrl };
