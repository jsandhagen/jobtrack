const test = require('node:test');
const assert = require('node:assert');
const { createBridge, isExtensionOrigin } = require('../src/main/bridge');

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

async function start(overrides = {}) {
  const pairings = [];
  const postings = [];
  const b = createBridge({
    getPairings: () => pairings,
    savePairing: (p) => pairings.push(p),
    askToPair: async () => true,
    onPosting: async (p) => (postings.push(p), { id: 'app1', score: 77, label: 'Strong match' }),
    onOpen: () => {},
    ...overrides,
  });
  const port = await b.listen(0);
  const url = (p) => `http://127.0.0.1:${port}${p}`;
  return { b, url, pairings, postings };
}

const posting = { title: 'Engineer', company: 'Acme', text: 'Responsibilities: build things. Requirements: 3+ years of experience with React. '.repeat(3), url: 'https://acme.example/jobs/1' };

test('only extension origins are accepted', () => {
  assert.ok(isExtensionOrigin(EXT));
  assert.ok(isExtensionOrigin('moz-extension://1234-abcd'));
  assert.ok(!isExtensionOrigin('https://evil.example'));
  assert.ok(!isExtensionOrigin(undefined));
});

test('websites are rejected outright, even with a guessed token', async () => {
  const { b, url, postings } = await start();
  const r = await fetch(url('/posting'), { method: 'POST', headers: { Origin: 'https://evil.example', 'X-Sprout-Token': 'x' }, body: JSON.stringify(posting) });
  assert.equal(r.status, 403);
  const noOrigin = await fetch(url('/ping'), { method: 'POST' });
  assert.equal(noOrigin.status, 403);
  assert.equal(postings.length, 0);
  await b.close();
});

