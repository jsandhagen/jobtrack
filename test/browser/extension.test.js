// Loads the real browser extension into Chromium and checks it reads whole
// job postings (including text below the fold), pops up the Sprout card on
// the page, follows single-page navigation, and only saves a job when you
// say so on the card.
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
const previews = []; // scored, not saved
const postings = []; // saved
const actions = [];
const people = []; // looked up
const added = []; // added to your people
const pairings = [];
let askedToPair = 0;
let previewGate = null;

// A pretend app: every job scores 81; saved jobs live in `saved`.
const saved = new Map();
const quick = { score: 81, label: 'Excellent match', confidence: 'high', matchedSkills: ['React', 'TypeScript'], dealbreakers: [] };
const env = { hasDocs: true, hasKey: true };
const card = (app, seen = false) => ({ saved: true, seen, app, ...env });
function newApp(p) {
  const app = {
    id: 'a' + (saved.size + 1),
    status: 'scored',
    createdAt: new Date().toISOString(),
    job: { title: p.title, company: p.company, location: p.location, url: p.url },
    quick,
    analysis: null,
    ats: { before: { score: 72, grade: 'B', skillsMatch: 'Good' }, after: null },
    hasResume: false,
    hasLetter: false,
  };
  saved.set(app.id, app);
  return app;
}
const findSaved = (p) => [...saved.values()].find((a) => a.job.title === p.title && a.job.company === p.company);

test.before(async () => {
  bridge = createBridge({
    getPairings: () => pairings,
    savePairing: (p) => pairings.push(p),
    askToPair: async () => (askedToPair++, true),
    onPreview: async (p) => {
      previews.push(p);
      if (previewGate) await previewGate(p);
      const dup = findSaved(p);
      if (dup) return card(dup, true);
      return { saved: false, preview: { job: { title: p.title, company: p.company, location: p.location, url: p.url }, quick, ats: { before: { score: 72, grade: 'B', skillsMatch: 'Good' } } }, ...env };
    },
    onPosting: async (p) => {
      postings.push(p);
      const dup = findSaved(p);
      const app = dup || newApp(p);
      return { id: app.id, score: 81, label: quick.label, status: app.status, ...card(app, !!dup) };
    },
    onGet: async (id) => card(saved.get(id)),
    onAction: async ({ id, action }) => {
      actions.push({ id, action });
      const app = saved.get(id);
      if (action === 'resume-ats') Object.assign(app, { hasResume: true, resumeStatus: 'ready', resumeSource: 'ats', status: 'resume-ready', ats: { ...app.ats, after: { score: 88, grade: 'A' } } });
      return card(app);
    },
    onOpen: () => {},
    onPerson: async (p) => {
      people.push(p);
      const c = added.find((x) => x.url === p.url);
      return { person: true, saved: !!c, contact: { id: c ? 'c1' : null, name: p.name, title: p.title, company: p.company, status: c ? 'Not contacted' : '' }, shared: ['went to University of Virginia'], roles: ['Operations Lead'], hasProfile: true };
    },
    onAddPerson: async (p) => {
      added.push(p);
      return { person: true, saved: true, justAdded: true, contact: { id: 'c1', name: p.name, title: p.title, company: p.company, status: 'Not contacted' }, shared: [], roles: [] };
    },
    onOpenPerson: () => {},
  });
  // An installed Sprout can already own the usual ports. Point the test
  // extension at this fixture server so it never pairs with the user's app.
  const port = await bridge.listen(0);
  context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-ext-')), {
    headless: !process.env.HEADED,
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  // Serve fixture pages at their real addresses, so content scripts match exactly as on the live sites.
  await context.route('https://www.linkedin.com/jobs/**', (r) => r.fulfill({ contentType: 'text/html', body: page('linkedin.html') }));
  await context.route('https://www.linkedin.com/in/**', (r) => r.fulfill({ contentType: 'text/html', body: page('linkedin-profile.html') }));
  await context.route('https://boards.greenhouse.io/**', (r) => r.fulfill({ contentType: 'text/html', body: page('greenhouse.html') }));
  await context.route('https://careers.fabrikam.example/**', (r) => r.fulfill({ contentType: 'text/html', body: page('generic.html') }));
  await context.route('https://careers.contoso.example/**', (r) => r.fulfill({ contentType: 'text/html', body: page('phenom.html') }));
  await context.route('https://cdn.phenompeople.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await context.route('https://careers.northwind.example/**', (r) => r.fulfill({ contentType: 'text/html', body: page('framed-top.html') }));
  await context.route('https://northwind.ats-frame.example/**', (r) => r.fulfill({ contentType: 'text/html', body: page('framed-posting.html') }));
  sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  await sw.evaluate((port) => chrome.storage.local.set({ port }), port);
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

// The card lives in a closed shadow root (so the page can't read it). The
// DevTools protocol can still reach it.
async function inCard(p, fn, arg) {
  const cdp = await context.newCDPSession(p);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const find = (n) => (n.nodeName === 'SPROUT-CARD' ? n : (n.children || []).map(find).find(Boolean) || null);
    const host = find(root);
    if (!host || !host.shadowRoots) return null;
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: host.shadowRoots[0].backendNodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn.toString(), arguments: [{ value: arg }], returnByValue: true, awaitPromise: true });
    return result.value;
  } finally {
    await cdp.detach();
  }
}
// What the card says right now ('' when it's hidden).
const cardText = (p) =>
  inCard(p, function () {
    const dock = this.querySelector('.dock');
    return dock && !dock.hidden ? dock.innerText : '';
  }).then((t) => t || '');
