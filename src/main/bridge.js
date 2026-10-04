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

// What the extension's card may ask the app to do with a saved job.
const ACTIONS = ['analyze', 'resume', 'resume-ats', 'letter', 'open', 'open-letter', 'skip'];
// Who asks before a resume: Root (Claude) or Spike (ATS).
const ASKERS = ['root', 'spike'];

// Answers to Root's or Spike's questions, trimmed to what the app keeps.
function cleanReplies(list) {
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  return (Array.isArray(list) ? list : []).filter((r) => r && r.id).slice(0, 4).map((r) => ({
    id: str(r && r.id, 20),
    answer: r && ['yes', 'no'].includes(r.answer) ? r.answer : null,
    detail: str(r && r.detail, 1200).trim(),
    picked: (Array.isArray(r && r.picked) ? r.picked : []).slice(0, 8).map((x) => str(x, 120)),
  })).filter((r) => r.id);
}

function isExtensionOrigin(origin) {
  return /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin || '');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// A person read off a LinkedIn profile page, trimmed to what we keep.
function cleanPerson(b) {
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const list = (v) => (Array.isArray(v) ? v : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 15);
  const url = str(b.url, 500);
  const name = str(b.name, 120);
  if (!/^https:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[^/?#\s]+/i.test(url) || !name) return null;
  const degree = [1, 2, 3].includes(Number(b.degree)) ? Number(b.degree) : null;
  const mutual = Math.max(0, Math.min(9999, Math.floor(Number(b.mutual) || 0)));
  return { url, name, headline: str(b.headline, 300), title: str(b.title, 200), company: str(b.company, 200), location: str(b.location, 200), schools: list(b.schools), employers: list(b.employers), degree, mutual };
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
 * @param {(posting:object) => Promise<object>} opts.onPosting  save a posting
 * @param {(posting:object) => Promise<object>} [opts.onPreview]  score a posting without saving it
 * @param {(id:string) => Promise<object>} [opts.onGet]  a saved job, for the extension's card
 * @param {(req:{id:string, action:string}) => Promise<object>} [opts.onAction]  act on a saved job
 * @param {(id:string) => void} opts.onOpen
 * @param {(person:object) => Promise<object>} [opts.onPerson]  a LinkedIn profile: already in your people? what you share?
 * @param {(person:object) => Promise<object>} [opts.onAddPerson]  add them to your people
 * @param {(id:string) => void} [opts.onOpenPerson]  show a person in the app
 * @param {(origin:string) => void} [opts.onSeen]
 * @param {string} [opts.version]
 * @param {string} [opts.extensionVersion]  the extension that ships with this app
 */
// A posting as the extension sent it, trimmed to sane sizes; null when it's
// too short to be one.
function cleanPostingBody(b) {
  const text = String((b && b.text) || '').trim();
  if (text.length < 80) return null;
  return {
    text: text.slice(0, 60000),
    title: String(b.title || '').slice(0, 200),
    company: String(b.company || '').slice(0, 200),
    location: String(b.location || '').slice(0, 200),
    // The posting's own page when the extension found one (a job picked in
    // LinkedIn's search results), else the page it was read on.
    url: [b.link, b.url].map((u) => String(u || '')).find((u) => /^https?:\/\//i.test(u))?.slice(0, 2000) || '',
    salary: String(b.salary || '').slice(0, 200),
    source: String(b.source || 'page').slice(0, 40),
    auto: !!b.auto,
    // The browser shows its own card, so the app's popup stays out of the way.
    silent: !!b.silent,
  };
}

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
        return send(res, 200, { app: 'sprout', version: opts.version || '', extensionVersion: opts.extensionVersion || '', paired: authorized(req) });
      }
      if (!authorized(req)) return send(res, 401, { error: 'Not paired. Click "Connect" in the extension.' });
      if (opts.onSeen) opts.onSeen(origin);

      if (url.pathname === '/posting' || url.pathname === '/preview') {
        const b = await readJson(req);
        const posting = cleanPostingBody(b);
        if (!posting) return send(res, 422, { error: "That doesn't look like a full job posting." });
        if (url.pathname === '/posting') return send(res, 200, await opts.onPosting(posting));
        if (!opts.onPreview) return send(res, 404, { error: 'Not found' });
        return send(res, 200, await opts.onPreview(posting));
      }
      // "Do you have it?" answered on the card, for a saved job (id) or one on the page (posting).
      if (url.pathname === '/have') {
        if (!opts.onHave) return send(res, 404, { error: 'Not found' });
        const b = await readJson(req);
        const label = String(b.label || '').trim().slice(0, 200);
        if (!label || !['yes', 'no'].includes(b.answer)) return send(res, 400, { error: 'Answer yes or no.' });
        const id = String(b.id || '');
        const posting = id ? null : cleanPostingBody(b.posting || {});
        if (!id && !posting) return send(res, 422, { error: "I can't find that job anymore. Try reloading the page." });
        return send(res, 200, await opts.onHave({ label, answer: b.answer, option: b.option ? String(b.option).slice(0, 200) : '', id, posting }));
      }
      if (url.pathname === '/app') {
        if (!opts.onGet) return send(res, 404, { error: 'Not found' });
        const b = await readJson(req);
        return send(res, 200, await opts.onGet(String(b.id || '')));
      }
      if (url.pathname === '/action') {
        if (!opts.onAction) return send(res, 404, { error: 'Not found' });
        const b = await readJson(req);
        if (!ACTIONS.includes(b.action)) return send(res, 400, { error: 'Unknown action.' });
        return send(res, 200, await opts.onAction({ id: String(b.id || ''), action: b.action }));
      }
      // Before a resume from the card: Root's or Spike's questions, the answers, or a skip.
      if (url.pathname === '/questions' || url.pathname === '/answer' || url.pathname === '/skip-questions') {
        const handler = { '/questions': opts.onQuestions, '/answer': opts.onAnswer, '/skip-questions': opts.onSkipQuestions }[url.pathname];
        if (!handler) return send(res, 404, { error: 'Not found' });
        const b = await readJson(req);
        if (!ASKERS.includes(b.who)) return send(res, 400, { error: 'Unknown asker.' });
        return send(res, 200, await handler({ id: String(b.id || ''), who: b.who, replies: cleanReplies(b.replies) }));
      }
      if (url.pathname === '/person' || url.pathname === '/person/add') {
        const handler = url.pathname === '/person' ? opts.onPerson : opts.onAddPerson;
        if (!handler) return send(res, 404, { error: 'Not found' });
        const person = cleanPerson(await readJson(req));
        if (!person) return send(res, 422, { error: "That doesn't look like a LinkedIn profile." });
        return send(res, 200, await handler(person));
      }
      if (url.pathname === '/person/open') {
        if (!opts.onOpenPerson) return send(res, 404, { error: 'Not found' });
        const b = await readJson(req);
        opts.onOpenPerson(String(b.id || ''));
        return send(res, 200, { ok: true });
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

module.exports = { createBridge, isExtensionOrigin, cleanPerson, cleanReplies, DEFAULT_PORT, ACTIONS, ASKERS };
