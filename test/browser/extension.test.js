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
// "Do you have it?": the Senior Accountant posting asks for a CPA and Big 4
// audit experience; a yes adds 9 points, a no just stops asking.
const answers = [];
const declined = new Set();
const ACCOUNTANT_ASKS = [
  { label: 'CPA', ask: 'CPA', options: null, gain: 9 },
  { label: 'one of NetSuite, SAP', ask: 'NetSuite or SAP', options: ['NetSuite', 'SAP'], gain: 4 },
];
function accountantQuick() {
  const yes = answers.filter((a) => a.answer === 'yes').length;
  return { ...quick, score: 61 + 9 * yes, label: 'Good potential', asks: ACCOUNTANT_ASKS.filter((a) => !declined.has(a.label) && !answers.some((x) => x.label === a.label && x.answer === 'yes')) };
}
// Root's and Spike's questions before a resume.
const asks = [];
const asksAnswered = [];
const asksSkipped = [];
const SPIKE_QS = [
  { id: 's1', kind: 'pick', question: 'Which of these have you used? Tick any, and say where if you can.', options: ['NetSuite', 'SAP'], why: 'The posting names them; nothing in your documents shows them yet.', boost: { strength: 9, ats: 8 }, placeholder: 'Where you used them and what for (optional)' },
  { id: 's2', kind: 'bullet', question: 'Can you add a number to this bullet: how many, how much, how often, or what changed? Only if you know it.', bullet: 'Reconciled intercompany accounts for the month-end close', prefill: 'Reconciled intercompany accounts for the month-end close', why: 'A number makes one of the first lines a reader sees concrete.', boost: { strength: 6, ats: 0 } },
];
const ROOT_QS = [
  { id: 'q1', kind: 'yes_no', question: 'Have you led a month-end close yourself, rather than supported one?', why: 'The posting asks someone to own the close; your documents say you supported it.', placeholder: 'Which entities, how long it took, what changed' },
  { id: 'q2', kind: 'number', question: 'How many entities did your consolidations cover?', why: 'A number makes your consolidation work concrete.', placeholder: 'A count, as best you know it' },
];
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
      const q = p.title === 'Senior Accountant' ? accountantQuick() : quick;
      return { saved: false, preview: { job: { title: p.title, company: p.company, location: p.location, url: p.url }, quick: q, ats: { before: { score: 72, grade: 'B', skillsMatch: 'Good' } } }, ...env };
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
    onHave: async ({ label, answer, option, id, posting }) => {
      answers.push({ label, answer, option, id, posting });
      if (answer === 'no') declined.add(label);
      const q = accountantQuick();
      return { saved: false, preview: { job: { title: posting.title, company: posting.company, url: posting.url }, quick: q, ats: null }, ...env, answered: answer === 'yes' ? { label, answer, where: 'skills', value: option || label } : { label, answer } };
    },
    // Before a resume, the card asks first (as the app does): Spike's questions
    // with their strength boost, Root's from Claude; the answers or a skip come back here.
    onQuestions: async ({ id, who }) => {
      asks.push({ id, who });
      // Only the Senior Accountant job has anything worth asking; for the rest the resume starts at once.
      if (saved.get(id).job.title !== 'Senior Accountant') return { questions: [] };
      if (who === 'spike') return { strength: 81, ifAll: 94, questions: SPIKE_QS };
      return { questions: ROOT_QS };
    },
    onAnswer: async ({ id, who, replies }) => (asksAnswered.push({ id, who, replies }), { saved: replies.length }),
    onSkipQuestions: async ({ id, who }) => (asksSkipped.push({ id, who }), { skipped: 2 }),
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
  // Under load the worker can be reached before Chrome has given it its APIs.
  await sw.evaluate(async (port) => {
    for (let i = 0; i < 100 && !(globalThis.chrome && chrome.storage); i++) await new Promise((r) => setTimeout(r, 50));
    await chrome.storage.local.set({ port });
  }, port);
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
  // (The rings count up as they appear: wait for the final number.)
  await waitFor(async () => /72\s*ATS\s*ATS screening\s*How screening software reads it/.test(await cardText(p)));
  assert.ok(!/ATS match/.test(text), 'described as the resume going through screening, not a match of you');
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
  assert.deepEqual(asks.at(-1), { id: 'a1', who: 'spike' }, 'Spike checked first, had nothing to ask, and went straight on');
  assert.match(await cardText(p), /ATS screening\s*72%\s*→\s*88%/);

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
  await p.addScriptTag({ path: path.join(EXT_DIR, 'vendor/jobTitle.js') });
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

