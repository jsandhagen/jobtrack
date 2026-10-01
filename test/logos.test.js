const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/main/logos');

const NOW = Date.parse('2026-09-30T12:00:00Z');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const ICO = Buffer.from('00000100010010100000', 'hex');

// A fake fetch serving canned pages and images by URL (and recording the calls).
function fakeFetch(routes, { offline = false } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (offline) throw new TypeError('fetch failed');
    for (const [pattern, body] of routes) {
      if (typeof pattern === 'string' ? url === pattern : pattern.test(url)) {
        const v = typeof body === 'function' ? body(url) : body;
        if (v === 404) return { ok: false, status: 404, url };
        const buf = Buffer.isBuffer(v) ? v : Buffer.from(String(v));
        return { ok: true, status: 200, url: (v && v.redirected) || url, headers: new Map(), text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
      }
    }
    return { ok: false, status: 404, url };
  };
  fn.calls = calls;
  return fn;
}

test("works out the company's own domain from a link on its site", () => {
  assert.equal(L.companyDomain('https://careers.stripe.com/jobs'), 'stripe.com');
  assert.equal(L.companyDomain('https://www.acme.co.uk/jobs'), 'acme.co.uk');
  assert.equal(L.companyDomain('https://jobs.acme.com'), 'acme.com');
  assert.equal(L.companyDomain('https://eng.acme.io/'), 'eng.acme.io');
  // Job boards and other hosts aren't the company.
  for (const u of ['https://jobs.lever.co/acme', 'https://job-boards.greenhouse.io/acme', 'https://acme.wd5.myworkdayjobs.com/x', 'https://www.linkedin.com/company/acme', 'https://acme.notion.site/Careers', 'not a link', 'http://127.0.0.1:3000']) assert.equal(L.companyDomain(u), null, u);
});

test('trusts the website, careers link and postings, in that order', () => {
  const c = L.candidates({
    name: 'Acme',
    website: 'acme.com',
    careersUrl: 'https://boards.greenhouse.io/embed/job_board?for=acme&b=https%3A%2F%2Fwww.acmecorp.com%2Fcareers',
    jobs: [{ url: 'https://acme-inc.com/careers?gh_jid=1' }, { url: 'https://acme-inc.com/careers?gh_jid=2' }, { url: 'https://job-boards.greenhouse.io/acme/jobs/3' }],
  });
  assert.deepEqual(
    c.map((x) => [x.domain, x.via, x.check]),
    [
      ['acme.com', 'website', false],
      ['acmecorp.com', 'careers-link', false],
      ['acme-inc.com', 'postings', false],
    ]
  );
  assert.deepEqual(L.candidates({ name: 'Acme', careersUrl: 'https://jobs.lever.co/acme', jobs: [{ url: 'https://jobs.lever.co/acme/1' }] }), []);
  assert.deepEqual(L.nameGuesses('Scale AI').map((g) => g.domain), ['scaleai.com', 'scaleai.ai', 'scaleai.io', 'scaleai.co']);
});

test('picks the biggest icon a page declares', () => {
  const html = `<head>
    <link rel="icon" href="/favicon-16.png" sizes="16x16">
    <link rel="mask-icon" href="/safari.svg">
    <link rel="apple-touch-icon" href="/apple.png">
    <link rel="icon" type="image/png" sizes="96x96" href="https://cdn.acme.com/fav-96.png">
    <link rel="shortcut icon" href="/favicon.ico">
  </head>`;
  assert.deepEqual(
    L.iconLinks(html, 'https://acme.com/').map((i) => i.url),
    ['https://acme.com/apple.png', 'https://cdn.acme.com/fav-96.png', 'https://acme.com/favicon.ico', 'https://acme.com/favicon-16.png']
  );
});

test("finds the website a Lever or Ashby board names", () => {
  assert.equal(L.websiteFromBoardPage('<div class="main-header-logo"><a href="https://www.acme.com/"><img src="x.png"></a></div>'), 'acme.com');
  assert.equal(L.websiteFromBoardPage('window.__appData = {"organization":{"name":"Acme","publicWebsite":"https:\\/\\/acme.ai"}}'), 'acme.ai');
  assert.equal(L.websiteFromBoardPage('<div class="main-header-logo"><a href="https://jobs.lever.co/acme">'), null);
});

test('only keeps a guessed site whose title names the company', () => {
  assert.ok(L.pageNames('<title>Acme | Payments for builders</title>', 'Acme'));
  assert.ok(L.pageNames('<meta property="og:site_name" content="Scale AI">', 'Scale AI'));
  assert.ok(!L.pageNames('<title>Totally different company</title>', 'Acme'));
  assert.ok(!L.pageNames('<title>acme.com is for sale!</title>', 'Acme'));
  assert.ok(!L.pageNames('', 'Acme'));
});

