// "Write with Claude" with its questions, in the real app (headless), with
// test/e2e/fakeClaude.js standing in for Claude: import the fictional
// candidate, check Okta's Cloud Alliance Manager posting, click Write with
// Claude, answer the questions, and look at the draft, the library and the
// bullet bank. Screenshots go to OUT/shots.
//
//   OUT=/tmp/ask xvfb-run -a node test/e2e/askBeforeWriting.js
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.SPROUT_FAKE_CLAUDE = path.join(__dirname, 'fakeClaude.js');
const { launch } = require('./launch');
const P = require('../fixtures/allianceOpportunities');

const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-ask-'));
const DOCS = path.join(__dirname, 'fixtures');
const ANSWERS = {
  q1: { yes: true, detail: 'I worked with AWS account managers on 6 joint deals in 2025 and registered each one in ACE; 4 closed.' },
  q2: { detail: 'I owned the day-to-day relationship with our AWS partner manager and the 2025 joint business plan (quarterly pipeline targets and a Marketplace private-offer motion). Our VP owned the executive relationship.' },
  q3: { yes: true, detail: 'We sold through AWS Marketplace private offers, and I set them up with sales ops.' },
  q4: { yes: true, detail: 'I ran two co-marketing webinars with AWS in 2025 that brought in 140 registrants.' },
};

(async () => {
  const { app, page, shot, errors, answerFilePicker } = await launch({ shots: path.join(OUT, 'shots') });
  const go = async (hash) => { await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(900); };
  try {
    await answerFilePicker(fs.readdirSync(DOCS).filter((f) => /\.txt$/.test(f)).map((f) => path.join(DOCS, f)));
    await go('#library');
    await page.click('#pickBtn');
    await page.waitForFunction(() => document.querySelectorAll('.kindSel').length >= 3, null, { timeout: 120000 });
    await page.waitForTimeout(1500);

    const job = P.oktaAwsAlliance;
    await go('#check');
    await page.fill('#jTitle', job.title);
    await page.fill('#jCompany', job.company);
    await page.fill('#jText', job.text);
    await page.click('#analyzeBtn');
    await page.waitForFunction(() => location.hash.startsWith('#application/'), null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => [...document.querySelectorAll('.page button')].find((b) => /Save to applications/.test(b.innerText))?.click());
    await page.waitForTimeout(1000);
    await page.evaluate(() => [...document.querySelectorAll('.page button')].find((b) => b.innerText.trim() === 'Resume')?.click());
    await page.waitForSelector('[data-mode-go="claude"]', { timeout: 20000 });

    // Optimize for ATS: Spike asks first, each question with its resume strength boost.
    await page.click('[data-mode-go="ats"]');
    await page.waitForSelector('.qa-list', { timeout: 30000 });
    await page.waitForTimeout(500);
    await shot('ask-00-spike');
    // Skip is one click, and the count and buttons stay in view while scrolling.
    await page.evaluate(() => { const c = document.querySelector('#modalCard'); c.scrollTop = c.scrollHeight / 3; });
    await page.waitForTimeout(300);
    await page.click('#qaSkip');
    await page.waitForFunction(() => /Optimized for ATS/.test(document.querySelector('.page')?.innerText || ''), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await shot('ask-00b-optimized-after-skip');

    // Write with Claude: Root's questions come first.
    await page.click('[data-mode-go="claude"]');
    await page.waitForSelector('.qa-list', { timeout: 30000 });
    await page.waitForTimeout(500);
    await shot('ask-01-questions');
    for (const [id, a] of Object.entries(ANSWERS)) {
      if (a.yes) await page.check(`input[name="qa-${id}"][value="yes"]`);
      await page.fill(`[data-qa-detail="${id}"]`, a.detail);
    }
    await page.evaluate(() => { const c = document.querySelector('#modalCard'); c.scrollTop = c.scrollHeight / 2.5; });
    await page.waitForTimeout(300);
    await shot('ask-02-answered');
    await page.click('#qaGo');
    await page.waitForFunction(() => /Rewrite with Claude/.test(document.querySelector('.page')?.innerText || ''), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await shot('ask-03-draft');
    // The notes: what Claude did with the answers (the Check tab).
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Check\b/.test(b.innerText.trim()))?.click());
    await page.waitForTimeout(600);
    await page.evaluate(() => { const d = document.querySelector('details.checks'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } });
    await page.waitForTimeout(400);
    await shot('ask-04-notes');

    // Kept for good: the library and the bullet bank.
    await go('#library');
    await page.waitForTimeout(800);
    await shot('ask-05-library');
    await page.evaluate(() => { const el = [...document.querySelectorAll('.page *')].find((e) => e.children.length === 0 && /Answers you gave Sprout/.test(e.textContent)); el?.click(); });
    await page.waitForTimeout(1000);
    await shot('ask-06-answers-document');
    await page.evaluate(() => document.querySelector('#modalCard .modal-x')?.click());
    await go('#bank');
    await page.waitForTimeout(800);
    await page.evaluate(() => { const el = [...document.querySelectorAll('.page *')].find((e) => e.children.length === 0 && /joint business plan/.test(e.textContent)); el?.scrollIntoView({ block: 'center' }); });
    await shot('ask-07-bank');
    console.log(JSON.stringify({ ok: true, errors, out: OUT }));
  } catch (err) {
    await shot('ask-99-crash').catch(() => {});
    console.log(JSON.stringify({ ok: false, error: err.stack, errors, out: OUT }));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