const clickCard = (p, act) =>
  inCard(
    p,
    function (a) {
      const b = this.querySelector(`.dock:not([hidden]) [data-act="${a}"]`);
      if (!b) return false;
      b.click();
      return true;
    },
    act
  );

test('pairs with the app (the app is asked to allow it)', async () => {
  await sw.evaluate(() => pair());
  assert.equal(askedToPair, 1);
  assert.equal(pairings.length, 1);
  assert.match(pairings[0].origin, /^chrome-extension:\/\//);
  const { token } = await sw.evaluate(() => chrome.storage.local.get('token'));
  assert.equal(token, pairings[0].token);
});

test('LinkedIn: pops up the card, asks before saving, and follows in-page navigation', async () => {
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/jobs/view/111');
  const first = await waitFor(() => previews.find((x) => x.title === 'Senior Frontend Engineer'));
  assert.equal(first.company, 'Acme Co.');
  assert.match(first.location, /Remote/);
  assert.match(first.text, /Experience with Storybook \(text far below the fold\)/);
  assert.ok(!first.text.includes('Globex'), 'the job list on the left is not included');
  assert.ok(!first.text.includes('Stale'), 'stale embedded data is ignored on LinkedIn');

  const text = await waitFor(async () => ((await cardText(p)).includes('Senior Frontend Engineer') ? cardText(p) : null));
  assert.match(text, /Add this job to your saved jobs\?/);
  assert.match(text, /Excellent match/);
  assert.match(text, /ATS visibility of your current resume: 72%/);
  assert.equal(postings.length, 0, 'nothing is saved until you say so');

  await p.click('[data-job="pm"]'); // LinkedIn-style: no page reload
  const second = await waitFor(() => previews.find((x) => x.title === 'Product Manager'));
  assert.equal(second.company, 'Initech');
  assert.match(second.url, /\/jobs\/view\/222$/);
  await waitFor(async () => (await cardText(p)).includes('Product Manager'));
  assert.ok(!(await cardText(p)).includes('Senior Frontend Engineer'), 'the card switched to the new job');
  assert.ok(!previews.some((x) => x.title === 'Senior Frontend Engineer' && /222$/.test(x.url)), 'the old job is never reported under the new address');
  const badge = await sw.evaluate(async () => chrome.action.getBadgeText({ tabId: (await chrome.tabs.query({ active: true }))[0].id }));
  assert.equal(badge, '81');

  // "Save job" adds it to your saved jobs, then offers the rest of the popup.
  assert.ok(await clickCard(p, 'save'));
  const s = await waitFor(() => postings.find((x) => x.title === 'Product Manager'));
  assert.equal(s.silent, true, "the app's own popup stays out of the way");
  const after = await waitFor(async () => ((await cardText(p)).includes('Added to your saved jobs') ? cardText(p) : null));
  assert.match(after, /ATS resume/);
  assert.match(after, /Claude resume/);
  assert.match(after, /Write a cover letter/);

  assert.ok(await clickCard(p, 'resume-ats'));
  await waitFor(async () => (await cardText(p)).includes('Your ATS resume is ready!'));
  assert.deepEqual(actions.at(-1), { id: 'a1', action: 'resume-ats' });
  assert.match(await cardText(p), /88%/);

  // Leaving the job (still on LinkedIn, no reload) puts the card away.
  await p.evaluate(() => {
    history.pushState({}, '', '/feed/');
    document.body.innerHTML = '<h1>Your feed</h1>';
  });
  await waitFor(async () => (await cardText(p)) === '');
  const cleared = await sw.evaluate(async () => chrome.action.getBadgeText({ tabId: (await chrome.tabs.query({ active: true }))[0].id }));
  assert.equal(cleared, '');
  await p.close();
});

test('Greenhouse: uses the structured job data; "No thanks" saves nothing', async () => {
  const p = await context.newPage();
  await p.goto('https://boards.greenhouse.io/providence/jobs/42');
  const g = await waitFor(() => previews.find((x) => x.company === 'Providence Health'));
  assert.equal(g.title, 'Registered Nurse - Telemetry');
  assert.match(g.location, /Portland, OR/);
  assert.match(g.salary, /48 - 66 per hour/);
  assert.match(g.text, /- BLS and ACLS certification required/);
  assert.equal(g.source, 'structured-data');

  await waitFor(async () => (await cardText(p)).includes('Registered Nurse'));
  assert.ok(await clickCard(p, 'no'));
  await waitFor(async () => (await cardText(p)) === '');
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await cardText(p), '', 'stays away after "No thanks"');
  assert.ok(!postings.some((x) => x.company === 'Providence Health'));
  await p.close();
});

