// Talks to the Sprout desktop app over a local, paired connection, and keeps
// track of the job each tab is showing so the card on the page and the
// toolbar popup agree.
//
// A job is only scored when it's found (/preview); it's added to your saved
// jobs when you say so on the card (/posting). The same goes for people: a
// LinkedIn profile is looked up (/person) and added to your people when you
// say so (/person/add).
const PORTS = [47321, 47322, 47323, 47324, 47325];
// Everything the card on the page needs, in load order (see manifest.json).
const CONTENT_FILES = ['vendor/buddyLines.js', 'vendor/icons.js', 'vendor/mascot.js', 'vendor/scoreInfo.js', 'vendor/jobTitle.js', 'extract.js', 'person.js', 'card.js', 'content.js'];

async function getConfig() {
  return chrome.storage.local.get({ port: null, token: '', autoSend: true });
}

async function findApp() {
  const { port, token } = await getConfig();
  for (const p of port ? [port, ...PORTS.filter((x) => x !== port)] : PORTS) {
    try {
      // POST, because Chrome only sends the Origin header the app checks on non-GET requests.
      const r = await fetch(`http://127.0.0.1:${p}/ping`, { method: 'POST', headers: { 'X-Sprout-Token': token } });
      if (!r.ok) continue;
      const body = await r.json();
      if (body.app === 'sprout') {
        if (p !== port) await chrome.storage.local.set({ port: p });
        await maybeUpdate(body.extensionVersion);
        return { port: p, paired: body.paired, extensionVersion: body.extensionVersion || '' };
      }
    } catch {
      /* not this port */
    }
  }
  return null;
}

