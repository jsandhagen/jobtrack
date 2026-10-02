const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXT = path.resolve(__dirname, '../browser-extension');
const posting = { title: 'Product Manager', company: 'Acme', url: 'https://jobs.example.com/1', text: 'About the role. '.repeat(80) };
const preview = (score = 72) => ({ saved: false, preview: { job: posting, quick: { score, matchedSkills: [], dealbreakers: [] } }, hasDocs: true });

function worker(fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => url.endsWith('/ping') ? { app: 'sprout', paired: true } : preview() })) {
  const local = { token: 'test', port: 47321, autoSend: true };
  const session = {};
  const badges = [];
  let updated;
  const get = (obj, keys) => typeof keys === 'string' ? { [keys]: obj[keys] } : { ...keys, ...obj };
  const storage = (obj) => ({ get: async (keys) => get(obj, keys), set: async (v) => Object.assign(obj, v), remove: async (k) => { delete obj[k]; } });
  const chrome = {
    storage: { local: storage(local), session: storage(session) },
    runtime: { getManifest: () => ({ version: '0.1.0' }), onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async (b) => { badges.push(b); } },
    commands: { onCommand: { addListener() {} } },
    tabs: { onUpdated: { addListener(fn) { updated = fn; } }, onRemoved: { addListener() {} }, sendMessage: async () => null },
  };
  const ctx = vm.createContext({ chrome, fetch: fetchImpl, AbortSignal, setTimeout, clearTimeout, console });
  ctx.importScripts = (file) => vm.runInContext(fs.readFileSync(path.join(EXT, file), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx);
  return { run: (source) => vm.runInContext(source, ctx), ctx, badges, updated: (...args) => updated(...args) };
}

test('late changes to requirements and location invalidate a preview', async () => {
  let calls = 0;
  const w = worker(async (url) => ({ ok: true, status: 200, json: async () => {
    if (url.endsWith('/ping')) return { app: 'sprout', paired: true };
    calls++;
    return preview();
  } }));
  w.ctx.posting = posting;
  await w.run('detected(1, posting)');
  w.ctx.changed = { ...posting, location: 'On-site, Boston', text: posting.text + '\nRequired: active security clearance.' };
  await w.run('detected(1, changed)');
  assert.equal(calls, 2, 'the changed requirements must be rescored');
});

test('a pending preview cannot repopulate a tab after navigation', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let started;
  const entered = new Promise((r) => { started = r; });
  const w = worker(async (url) => {
    if (url.endsWith('/ping')) return { ok: true, json: async () => ({ app: 'sprout', paired: true }) };
    started();
    await gate;
    return { ok: true, json: async () => preview() };
  });
  w.ctx.posting = posting;
  const pending = w.run('detected(1, posting)');
  await entered;
  await w.updated(1, { url: 'https://jobs.example.com/2' });
  release();
  await pending;
  assert.equal(await w.run('getEntry(1)'), null);
});

test('toolbar badge uses the app display bands', async () => {
  const w = worker();
  w.ctx.result = preview(72);
  w.run('badge(1, result)');
  assert.equal(w.badges.at(-1).color, '#d9a93a', '72 is Good potential on the app display scale');
  w.ctx.result = preview(83);
  w.run('badge(1, result)');
  assert.equal(w.badges.at(-1).color, '#3f8a61');
});

test('a qualification answer cannot restore the old job after navigation', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let started;
  const entered = new Promise((r) => { started = r; });
  const w = worker(async (url) => {
    if (url.endsWith('/ping')) return { ok: true, json: async () => ({ app: 'sprout', paired: true }) };
    if (url.endsWith('/have')) { started(); await gate; }
    return { ok: true, json: async () => preview() };
  });
  w.ctx.posting = posting;
  await w.run('detected(1, posting)');
  const pending = w.run("have(1, { label: 'SQL', answer: 'yes' })");
  await entered;
  await w.updated(1, { url: 'https://jobs.example.com/2' });
  release();
  await pending;
  assert.equal(await w.run('getEntry(1)'), null);
});

test('opening the toolbar recomputes an unsaved job against the current app profile', async () => {
  let calls = 0;
  const w = worker(async (url) => ({ ok: true, json: async () => {
    if (url.endsWith('/ping')) return { app: 'sprout', paired: true };
    return preview(++calls === 1 ? 72 : 83);
  } }));
  w.ctx.posting = posting;
  await w.run('detected(1, posting)');
  const result = await w.run('detected(1, posting, { force: true })');
  assert.equal(result.result.preview.quick.score, 83);
  assert.equal(calls, 2);
});

test('a stalled local service has a bounded discovery timeout', async () => {
  const w = worker((_url, options) => new Promise((resolve, reject) => {
    if (!options.signal) return;
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  const started = performance.now();
  // Keep the event loop alive while AbortSignal.timeout's timer is unref'ed.
  const keepAlive = setTimeout(() => {}, 6000);
  let deadline;
  try {
    const result = await Promise.race([w.run('findApp()'), new Promise((resolve) => { deadline = setTimeout(() => resolve('unbounded'), 4000); })]);
    assert.equal(result, null);
    assert.ok(performance.now() - started < 3500);
  } finally { clearTimeout(keepAlive); clearTimeout(deadline); }
});