test('a job you already saved shows as saved, not as a new question', async () => {
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/jobs/view/111');
  await p.click('[data-job="pm"]');
  const text = await waitFor(async () => ((await cardText(p)).includes('In your saved jobs') ? cardText(p) : null));
  assert.match(text, /Product Manager/);
  assert.ok(!text.includes('Add this job to your saved jobs?'));
  await p.close();
});

test('company careers pages: finds the posting, leaves out menus and other openings, and asks too', async () => {
  const p = await context.newPage();
  await p.goto('https://careers.fabrikam.example/jobs/senior-accountant');
  await p.addScriptTag({ path: path.join(EXT_DIR, 'extract.js') });
  const r = await p.evaluate(() => globalThis.sproutExtract());
  assert.equal(r.isPosting, true);
  assert.equal(r.title, 'Senior Accountant');
  assert.match(r.text, /CPA required/);
  assert.match(r.text, /Big 4 audit experience/);
  for (const junk of ['Warehouse Associate', 'About us', 'Privacy']) assert.ok(!r.text.includes(junk), `leaked: ${junk}`);
  await waitFor(async () => (await cardText(p)).includes('Add this job to your saved jobs?'));
  assert.ok(!postings.some((x) => x.title === 'Senior Accountant'), 'not saved on its own');
  await p.close();
});

test('Phenom careers sites (careers.freddiemac.com and the like): reads the job data the page carries', async () => {
  const p = await context.newPage();
  await p.goto('https://careers.contoso.example/us/en/job/JR123/Chief-of-Staff');
  const r = await waitFor(() => previews.find((x) => x.title === 'Chief of Staff' && x.company === 'Contoso'));
  assert.equal(r.location, 'McLean, Virginia');
  assert.match(r.text, /Partner with the CEO on strategy/);
  assert.match(r.text, /- 8\+ years of experience in strategy/);
  assert.ok(!r.text.includes('Life at Contoso'), 'menus are left out');
  await waitFor(async () => (await cardText(p)).includes('Add this job to your saved jobs?'));
  // Data left over from another job (moved on without a reload) isn't used.
  await p.evaluate(() => (document.querySelector('h1').textContent = 'Data Engineer'));
  await p.evaluate(() => (document.title = 'Data Engineer | Contoso Careers'));
  await p.evaluate(() => history.pushState({}, '', '/us/en/job/JR456/Data-Engineer'));
  await p.addScriptTag({ path: path.join(EXT_DIR, 'extract.js') });
  const stale = await p.evaluate(() => globalThis.sproutExtract());
  assert.ok(!stale.isPosting || stale.title !== 'Chief of Staff');
  await p.close();
});

