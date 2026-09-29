// Talks to the Sprout desktop app over a local, paired connection.
const PORTS = [47321, 47322, 47323, 47324, 47325];
const results = new Map(); // tabId -> last result

async function getConfig() {
  const c = await chrome.storage.local.get({ port: null, token: '', autoSend: true });
  return c;
}

async function findApp() {
  const { port } = await getConfig();
  for (const p of port ? [port, ...PORTS.filter((x) => x !== port)] : PORTS) {
    try {
      const { token } = await getConfig();
      // POST, because Chrome only sends the Origin header the app checks on non-GET requests.
      const r = await fetch(`http://127.0.0.1:${p}/ping`, { method: 'POST', headers: { 'X-Sprout-Token': token } });
      if (!r.ok) continue;
      const body = await r.json();
      if (body.app === 'sprout') {
        await chrome.storage.local.set({ port: p });
        return { port: p, paired: body.paired };
      }
    } catch {
      /* not this port */
    }
  }
  return null;
}

async function call(path, body) {
  const app = await findApp();
  if (!app) throw Object.assign(new Error("The Sprout app isn't running."), { code: 'offline' });
  const { token } = await getConfig();
  const r = await fetch(`http://127.0.0.1:${app.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sprout-Token': token },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error('Not connected to Sprout yet.'), { code: 'unpaired' });
  if (!r.ok) throw new Error(data.error || `Sprout said ${r.status}`);
  return data;
}

function badge(tabId, result) {
  if (tabId === undefined || tabId === null) return;
  if (!result) return chrome.action.setBadgeText({ tabId, text: '' });
  const s = result.score;
  chrome.action.setBadgeText({ tabId, text: result.dealbreaker ? '!' : String(s) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: result.dealbreaker ? '#e98a8a' : s >= 65 ? '#3f8a61' : s >= 45 ? '#d9a93a' : '#e0906a' });
}

async function sendPosting(posting, tabId, auto) {
  const result = await call('/posting', { ...posting, auto });
  results.set(tabId, { ...result, title: posting.title, company: posting.company });
  await chrome.storage.session.set({ ['tab:' + tabId]: results.get(tabId) }).catch(() => {});
  badge(tabId, result);
  return result;
}

async function extractFromTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['extract.js'] });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.sproutExtract() });
  return result;
}

async function sendActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab.');
  const p = await extractFromTab(tab.id);
  if (!p || !p.isPosting) throw new Error("I couldn't find a job posting on this page.");
  return sendPosting(p, tab.id, false);
}

// "Connect": the app shows an Allow/Deny popup; we wait for the answer.
async function pair() {
  const app = await findApp();
  if (!app) throw new Error("The Sprout app isn't running. Start it and try again.");
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Microsoft Edge' : /Brave/.test(ua) ? 'Brave' : /OPR\//.test(ua) ? 'Opera' : 'Chrome';
  const r = await fetch(`http://127.0.0.1:${app.port}/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const { requestId } = await r.json();
  for (let i = 0; i < 120; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const s = await (await fetch(`http://127.0.0.1:${app.port}/pair/status`, { method: 'POST', body: JSON.stringify({ requestId }) })).json();
    if (s.status === 'approved') {
      await chrome.storage.local.set({ token: s.token, port: app.port });
      return { paired: true };
    }
    if (s.status !== 'pending') throw new Error('Connection was declined in the Sprout app.');
  }
  throw new Error('Timed out waiting for you to allow the connection in the Sprout app.');
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'posting') {
      const { autoSend, token } = await getConfig();
      if (msg.auto && (!autoSend || !token)) return { skipped: true };
      return sendPosting(msg.posting, sender.tab && sender.tab.id, !!msg.auto);
    }
    if (msg.type === 'status') {
      const app = await findApp();
      const cfg = await getConfig();
      const stored = await chrome.storage.session.get('tab:' + msg.tabId).catch(() => ({}));
      return { running: !!app, paired: !!(app && app.paired), autoSend: cfg.autoSend, last: results.get(msg.tabId) || stored['tab:' + msg.tabId] || null };
    }
    if (msg.type === 'connect') return pair();
    if (msg.type === 'sendActive') return sendActiveTab();
    if (msg.type === 'open') return call('/open', { id: msg.id });
    if (msg.type === 'setAuto') return chrome.storage.local.set({ autoSend: !!msg.value });
    return null;
  })().then(
    (value) => reply({ ok: true, value }),
    (err) => reply({ ok: false, error: err.message, code: err.code })
  );
  return true; // async reply
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'send-to-sprout') sendActiveTab().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => results.delete(tabId));
