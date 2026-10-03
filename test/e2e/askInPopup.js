// The desktop popup asks first too, as the editor does: a job arrives (here
// through the browser bridge, as the extension sends it), the popup scores
// it, and clicking Claude resume / ATS resume brings Root's or Spike's
// questions before the resume. test/e2e/fakeClaude.js stands in for Claude.
//
//   OUT=/tmp/ask-popup xvfb-run -a node test/e2e/askInPopup.js
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.SPROUT_FAKE_CLAUDE = path.join(__dirname, 'fakeClaude.js');
const PORT = 47390;
process.env.JOBTRACK_BRIDGE_PORT = String(PORT);
const { launch } = require('./launch');
const P = require('../fixtures/allianceOpportunities');

const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-ask-popup-'));
const shots = path.join(OUT, 'shots');
const read = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const ORIGIN = 'chrome-extension://sprouttestpopup';
const TOKEN = 'popup-demo-token';

// A data folder with the fictional candidate, and a paired "browser".
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-ask-popup-data-'));
const now = Date.now();
fs.writeFileSync(path.join(data, 'jobtrack.json'), JSON.stringify({
  settings: { clipboardWatch: false, popupThreshold: 0, bridgePairings: [{ origin: ORIGIN, token: TOKEN, name: 'Test browser' }] },
  profile: { name: 'Jordan Reyes', email: 'jordan.reyes@example.com' },
  documents: [
    { id: 'd1', name: 'Jordan_Reyes_Resume.txt', kind: 'resume', text: read('Jordan_Reyes_Resume.txt'), addedAt: new Date(now - 2000).toISOString() },
    { id: 'd2', name: 'Impact_Statement.txt', kind: 'recommendation', text: read('Impact_Statement.txt'), addedAt: new Date(now - 1000).toISOString() },
  ],
  applications: [],
}));

const post = (job) => fetch(`http://127.0.0.1:${PORT}/posting`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Sprout-Token': TOKEN },
  body: JSON.stringify({ title: job.title, company: job.company, location: job.location, url: job.url, text: job.text, silent: false }),
}).then((r) => r.json());

(async () => {
  const { app, errors } = await launch({ data, shots });
  const overlay = async () => {
    for (let i = 0; i < 40; i++) {
      const w = app.windows().find((x) => /overlay\.html/.test(x.url()));
      if (w) return w;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('The popup never opened.');
  };
  const snap = async (w, name) => { await w.waitForTimeout(400); await w.screenshot({ path: path.join(shots, `${name}.png`) }); };
  try {
    // Root, before Write with Claude.
    const posted = await post(P.oktaAwsAlliance);
    if (process.env.DEBUG) console.error('posted', JSON.stringify(posted).slice(0, 300));
    const pop = await overlay();
    if (process.env.DEBUG) { await pop.waitForTimeout(3000); console.error('popup', (await pop.evaluate(() => document.body.innerText)).slice(0, 600)); }
    await pop.waitForSelector('[data-act="resume"]', { timeout: 20000 });
    await snap(pop, 'popup-0-scored');
    await pop.click('[data-act="resume"]');
    await pop.waitForSelector('.qa', { timeout: 30000 });
    await snap(pop, 'popup-1-root-asks');
    await pop.check('.qa input[value="yes"]');
    await pop.fill('[data-qa-detail="q1"]', 'I worked with AWS account managers on 6 joint deals in 2025 and registered each one in ACE; 4 closed.');
    await pop.fill('[data-qa-detail="q2"]', 'I owned the day-to-day relationship with our AWS partner manager and the 2025 joint business plan (quarterly pipeline targets and a Marketplace private-offer motion). Our VP owned the executive relationship.');
    await snap(pop, 'popup-2-root-answered');
    await pop.click('[data-qa-go]');
    await pop.waitForFunction(() => /resume is ready/.test(document.body.innerText), null, { timeout: 60000 });
    await snap(pop, 'popup-3-root-done');

    // Spike, before Optimize for ATS, on another job.
    await post(P.kickboardCI);
    await pop.waitForFunction(() => /Competitive Intelligence and Market Insights Manager/.test(document.body.innerText) && document.querySelector('[data-act="resume-ats"]'), null, { timeout: 20000 });
    await pop.click('[data-act="resume-ats"]');
    const asked = await pop.waitForSelector('.qa', { timeout: 30000 }).then(() => true).catch(() => false);
    if (asked) {
      await snap(pop, 'popup-4-spike-asks');
      await pop.click('[data-qa-skip]');
    }
    await pop.waitForFunction(() => /resume is ready/.test(document.body.innerText), null, { timeout: 30000 });
    await snap(pop, 'popup-5-spike-done');
    console.log(JSON.stringify({ ok: true, spikeAsked: asked, errors, out: OUT }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.stack, errors, out: OUT }));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