test('postings under headings like "Position Overview:" are found without any job data', async () => {
  const html = `<!doctype html><html><head><title>Senior Analyst | Adatum Careers</title></head><body>
    <div class="nav">Search jobs · Students · Benefits</div>
    <div class="wrap"><div class="jd"><h1>Senior Analyst</h1>
      <div><b>Position Overview:</b></div><div>Build the models behind our pricing decisions and present findings to leadership.</div>
      <div><b>Your Work Team:</b></div><div>You will join a team of six analysts working with finance and product.</div>
      <div><b>Qualifications:</b></div><div>4+ years of experience in analytics. Experience with SQL and Python. Master's preferred.</div>
      <div>Full-time, hybrid. Adatum is an equal opportunity employer. Benefits include a 401k match.</div></div></div></body></html>`;
  await context.route('https://careers.adatum.example/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  const p = await context.newPage();
  await p.goto('https://careers.adatum.example/us/en/job/R9/Senior-Analyst');
  const r = await waitFor(() => previews.find((x) => x.title === 'Senior Analyst'));
  assert.match(r.text, /Experience with SQL and Python/);
  assert.ok(!r.text.includes('Students'), 'menus are left out');
  await p.close();
});

test('a careers page that shows its posting in a frame from another site: the card still pops up', async () => {
  const p = await context.newPage();
  await p.goto('https://careers.northwind.example/careers/job?id=55');
  const r = await waitFor(() => previews.find((x) => x.title === 'Operations Manager'));
  assert.equal(r.url, 'https://careers.northwind.example/careers/job?id=55', 'the address is the page you can come back to');
  assert.match(r.text, /Lean and Six Sigma/);
  await waitFor(async () => (await cardText(p)).includes('Add this job to your saved jobs?'));
  // Only one card, on the page itself, not one inside the frame too.
  const frameCards = await p.frames()[1].evaluate(() => document.querySelectorAll('sprout-card').length);
  assert.equal(frameCards, 0);
  await p.close();
});

test('pages that are not job postings are ignored', async () => {
  await context.route('https://www.linkedin.com/jobs/search/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Jobs you may be interested in</h1><ul><li>Engineer</li></ul>' }));
  const before = previews.length;
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/jobs/search/?q=x');
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal(previews.length, before);
  assert.equal(await cardText(p), '');
  await p.close();
});

test('LinkedIn profile: reads the person, says what you share, and adds them when you say so', async () => {
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/in/frederick-lee-4a5b6c/?miniProfileUrn=abc');
  const f = await waitFor(() => people.find((x) => x.name === 'Frederick Lee'));
  assert.equal(f.url, 'https://www.linkedin.com/in/frederick-lee-4a5b6c');
  assert.equal(f.title, 'Chief of Staff to the COO');
  assert.equal(f.company, 'OCTA');
  assert.match(f.headline, /^Chief of Staff to the COO/);
  assert.match(f.location, /Arlington, Virginia/);
  assert.deepEqual(f.schools, ['University of Virginia']);
  assert.equal(f.degree, 2);
  assert.equal(f.mutual, 12);
  assert.deepEqual(f.employers, ['OCTA', 'Appian Corporation', 'Booz Allen Hamilton'], 'grouped roles count their company once');

  const text = await waitFor(async () => ((await cardText(p)).includes('Add Frederick to your people?') ? cardText(p) : null));
  assert.match(text, /You both went to University of Virginia/);
  assert.match(text, /Your Operations Lead role is here/);
  assert.equal(added.length, 0, 'nobody is added until you say so');
  const badge = await sw.evaluate(async () => chrome.action.getBadgeText({ tabId: (await chrome.tabs.query({ active: true }))[0].id }));
  assert.equal(badge, '');

  assert.ok(await clickCard(p, 'add-person'));
  await waitFor(() => added.length === 1);
  assert.equal(added[0].name, 'Frederick Lee');
  await waitFor(async () => (await cardText(p)).includes('Added to your people'));
  assert.ok(await inCard(p, function () {
    return !!this.querySelector('.dock:not([hidden]) [data-act="open-person"]');
  }));

  // Leaving the profile (no reload) puts the card away.
  await p.evaluate(() => {
    history.pushState({}, '', '/feed/');
    document.body.innerHTML = '<h1>Your feed</h1>';
  });
  await waitFor(async () => (await cardText(p)) === '');
  await p.close();
});