test('pairing: request -> user allows -> token handed out once -> postings accepted', async () => {
  const { b, url, postings, pairings } = await start();
  let r = await fetch(url('/posting'), { method: 'POST', headers: { Origin: EXT }, body: JSON.stringify(posting) });
  assert.equal(r.status, 401, 'unpaired extension is refused');

  r = await fetch(url('/pair'), { method: 'POST', headers: { Origin: EXT }, body: JSON.stringify({ name: 'Chrome' }) });
  assert.equal(r.status, 202);
  const { requestId } = await r.json();
  await new Promise((res) => setImmediate(res));
  // Another extension can't collect this token.
  const status = (origin) => fetch(url('/pair/status'), { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ requestId }) });
  const other = await status('chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz');
  assert.equal(other.status, 404);
  const ok = await (await status(EXT)).json();
  assert.equal(ok.status, 'approved');
  assert.equal(pairings.length, 1);
  const again = await status(EXT);
  assert.equal(again.status, 404, 'token is only handed out once');

  const ping = await (await fetch(url('/ping'), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': ok.token } })).json();
  const get = await fetch(url('/ping'), { headers: { Origin: EXT } });
  assert.equal(get.status, 405, 'GET is not accepted');
  assert.deepEqual([ping.app, ping.paired], ['sprout', true]);
  r = await fetch(url('/posting'), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': ok.token }, body: JSON.stringify({ ...posting, url: 'javascript:alert(1)' }) });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { id: 'app1', score: 77, label: 'Strong match' });
  assert.equal(postings[0].title, 'Engineer');
  assert.equal(postings[0].url, '', 'non-web URLs are dropped');

  const wrong = await fetch(url('/posting'), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': ok.token + 'x' }, body: JSON.stringify(posting) });
  assert.equal(wrong.status, 401);
  await b.close();
});

test('denied pairing gives no token', async () => {
  const { b, url, pairings } = await start({ askToPair: async () => false });
  const { requestId } = await (await fetch(url('/pair'), { method: 'POST', headers: { Origin: EXT }, body: '{}' })).json();
  await new Promise((res) => setImmediate(res));
  const s = await (await fetch(url('/pair/status'), { method: 'POST', headers: { Origin: EXT }, body: JSON.stringify({ requestId }) })).json();
  assert.equal(s.status, 'denied');
  assert.equal(s.token, undefined);
  assert.equal(pairings.length, 0);
  await b.close();
});

test('too-short or oversized postings are refused', async () => {
  const pair = { origin: EXT, token: 't0k3n' };
  const { b, url } = await start({ getPairings: () => [pair] });
  const h = { Origin: EXT, 'X-Sprout-Token': 't0k3n' };
  let r = await fetch(url('/posting'), { method: 'POST', headers: h, body: JSON.stringify({ text: 'hi' }) });
  assert.equal(r.status, 422);
  r = await fetch(url('/posting'), { method: 'POST', headers: h, body: 'x'.repeat(3 * 1024 * 1024) }).catch(() => ({ status: 413 }));
  assert.equal(r.status, 413);
  await b.close();
});

test('falls through to the next port when one is taken', async () => {
  const a = createBridge({ getPairings: () => [], savePairing() {}, askToPair: async () => false, onPosting: async () => ({}), onOpen() {} });
  const first = await a.listen(0);
  const b = createBridge({ getPairings: () => [], savePairing() {}, askToPair: async () => false, onPosting: async () => ({}), onOpen() {} });
  const second = await b.listen(first);
  assert.equal(second, first + 1);
  await a.close();
  await b.close();
});

test('the extension card: preview without saving, then act on a saved job', async () => {
  const pair = { origin: EXT, token: 't0k3n' };
  const previews = [];
  const acted = [];
  const { b, url, postings } = await start({
    getPairings: () => [pair],
    onPreview: async (p) => (previews.push(p), { saved: false, preview: { job: { title: p.title } } }),
    onGet: async (id) => ({ saved: true, app: { id } }),
    onAction: async (a) => (acted.push(a), { saved: true, app: { id: a.id } }),
  });
  const post = (p, body, token = 't0k3n') => fetch(url(p), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': token }, body: JSON.stringify(body) });

  let r = await post('/preview', { ...posting, silent: true });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { saved: false, preview: { job: { title: 'Engineer' } } });
  assert.equal(previews.length, 1);
  assert.equal(postings.length, 0, 'a preview saves nothing');
  assert.equal((await post('/preview', { text: 'short' })).status, 422);

  r = await post('/posting', { ...posting, silent: true });
  assert.equal(r.status, 200);
  assert.equal(postings[0].silent, true);

  assert.deepEqual(await (await post('/app', { id: 'app1' })).json(), { saved: true, app: { id: 'app1' } });
  r = await post('/action', { id: 'app1', action: 'resume-ats' });
  assert.equal(r.status, 200);
  assert.deepEqual(acted, [{ id: 'app1', action: 'resume-ats' }]);
  assert.equal((await post('/action', { id: 'app1', action: 'delete-everything' })).status, 400, 'only known actions');
  assert.equal(acted.length, 1);

  for (const p of ['/preview', '/app', '/action']) assert.equal((await post(p, { ...posting, id: 'app1', action: 'skip' }, 'wrong')).status, 401, `${p} needs the token`);
  await b.close();
});

test('"Do you have it?" answers: by job id or by the posting, yes or no, paired only', async () => {
  const pair = { origin: EXT, token: 't0k3n' };
  const had = [];
  const { b, url } = await start({ getPairings: () => [pair], onHave: async (h) => (had.push(h), { saved: false, preview: {} }) });
  const post = (body, token = 't0k3n') => fetch(url('/have'), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': token }, body: JSON.stringify(body) });
  assert.equal((await post({ label: 'SQL', answer: 'yes', id: 'app1' })).status, 200);
  assert.equal((await post({ label: 'one of AWS, GCP', answer: 'yes', option: 'GCP', posting })).status, 200);
  assert.deepEqual(had[0], { label: 'SQL', answer: 'yes', option: '', id: 'app1', posting: null });
  assert.equal(had[1].option, 'GCP');
  assert.equal(had[1].posting.title, 'Engineer');
  assert.equal((await post({ label: 'SQL', answer: 'maybe', id: 'app1' })).status, 400);
  assert.equal((await post({ label: '', answer: 'yes', id: 'app1' })).status, 400);
  assert.equal((await post({ label: 'SQL', answer: 'yes', posting: { text: 'short' } })).status, 422, 'no job to re-score');
  assert.equal((await post({ label: 'SQL', answer: 'yes', id: 'app1' }, 'wrong')).status, 401);
  assert.equal(had.length, 2);
  await b.close();
});

test('an app without the card endpoints says so', async () => {
  const pair = { origin: EXT, token: 't0k3n' };
  const { b, url } = await start({ getPairings: () => [pair] });
  const h = { Origin: EXT, 'X-Sprout-Token': 't0k3n' };
  assert.equal((await fetch(url('/preview'), { method: 'POST', headers: h, body: JSON.stringify(posting) })).status, 404);
  assert.equal((await fetch(url('/action'), { method: 'POST', headers: h, body: JSON.stringify({ id: 'x', action: 'skip' }) })).status, 404);
  await b.close();
});

test('ping tells the extension which version comes with the app', async () => {
  const { b, url } = await start({ extensionVersion: '0.3.41' });
  const ping = await (await fetch(url('/ping'), { method: 'POST', headers: { Origin: EXT } })).json();
  assert.equal(ping.extensionVersion, '0.3.41');
  await b.close();
});

test('people from LinkedIn: look up, add and open, only for real profile links', async () => {
  const pair = { origin: EXT, token: 't0k3n' };
  const seen = [];
  const added = [];
  const opened = [];
  const { b, url } = await start({
    getPairings: () => [pair],
    onPerson: async (p) => (seen.push(p), { person: true, saved: false }),
    onAddPerson: async (p) => (added.push(p), { person: true, saved: true, justAdded: true }),
    onOpenPerson: (id) => opened.push(id),
  });
  const post = (p, body, token = 't0k3n') => fetch(url(p), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': token }, body: JSON.stringify(body) });
  const person = { url: 'https://www.linkedin.com/in/frederick-lee', name: '  Frederick   Lee ', title: 'Chief of Staff', company: 'OCTA', schools: ['UVA', '', 42], employers: 'Appian', extra: 'dropped' };

  let r = await post('/person', person);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { person: true, saved: false });
  assert.equal(seen[0].name, 'Frederick Lee');
  assert.deepEqual(seen[0].schools, ['UVA', '42']);
  assert.deepEqual(seen[0].employers, [], 'lists must be lists');
  assert.equal(seen[0].extra, undefined);
  assert.equal(added.length, 0, 'looking someone up adds nothing');

  assert.equal((await post('/person/add', person)).status, 200);
  assert.equal(added.length, 1);
  assert.equal((await post('/person/open', { id: 'c1' })).status, 200);
  assert.deepEqual(opened, ['c1']);

  // Not a profile, or no name: refused.
  assert.equal((await post('/person', { ...person, url: 'https://evil.example/in/fred' })).status, 422);
  assert.equal((await post('/person', { ...person, url: 'https://www.linkedin.com/company/ramp' })).status, 422);
  assert.equal((await post('/person', { ...person, name: '' })).status, 422);
  assert.equal((await post('/person/add', person, 'wrong')).status, 401);
  assert.equal(added.length, 1);
  await b.close();

  // An older app without these endpoints says so.
  const old = await start({ getPairings: () => [pair] });
  assert.equal((await fetch(old.url('/person'), { method: 'POST', headers: { Origin: EXT, 'X-Sprout-Token': 't0k3n' }, body: JSON.stringify(person) })).status, 404);
  await old.b.close();
});