test('recognises images by their bytes, not what the server says', () => {
  assert.equal(L.sniff(PNG), 'image/png');
  assert.equal(L.sniff(ICO), 'image/x-icon');
  assert.equal(L.sniff(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml');
  assert.equal(L.sniff(Buffer.from('<!doctype html><html>Not found</html>')), null);
});

test("fetches the icon from the careers link's site", async () => {
  const fetchImpl = fakeFetch([
    ['https://acme.com/', '<html><head><title>Acme</title><link rel="apple-touch-icon" href="/touch.png"></head></html>'],
    ['https://acme.com/touch.png', PNG],
  ]);
  const logo = await L.findLogo({ name: 'Acme', careersUrl: 'https://careers.acme.com/open-roles' }, { fetchImpl, now: NOW });
  assert.equal(logo.domain, 'acme.com');
  assert.equal(logo.via, 'careers-link');
  assert.equal(logo.src, `data:image/png;base64,${PNG.toString('base64')}`);
  assert.equal(logo.at, new Date(NOW).toISOString());
});

test('falls back to /favicon.ico, and skips a "200 OK" error page', async () => {
  const fetchImpl = fakeFetch([
    ['https://acme.com/', '<html><head><link rel="icon" href="/missing.png"></head></html>'],
    ['https://acme.com/missing.png', '<html>Page not found</html>'],
    ['https://acme.com/favicon.ico', ICO],
  ]);
  const logo = await L.findLogo({ name: 'Acme', website: 'https://acme.com' }, { fetchImpl, now: NOW });
  assert.match(logo.src, /^data:image\/x-icon;base64,/);
});

test('uses the shrunk image when the app can shrink it', async () => {
  const fetchImpl = fakeFetch([['https://acme.com/favicon.ico', PNG]]);
  const logo = await L.findLogo({ name: 'Acme', website: 'acme.com' }, { fetchImpl, now: NOW, shrink: (buf, type) => (type === 'image/png' ? 'data:image/png;base64,small' : null) });
  assert.equal(logo.src, 'data:image/png;base64,small');
});

test("reads a Lever board's link to the company site when nothing else says where it is", async () => {
  const fetchImpl = fakeFetch([
    ['https://jobs.lever.co/acme', '<div class="main-header-logo"><a href="https://acme.io"><img src="https://lever-client-logos.example/acme.png"></a></div>'],
    ['https://acme.io/', '<title>Home</title><link rel="icon" href="/i.png">'],
    ['https://acme.io/i.png', PNG],
  ]);
  const logo = await L.findLogo({ name: 'Acme', board: { ats: 'lever', token: 'acme', url: 'https://jobs.lever.co/acme' } }, { fetchImpl, now: NOW });
  assert.equal(logo.domain, 'acme.io');
  assert.equal(logo.via, 'job-board');
});

test("guesses from the name only when the site's title confirms it", async () => {
  const good = fakeFetch([
    ['https://octa.com/', '<title>Welcome</title>'],
    ['https://octa.ai/', '<title>Octa — AI for logistics</title><link rel="icon" href="/o.png">'],
    ['https://octa.ai/o.png', PNG],
  ]);
  const logo = await L.findLogo({ name: 'Octa' }, { fetchImpl: good, now: NOW });
  assert.equal(logo.domain, 'octa.ai');
  assert.equal(logo.via, 'name');

  // A site that doesn't name the company gets no logo, not a wrong one.
  const wrong = fakeFetch([
    [/^https:\/\/octa\.[a-z]+\/$/, '<title>Buy this domain</title><link rel="icon" href="/p.png">'],
    [/\.png$/, PNG],
  ]);
  const none = await L.findLogo({ name: 'Octa' }, { fetchImpl: wrong, now: NOW });
  assert.equal(none.src, null);
  assert.ok(!wrong.calls.some((u) => u.endsWith('.png')));
});

test("offline isn't mistaken for no logo", async () => {
  await assert.rejects(L.findLogo({ name: 'Acme', website: 'acme.com' }, { fetchImpl: fakeFetch([], { offline: true }), now: NOW }), (err) => err.transient);
});

test('looks again when the links change or the logo is old', () => {
  const co = { name: 'Acme', website: 'https://acme.com' };
  assert.ok(L.logoDue(co, NOW));
  const found = { ...co, logo: { src: 'data:image/png;base64,x', at: new Date(NOW).toISOString(), key: L.logoKey(co) } };
  assert.ok(!L.logoDue(found, NOW + 86400000));
  assert.ok(L.logoDue(found, NOW + 31 * 86400000));
  assert.ok(L.logoDue({ ...found, website: 'https://acme.io' }, NOW + 86400000));
  const missing = { ...co, logo: { src: null, at: new Date(NOW).toISOString(), key: L.logoKey(co) } };
  assert.ok(!L.logoDue(missing, NOW + 3 * 86400000));
  assert.ok(L.logoDue(missing, NOW + 8 * 86400000));
});