test('late-loaded requirements are rescored even when the first 600 characters stay the same', async () => {
  const p = await context.newPage();
  await p.goto('https://www.linkedin.com/jobs/view/late-requirements');
  await waitFor(() => previews.find((x) => x.url.endsWith('/late-requirements')));
  await p.evaluate(() => { document.querySelector('#job-details').append(' Required: active TS/SCI security clearance.'); });
  const changed = await waitFor(() => previews.find((x) => x.url.endsWith('/late-requirements') && x.text.includes('TS/SCI')));
  assert.match(changed.text, /active TS\/SCI/);
  await p.close();
});

test('removing an embedded posting clears the card and the toolbar job', async () => {
  const p = await context.newPage();
  await p.goto('https://careers.northwind.example/careers/job?id=55');
  await waitFor(async () => (await cardText(p)).includes('Operations Manager'));
  await p.evaluate(() => document.querySelector('iframe').remove());
  await waitFor(async () => (await cardText(p)) === '');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0].id);
  assert.equal(await sw.evaluate((id) => getEntry(id), tabId), null);
  await p.close();
});

test('a preview finishing after leaving the job cannot reopen its card', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  previewGate = (posting) => posting.url.endsWith('/pending-preview') ? gate : Promise.resolve();
  const p = await context.newPage();
  try {
    await p.goto('https://www.linkedin.com/jobs/view/pending-preview');
    await waitFor(() => previews.find((x) => x.url.endsWith('/pending-preview')));
    await p.evaluate(() => { history.pushState({}, '', '/feed/'); document.body.innerHTML = '<h1>Your feed</h1>'; });
    await p.waitForTimeout(700);
    release();
    await p.waitForTimeout(300);
    assert.equal(await cardText(p), '');
    const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true }))[0].id);
    assert.equal(await sw.evaluate((id) => getEntry(id), tabId), null);
  } finally { release(); previewGate = null; await p.close(); }
});

test('slow SPA navigation never attributes the old description to the new job', async () => {
  const p = await context.newPage();
  try {
    await p.goto('https://www.linkedin.com/jobs/view/slow-navigation');
    await waitFor(async () => (await cardText(p)).includes('Senior Frontend Engineer'));
    await p.evaluate(() => {
      history.pushState({}, '', '/jobs/view/still-loading');
      document.querySelector('h1').textContent = 'New job, description still loading';
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => history.replaceState({}, '', location.pathname + '?trk=loading'));
    await p.waitForTimeout(4900);
    assert.equal(await cardText(p), '');
    assert.ok(!previews.some((x) => x.url.includes('/still-loading')), 'old text was not sent under the new title or URL');
    await p.click('[data-job="pm"]');
    await waitFor(async () => (await cardText(p)).includes('Product Manager'));
  } finally { await p.close(); }
});

test('a tracking parameter change keeps the same posting available', async () => {
  const p = await context.newPage();
  try {
    await p.goto('https://www.linkedin.com/jobs/view/tracking-only');
    await waitFor(async () => (await cardText(p)).includes('Senior Frontend Engineer'));
    await p.evaluate(() => history.replaceState({}, '', location.pathname + '?trk=job_search&utm_source=feed'));
    await waitFor(() => previews.find((x) => x.url.includes('/tracking-only?trk=')));
    await waitFor(async () => (await cardText(p)).includes('Senior Frontend Engineer'));
  } finally { await p.close(); }
});