// The app updates itself, and the extension's files with it (the extension
// is loaded from the app's folder). Chrome keeps running the old code until
// the extension reloads, so reload when the app ships a newer one. Once per
// version: if the files on disk didn't change (loaded from another folder),
// the popup says where to get the new one instead.
const newer = (a, b) => {
  const x = String(a || '').split('.').map(Number);
  const y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function maybeUpdate(bundled) {
  if (!newer(bundled, chrome.runtime.getManifest().version)) return;
  const { reloadedFor } = await chrome.storage.local.get({ reloadedFor: '' });
  if (reloadedFor === bundled) return;
  await chrome.storage.local.set({ reloadedFor: bundled });
  chrome.runtime.reload();
}

async function call(path, body) {
  const app = await findApp();
  if (!app) throw Object.assign(new Error("The Sprout app isn't running. Start it and try again."), { code: 'offline' });
  const { token } = await getConfig();
  const r = await fetch(`http://127.0.0.1:${app.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sprout-Token': token },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error('Not connected to Sprout yet. Click the Sprout button in your toolbar to connect.'), { code: 'unpaired' });
  if (r.status === 404 && /^\/(preview|app|action|person(\/add|\/open)?)$/.test(path) && !data.error) throw new Error('Update the Sprout app to use this.');
  if (!r.ok) throw new Error(data.error || `Sprout said ${r.status}`);
  return data;
}

// ---------- what each tab is showing ----------
// tabId -> { key, posting, result, dismissed }. Mirrored to session storage,
// because the service worker can be stopped at any time.
const tabs = new Map();

async function getEntry(tabId) {
  if (tabId === undefined || tabId === null) return null;
  if (tabs.has(tabId)) return tabs.get(tabId);
  const stored = (await chrome.storage.session.get('tab:' + tabId).catch(() => ({})))['tab:' + tabId] || null;
  if (stored) tabs.set(tabId, stored);
  return stored;
}

async function setEntry(tabId, entry) {
  if (tabId === undefined || tabId === null) return;
  if (entry) {
    tabs.set(tabId, entry);
    await chrome.storage.session.set({ ['tab:' + tabId]: entry }).catch(() => {});
  } else {
    tabs.delete(tabId);
    await chrome.storage.session.remove('tab:' + tabId).catch(() => {});
  }
  badge(tabId, entry && entry.result);
}

// Same job = same title, company and opening text (the URL can change under it).
const jobKey = (p) => `${p.title}|${p.company}|${String(p.text || '').slice(0, 600)}`;

// Only what the card needs from the app's answer.
const cardResult = (d) =>
  d.saved ? { saved: true, seen: !!d.seen, app: d.app, hasDocs: d.hasDocs, hasKey: d.hasKey } : { saved: false, preview: d.preview, hasDocs: d.hasDocs, hasKey: d.hasKey };

function badge(tabId, result) {
  if (tabId === undefined || tabId === null) return;
  if (result && result.person) return chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  const q = result && (result.saved ? result.app.analysis || result.app.quick : result.preview && result.preview.quick);
  if (!q) return chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  const quick = result.saved ? result.app.quick : result.preview.quick;
  const dealbreaker = !!(quick.dealbreakers && quick.dealbreakers.length) && !(result.saved && result.app.analysis);
  const s = q.score;
  chrome.action.setBadgeText({ tabId, text: dealbreaker ? '!' : String(s) }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: dealbreaker ? '#e98a8a' : s >= 65 ? '#3f8a61' : s >= 45 ? '#d9a93a' : '#e0906a' }).catch(() => {});
}

// Tell the card on the page (if any) about something that happened in the popup.
// Only the page itself (frame 0) talks back; frames inside it just report postings.
const TOP = { frameId: 0 };

function tellTab(tabId, msg) {
  if (tabId !== undefined && tabId !== null) chrome.tabs.sendMessage(tabId, msg, TOP).catch(() => {});
}

// Postings read inside frames on a page (iCIMS and other boards embedded in
// a company's careers page), by tab and frame. Kept in session storage, since
// this worker sleeps between events.
async function getFrames(tabId) {
  return (await chrome.storage.session.get('frames:' + tabId).catch(() => ({})))['frames:' + tabId] || {};
}
async function setFramePosting(tabId, frameId, posting) {
  const frames = await getFrames(tabId);
  if (posting) frames[frameId] = posting;
  else delete frames[frameId];
  if (Object.keys(frames).length) await chrome.storage.session.set({ ['frames:' + tabId]: frames }).catch(() => {});
  else await chrome.storage.session.remove('frames:' + tabId).catch(() => {});
}

// A job is on the page: score it (without saving) unless it's the one we already have.
async function detected(tabId, posting, { force = false } = {}) {
  const { autoSend, token } = await getConfig();
  if (!force && (!autoSend || !token)) return { skipped: true };
  const key = jobKey(posting);
  const e = await getEntry(tabId);
  if (e && e.key === key && e.result) {
    let result = e.result;
    // A saved job may have moved on (applied, resume written) since we last looked.
    if (result.saved) result = await call('/app', { id: result.app.id }).then((d) => ({ ...cardResult(d), seen: result.seen }), () => result);
    await setEntry(tabId, { ...e, posting, result });
    return { result, dismissed: e.dismissed && !force };
  }
  const result = cardResult(await call('/preview', posting));
  await setEntry(tabId, { key, posting, result, dismissed: false });
  return { result, dismissed: false };
}

async function save(tabId) {
  const e = await getEntry(tabId);
  if (!e) throw new Error("I can't find that job on the page anymore. Try reloading it.");
  const result = cardResult(await call('/posting', { ...e.posting, auto: false, silent: true }));
  await setEntry(tabId, { ...e, result, dismissed: false });
  return result;
}

// Keep every tab showing this saved job up to date.
async function updateSaved(result) {
  for (const [tabId, e] of tabs) if (e.result && e.result.saved && e.result.app && e.result.app.id === result.app.id) await setEntry(tabId, { ...e, result: { ...result, seen: e.result.seen } });
}

async function action(id, act) {
  const result = cardResult(await call('/action', { id, action: act }));
  await updateSaved(result);
  return result;
}

async function getSaved(id) {
  const result = cardResult(await call('/app', { id }));
  await updateSaved(result);
  return result;
}

// ---------- people (LinkedIn profiles) ----------

// A profile is on the page: are they in your people already, and what do you share?
async function personDetected(tabId, person, { force = false } = {}) {
  const { autoSend, token } = await getConfig();
  if (!force && (!autoSend || !token)) return { skipped: true };
  const key = `person|${person.url}`;
  const e = await getEntry(tabId);
  const result = await call('/person', person);
  const same = e && e.key === key;
  await setEntry(tabId, { key, posting: { url: person.url }, person, result, dismissed: same && e.dismissed });
  return { result, dismissed: same && e.dismissed && !force };
}

async function addPerson(tabId) {
  const e = await getEntry(tabId);
  if (!e || !e.person) throw new Error("I can't find that profile on the page anymore. Try reloading it.");
  const result = await call('/person/add', e.person);
  await setEntry(tabId, { ...e, result, dismissed: false });
  return result;
}

// ---------- reading the page ----------

// Makes sure the card's scripts are on the page. They usually are (see the
// manifest); tabs opened before the extension was installed need them added.
async function ensureContent(tabId) {
  try {
    if (await chrome.tabs.sendMessage(tabId, { type: 'ping' }, TOP)) return true;
  } catch {
    /* not there yet */
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  return true;
}

async function extractFromTab(tabId) {
  try {
    const p = await chrome.tabs.sendMessage(tabId, { type: 'extract' }, TOP);
    if (p) return p;
  } catch {
    /* no content script on this page */
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/jobTitle.js', 'extract.js'] });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.sproutExtract() });
  return result;
}

async function personFromTab(tabId) {
  try {
    const p = await chrome.tabs.sendMessage(tabId, { type: 'extractPerson' }, TOP);
    if (p) return p;
  } catch {
    /* no content script on this page */
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['person.js'] });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.sproutPerson() });
  return result;
}

// The toolbar popup: read the page now, so it never shows a job you've moved on from.
async function check(tabId) {
  // A LinkedIn profile: offer to add the person.
  const person = await personFromTab(tabId).catch(() => null);
  if (person && person.isProfile) return { found: true, ...(await personDetected(tabId, person, { force: true })) };
  let p;
  try {
    p = await extractFromTab(tabId);
  } catch {
    return { found: false, reason: 'blocked' };
  }
  if (!p || !p.isPosting) return { found: false };
  return { found: true, ...(await detected(tabId, p, { force: true })) };
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

// The card on the page draws with the same theme as the app; it lives in a
// shadow root, so the theme's :root variables go on the shadow host instead.
let cssText = null;
async function css() {
  if (!cssText) {
    const read = async (f) => (await fetch(chrome.runtime.getURL(f))).text();
    cssText = (await read('vendor/theme.css')).replace(/:root\b/g, ':host') + '\n' + (await read('card.css'));
  }
  return cssText;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // The toolbar popup names the tab; from the page, it's the sender's.
  const fromPage = msg.tabId === undefined && !!sender.tab;
  const tabId = fromPage ? sender.tab.id : msg.tabId;
  (async () => {
    switch (msg.type) {
      case 'detected':
        return detected(tabId, msg.posting, { force: !!msg.force });
      case 'personDetected':
        return personDetected(tabId, msg.person, { force: !!msg.force });
      case 'addPerson': {
        const result = await addPerson(tabId);
        if (!fromPage) tellTab(tabId, { type: 'update', result });
        return result;
      }
      case 'openPerson':
        return call('/person/open', { id: msg.id });
      case 'cleared':
        return setEntry(tabId, null);
      case 'framePosting': {
        // A frame inside the page found (or lost) a posting: tell the page.
        if (!fromPage || !sender.frameId) return null;
        await setFramePosting(tabId, sender.frameId, msg.posting || null);
        if (msg.posting) tellTab(tabId, { type: 'framePosting' });
        return null;
      }
      case 'framePostings':
        return Object.values(await getFrames(tabId));
      case 'css':
        return css();
      case 'save': {
        const result = await save(tabId);
        if (!fromPage) tellTab(tabId, { type: 'update', result });
        return result;
      }
      case 'dismiss': {
        const e = await getEntry(tabId);
        if (e) await setEntry(tabId, { ...e, dismissed: true });
        if (!fromPage) tellTab(tabId, { type: 'hide' });
        return null;
      }
      case 'action': {
        const result = await action(msg.id, msg.action);
        if (!fromPage && tabId !== undefined) tellTab(tabId, { type: 'update', result });
        return result;
      }
      case 'get':
        return getSaved(msg.id);
      case 'status': {
        const app = await findApp();
        const cfg = await getConfig();
        // Still older than the app's copy after reloading: this browser loaded the extension from somewhere else.
        const stale = !!app && newer(app.extensionVersion, chrome.runtime.getManifest().version);
        return { running: !!app, paired: !!(app && app.paired), autoSend: cfg.autoSend, stale };
      }
      case 'check':
        return check(tabId);
      case 'connect':
        return pair();
      case 'setAuto':
        return chrome.storage.local.set({ autoSend: !!msg.value });
      default:
        return null;
    }
  })().then(
    (value) => reply({ ok: true, value }),
    (err) => reply({ ok: false, error: err.message, code: err.code })
  );
  return true; // async reply
});

// Alt+Shift+J: show the card for this page, on any site.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'send-to-sprout') return;
  const t = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!t) return;
  try {
    await ensureContent(t.id);
    await chrome.tabs.sendMessage(t.id, { type: 'showCard' }, TOP);
  } catch {
    /* a page extensions can't touch (chrome://, the web store) */
  }
});

// Moved to another page: forget the job (and its badge) until the new page
// shows one. content.js re-reports the job if it's still the same one.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url) return;
  await chrome.storage.session.remove('frames:' + tabId).catch(() => {});
  const e = await getEntry(tabId);
  if (e && e.posting.url !== change.url) await setEntry(tabId, null);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  setEntry(tabId, null);
  chrome.storage.session.remove('frames:' + tabId).catch(() => {});
});