test('"Do you have these?": a yes is recorded and the card re-scores; a no stops asking', async () => {
  const p = await context.newPage();
  await p.goto('https://careers.fabrikam.example/jobs/senior-accountant');
  const text = await waitFor(async () => ((await cardText(p)).includes('Do you have these?') ? cardText(p) : null));
  assert.match(text, /CPA\s*\+9/);
  assert.match(text, /NetSuite or SAP/);
  // Yes to the CPA.
  assert.ok(
    await inCard(p, function () {
      const b = this.querySelector('.dock [data-act="have"][data-label="CPA"][data-answer="yes"]');
      if (b) b.click();
      return !!b;
    })
  );
  const after = await waitFor(async () => ((await cardText(p)).includes('Fit 61 → 70') ? cardText(p) : null));
  assert.match(after, /Added CPA to your skills/);
  assert.ok(!/CPA\s*\+9/.test(after), 'not asked again');
  const yes = answers.find((a) => a.label === 'CPA');
  assert.equal(yes.answer, 'yes');
  assert.equal(yes.posting.title, 'Senior Accountant', 'a job not saved yet is re-scored from the page');
  assert.ok(!postings.some((x) => x.title === 'Senior Accountant'), 'answering does not save the job');
  // The detailed breakdown opens and closes, and is remembered.
  assert.ok(!/Your fit/.test(after), 'folded away at first');
  assert.ok(await clickCard(p, 'details'));
  const open = await waitFor(async () => ((await cardText(p)).includes('Your fit') ? cardText(p) : null));
  assert.match(open, /Must-haves/i);
  assert.equal(await sw.evaluate(() => chrome.storage.local.get('details').then((v) => v.details)), true);
  assert.ok(await clickCard(p, 'details'));
  await waitFor(async () => !(await cardText(p)).includes('Your fit'));
  // No to the other one: it goes away.
  assert.ok(
    await inCard(p, function () {
      const b = this.querySelector('.dock [data-act="have"][data-answer="no"]');
      if (b) b.click();
      return !!b;
    })
  );
  await waitFor(async () => !(await cardText(p)).includes('Do you have these?'));
  assert.equal(answers.at(-1).answer, 'no');
  assert.equal(answers.at(-1).label, 'one of NetSuite, SAP');
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
  await p.addScriptTag({ path: path.join(EXT_DIR, 'vendor/jobTitle.js') });
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

test('before a resume the card asks first, as the app does: Spike with its strength boost, Root from Claude; skip is one click', async () => {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.goto('https://careers.fabrikam.example/jobs/senior-accountant');
  await waitFor(async () => ((await cardText(p)).includes('Senior Accountant') ? true : null));
  if (!(await cardText(p)).match(/ATS resume/)) {
    assert.ok(await clickCard(p, 'save'), 'save the job first');
    await waitFor(async () => ((await cardText(p)).includes('ATS resume') ? true : null));
  }
  // Spike: two questions, each with what it adds; the count and buttons are pinned in view.
  assert.ok(await clickCard(p, 'resume-ats'));
  const spike = await waitFor(async () => ((await cardText(p)).includes('Spike has 2 questions') ? cardText(p) : null));
  assert.match(spike, /\+9 resume strength/);
  assert.match(spike, /\+6 resume strength/);
  assert.match(spike, /reads at 81 resume strength now; answering could take it to about 94/);
  assert.equal(asks.at(-1).who, 'spike');
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'ext-1-spike.png') });
  const pinned = () => inCard(p, function () {
    const f = this.querySelector('.dock .qa-foot');
    const box = this.querySelector('.dock .pop') || f.closest('.pop') || this.querySelector('.dock');
    const a = f.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return a.bottom <= b.bottom + 1 && a.top >= b.top && a.height > 0;
  });
  assert.ok(await pinned(), 'Skip / Save in view');
  // Answer one: tick SAP, and add a number to the bullet.
  await inCard(p, function () {
    const box = this.querySelector('.dock input[name="qa-s1"][value="SAP"]');
    box.click();
    const t = this.querySelector('.dock [data-qa-detail="s2"]');
    t.value = 'Reconciled intercompany accounts for 14 entities in the month-end close';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.match(await cardText(p), /2 of 2 answered · resume strength 81 → about 96/);
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'ext-2-spike-answered.png') });
  const before = actions.length;
  await inCard(p, function () { this.querySelector('.dock [data-qa-go]').click(); });
  await waitFor(() => actions.length > before);
  assert.deepEqual(asksAnswered.at(-1).replies, [
    { id: 's1', answer: null, detail: '', picked: ['SAP'] },
    { id: 's2', answer: null, detail: 'Reconciled intercompany accounts for 14 entities in the month-end close', picked: [] },
  ]);
  assert.equal(actions.at(-1).action, 'resume-ats', 'then the resume, as asked for');
  await waitFor(async () => ((await cardText(p)).includes('resume is ready') ? true : null));
  // Root: questions from Claude; Skip is one click and goes straight on.
  await inCard(p, function () { const b = this.querySelector('.dock [data-act="back"], .dock [data-act="dismiss-quiet"]'); if (b) b.click(); });
  await p.reload();
  await waitFor(async () => ((await cardText(p)).includes('Claude resume') ? true : null));
  assert.ok(await clickCard(p, 'resume'));
  const root = await waitFor(async () => ((await cardText(p)).includes('Root has 2 questions') ? cardText(p) : null));
  assert.match(root, /led a month-end close yourself/);
  assert.ok(!/resume strength/.test(root), 'only Spike shows the strength boost');
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'ext-3-root.png') });
  const n = actions.length;
  await inCard(p, function () { this.querySelector('.dock [data-qa-skip]').click(); });
  await waitFor(() => actions.length > n);
  assert.equal(asksSkipped.at(-1).who, 'root');
  assert.equal(actions.at(-1).action, 'resume');
  await p.close();
});
