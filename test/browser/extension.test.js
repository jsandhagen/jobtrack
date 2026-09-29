// Loads the real browser extension into Chromium and checks it reads whole
// job postings (including text below the fold) and delivers them to the app.
// Run with: npm run test:browser   (needs Chromium; on Linux CI use xvfb-run)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { createBridge } = require('../../src/main/bridge');

const EXT_DIR = path.resolve(__dirname, '../../browser-extension');
const PAGES = path.resolve(__dirname, '../fixtures/pages');
const page = (name) => fs.readFileSync(path.join(PAGES, name), 'utf8');

let context;
let sw;
let bridge;
const postings = [];
const pairings = [];
let askedToPair = 0;

test.before(async () => {
  bridge = createBridge({
    getPairings: () => pairings,
    savePairing: (p) => pairings.push(p),
    askToPair: async () => (askedToPair++, true),
    onPosting: async (p) => (postings.push(p), { id: 'a' + postings.length, score: 81, label: 'Excellent match', status: 'scored', seen: false }),
    onOpen: () => {},
  });
  await bridge.listen(47321);
  context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-ext-')), {
    headless: !process.env.HEADED,
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  // Serve fixture pages at their real addresses, so content scripts match exactly as on the live sites.
  await context.route('https://www.linkedin.com/jobs/**', (r) => r.fulfill({ contentType: 'text/html', body: page('linkedin.html') }));
  await context.route('https://boards.greenhouse.io/**', (r) => r.fulfill({ contentType: 'text/html', body: page('greenhouse.html') }));
  await context.route('https://careers.fabrikam.example/**', (r) => r.fulfill({ contentType: 'text/html', body: page('generic.html') }));
  sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
});

test.after(async () => {
  if (context) await context.close();
  if (bridge) await bridge.close();
});

const waitFor = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timed out');
};

test('pairs with the app (the app is asked to allow it)', async () => {
  await sw.evaluate(() => pair());
  assert.equal(askedToPair, 1);
  assert.equal(pairings.length, 1);
  assert.match(pairings[0].origin, /^chrome-extension:\/\//);
  const { token } = await sw.evaluate(() => chrome.storage.local.get('token'));
  assert.equal(token, pairings[0].token);
});

test('LinkedIn: reads the visible job, including text far below the fold, and follows in-page navigation', async () => {
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/jobs/view/111');
  const first = await waitFor(() => postings.find((x) => x.title === 'Senior Frontend Engineer'));
  assert.equal(first.company, 'Acme Co.');
  assert.match(first.location, /Remote/);
  assert.match(first.text, /Experience with Storybook \(text far below the fold\)/);
  assert.ok(!first.text.includes('Globex'), 'the job list on the left is not included');
  assert.ok(!first.text.includes('Stale'), 'stale embedded data is ignored on LinkedIn');
  assert.equal(first.auto, true);

  await p.click('[data-job="pm"]'); // LinkedIn-style: no page reload
  const second = await waitFor(() => postings.find((x) => x.title === 'Product Manager'));
  assert.equal(second.company, 'Initech');
  assert.match(second.url, /\/jobs\/view\/222$/);
  const badge = await sw.evaluate(async () => chrome.action.getBadgeText({ tabId: (await chrome.tabs.query({ active: true }))[0].id }));
  assert.equal(badge, '81');
  await p.close();
});

test('Greenhouse: uses the structured job data (title, company, location, pay)', async () => {
  const p = await context.newPage();
  await p.goto('https://boards.greenhouse.io/providence/jobs/42');
  const g = await waitFor(() => postings.find((x) => x.company === 'Providence Health'));
  assert.equal(g.title, 'Registered Nurse - Telemetry');
  assert.match(g.location, /Portland, OR/);
  assert.match(g.salary, /48 - 66 per hour/);
  assert.match(g.text, /- BLS and ACLS certification required/);
  assert.equal(g.source, 'structured-data');
  await p.close();
});

test('any other site: finds the posting and leaves out menus and other openings', async () => {
  const p = await context.newPage();
  await p.goto('https://careers.fabrikam.example/jobs/senior-accountant');
  await p.addScriptTag({ path: path.join(EXT_DIR, 'extract.js') });
  const r = await p.evaluate(() => globalThis.sproutExtract());
  assert.equal(r.isPosting, true);
  assert.equal(r.title, 'Senior Accountant');
  assert.match(r.text, /CPA required/);
  assert.match(r.text, /Big 4 audit experience/);
  for (const junk of ['Warehouse Associate', 'About us', 'Privacy']) assert.ok(!r.text.includes(junk), `leaked: ${junk}`);
  // Not a known job site, so nothing is sent automatically.
  assert.ok(!postings.some((x) => x.title === 'Senior Accountant'));
  await p.close();
});

test('pages that are not job postings are ignored', async () => {
  await context.route('https://www.linkedin.com/jobs/search/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Jobs you may be interested in</h1><ul><li>Engineer</li></ul>' }));
  const before = postings.length;
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/jobs/search/?q=x');
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal(postings.length, before);
  await p.close();
});
