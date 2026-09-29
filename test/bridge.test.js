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
