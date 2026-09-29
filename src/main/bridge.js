// Local connection for the Sprout browser extension. The extension reads the
// job posting straight from the page (no screenshots, no scrolling) and
// POSTs it here.
//
// Security:
//  - Listens on 127.0.0.1 only, so nothing on the network can reach it.
//  - Only browser extensions can talk to it: web pages can't forge the
//    Origin header, and we require chrome-extension:// or moz-extension://.
//    Every endpoint is POST because Chrome only sends Origin from extensions
//    on non-GET requests.
//  - Every request after pairing needs the secret token the user approved
//    (via an "Allow this browser?" popup in the app).
const http = require('http');
const crypto = require('crypto');

const DEFAULT_PORT = 47321;
const PORT_RANGE = 5; // the extension probes 47321-47325
const MAX_BODY = 2 * 1024 * 1024;

function isExtensionOrigin(origin) {
  return /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin || '');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Bad JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {object} opts
 * @param {() => {origin:string, token:string, name?:string}[]} opts.getPairings  approved extensions
 * @param {(p:{origin:string, token:string, name:string}) => void} opts.savePairing
 * @param {(req:{origin:string, name:string}) => Promise<boolean>} opts.askToPair  show "Allow?" UI
 * @param {(posting:object) => Promise<object>} opts.onPosting
 * @param {(id:string) => void} opts.onOpen
 * @param {(origin:string) => void} [opts.onSeen]
 * @param {string} [opts.version]
 */
function createBridge(opts) {
  const pending = new Map(); // requestId -> { status, token?, origin, expires }

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const authorized = (req) => {
    const origin = req.headers.origin;
    const token = req.headers['x-sprout-token'];
    return opts.getPairings().some((p) => p.origin === origin && safeEqual(p.token, token));
  };

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    try {
      if (!isExtensionOrigin(origin)) return send(res, 403, { error: 'Only the Sprout browser extension can connect.' });
      const url = new URL(req.url, 'http://127.0.0.1');

      // --- pairing (no token yet) ---
      if (req.method === 'POST' && url.pathname === '/pair') {
        const body = await readJson(req);
        const requestId = crypto.randomUUID();
        const entry = { status: 'pending', origin, expires: Date.now() + 2 * 60 * 1000 };
        pending.set(requestId, entry);
        opts
          .askToPair({ origin, name: String(body.name || 'Browser extension').slice(0, 80) })
          .then((ok) => {
            if (!ok) return (entry.status = 'denied');
            entry.token = crypto.randomBytes(24).toString('hex');
            entry.status = 'approved';
            opts.savePairing({ origin, token: entry.token, name: String(body.name || 'Browser').slice(0, 80), pairedAt: new Date().toISOString() });
          })
          .catch(() => (entry.status = 'denied'));
        return send(res, 202, { requestId });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      if (url.pathname === '/pair/status') {
        const { requestId } = await readJson(req);
        const entry = pending.get(requestId);
        if (!entry || entry.origin !== origin || entry.expires < Date.now()) return send(res, 404, { status: 'expired' });
        if (entry.status === 'approved') {
          pending.delete(requestId); // hand the token out once
          return send(res, 200, { status: 'approved', token: entry.token });
        }
        return send(res, 200, { status: entry.status });
      }

      // --- everything else needs a paired token ---
      if (url.pathname === '/ping') {
        // Lets the extension find the app's port before pairing.
        return send(res, 200, { app: 'sprout', version: opts.version || '', paired: authorized(req) });
      }
      if (!authorized(req)) return send(res, 401, { error: 'Not paired. Click "Connect" in the extension.' });
      if (opts.onSeen) opts.onSeen(origin);

      if (url.pathname === '/posting') {
        const b = await readJson(req);
        const text = String(b.text || '').trim();
        if (text.length < 80) return send(res, 422, { error: "That doesn't look like a full job posting." });
        const posting = {
          text: text.slice(0, 60000),
          title: String(b.title || '').slice(0, 200),
          company: String(b.company || '').slice(0, 200),
          location: String(b.location || '').slice(0, 200),
          url: /^https?:\/\//i.test(b.url || '') ? String(b.url).slice(0, 2000) : '',
          salary: String(b.salary || '').slice(0, 200),
          source: String(b.source || 'page').slice(0, 40),
          auto: !!b.auto,
        };
        return send(res, 200, await opts.onPosting(posting));
      }
      if (url.pathname === '/open') {
        const b = await readJson(req);
        opts.onOpen(String(b.id || ''));
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (err) {
      return send(res, err.status || 500, { error: err.message });
    }
  });

  // Try a handful of ports in case one is taken.
  function listen(port = DEFAULT_PORT, attempt = 0) {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off('listening', onListening);
        if (err.code === 'EADDRINUSE' && attempt < PORT_RANGE - 1) resolve(listen(port + 1, attempt + 1));
        else reject(err);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
  }

  return { server, listen, close: () => new Promise((r) => server.close(() => r())) };
}

module.exports = { createBridge, isExtensionOrigin, DEFAULT_PORT };
