// The hiring-manager read (src/main/resumeStrength.js) and what the one-click
// optimizer does with it: the first bullets are the work the job is titled
// for, proof from the posting's sector is up top, the summary repeats no
// bullet and states the years the role dates show, and the person's other
// documents can put their strongest proof on the page (marked to check).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resumeStrength } = require('../src/main/resumeStrength');
const { localFitScore, shownFit } = require('../src/main/localFit');
const { resumeEnhancements } = require('../src/main/resumeContext');
const B = require('../src/main/bullets');
const P = require('./fixtures/allianceOpportunities');

const read = (f) => fs.readFileSync(path.join(__dirname, 'e2e', 'fixtures', f), 'utf8');
const RESUME = { name: 'Jordan_Reyes_Resume.txt', kind: 'resume', text: read('Jordan_Reyes_Resume.txt') };
const IMPACT = { name: 'Impact_Statement.txt', kind: 'recommendation', text: read('Impact_Statement.txt') };
const profile = { name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '555-010-2000', location: 'Arlington, VA' };
const bank = () => B.mergeIntoBank(null, B.parseResume(RESUME.text), { id: 'r', name: RESUME.name }).bank;
const optimize = (job) => {
  const b = bank();
  const fit = shownFit(localFitScore(job, [RESUME, IMPACT], profile)).score;
  const evidence = resumeEnhancements({ job, bank: b, profile, documents: [RESUME, IMPACT], fit }).filter((a) => a.draft);
  return { b, out: B.optimizeResume({ profile, bank: b, job, evidence }) };
};

const CI = 'Led competitive intelligence for the CTO, tracking competitor launches and pricing to produce battlecards';
const QBR = 'Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), driving $9M+ in customer transactions';
const DASH = 'Built analytical reports and dashboards using SQL and Excel to track program performance';
const page = (summary, bullets, dates = 'Aug. 2019 – Present') => ({ summary, roles: [{ experienceId: 'e', title: 'Sr. Strategy Consultant', organization: 'Northwind Software', dates, bullets: bullets.map((text) => ({ text })) }] });

test('a summary that says any bullet again costs, not only the first', () => {
  const job = P.salesforcePubSecCI;
  const clean = resumeStrength(page('Strategy consultant with 7 years of experience in competitive intelligence.', [CI, DASH, QBR]), job);
  const third = resumeStrength(page('Strategy consultant with 7 years of experience in competitive intelligence. Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat).', [CI, DASH, QBR]), job);
  assert.ok(third.score < clean.score, `${third.score} < ${clean.score}`);
  assert.ok(third.notes.some((n) => /repeats a bullet on the page/.test(n)), third.notes.join(' '));
});

test("the summary's years are checked against the role dates", () => {
  const job = P.mark43SeniorCI;
  const right = resumeStrength(page('Strategy consultant with 7 years of experience in competitive intelligence.', [CI, DASH]), job);
  const stale = resumeStrength(page('Strategy consultant with 5 years of experience in competitive intelligence.', [CI, DASH]), job);
  assert.ok(stale.score < right.score);
  assert.ok(stale.notes.some((n) => /says 5 years; your role dates show 7/.test(n)), stale.notes.join(' '));
});

test('a competitive intelligence role opens with the competitive intelligence work, not a supporting verb', () => {
  const job = P.evenupCI;
  const ci = resumeStrength(page('Strategy consultant with 7 years of experience in competitive intelligence.', [CI, DASH, QBR]), job);
  const dash = resumeStrength(page('Strategy consultant with 7 years of experience in competitive intelligence.', [DASH, CI, QBR]), job);
  assert.ok(dash.notes.some((n) => /titled for/.test(n)), dash.notes.join(' '));
  assert.ok(ci.score > dash.score);
  const weak = resumeStrength(page('Strategy consultant with 7 years of experience in competitive intelligence.', ['Collaborated with sales leaders on competitive intelligence research for a sales play', CI]), job);
  assert.ok(weak.notes.some((n) => /supporting verb/.test(n)), weak.notes.join(' '));
});

test('the optimizer puts documented public sector deals up top for a public sector CI role', () => {
  for (const key of ['salesforcePubSecCI', 'mark43SeniorCI', 'googlePublicSector']) {
    const { out } = optimize(P[key]);
    const lead = out.doc.roles[0].bullets.slice(0, 2).map((b) => b.text);
    assert.ok(lead.some((t) => /Army, Navy and DARPA/.test(t)), `${key}: ${lead.join(' | ')}`);
    if (key !== 'googlePublicSector') assert.match(lead[0], /competitive intelligence/i, key);
    // From the impact statement: marked to check, not a bank bullet yet.
    const doc = out.doc.roles[0].bullets.find((b) => /DARPA/.test(b.text));
    assert.equal(doc.bulletId, null);
    assert.match(doc.flag, /Drafted from your Impact Statement/);
    assert.ok(out.notes.some((n) => /drafted from your Impact Statement/.test(n)), out.notes.join(' '));
  }
});

test('document drafts stay off the page for a stretch role', () => {
  const { out } = optimize(P.ctoChiefOfStaff);
  assert.ok(!out.doc.roles.some((r) => r.bullets.some((b) => b.flag)));
});

test('the optimizer brings an out-of-date "5 years" in your own summary up to your role dates', () => {
  const { out } = optimize(P.kickboardCI);
  assert.match(out.doc.summary, /7 years/);
  assert.doesNotMatch(out.doc.summary, /\b5 years/);
  assert.ok(out.notes.some((n) => /5 years brought up to the 7/.test(n)), out.notes.join(' '));
});

test('the summary never says a bullet on the page again, and its proof is the posting\'s kind of work', () => {
  for (const job of Object.values(P)) {
    const { out } = optimize(job);
    const bullets = out.doc.roles.flatMap((r) => r.bullets.map((b) => b.text.toLowerCase()));
    for (const s of out.doc.summary.split(/(?<=\.)\s+/).slice(1)) {
      const c = s.toLowerCase().replace(/\.$/, '').replace(/^at [^,]+,\s*/, '');
      assert.ok(!bullets.some((b) => b.includes(c)), `${job.title}: "${s}"`);
    }
    assert.doesNotMatch(out.doc.summary, / experience at [A-Z][^.]+\.$/, `${job.title}: no keyword sentence`);
  }
});

test('two bullets that tell one result: the merge is offered, built only from their own words', () => {
  const keep = 'Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), forecasting partnership-driven revenue and driving $9M+ in customer transactions';
  const other = 'Executed $9M in customer transactions via AWS Marketplace by collaborating with marketing, sales, and product teams to develop enablement materials';
  assert.equal(B.mergeTwins(keep, other), `${keep} via AWS Marketplace by collaborating with marketing, sales, and product teams to develop enablement materials`);
  assert.equal(B.mergeTwins(other, keep), null, 'the kept bullet must end on the shared result');
  assert.equal(B.mergeTwins('Built dashboards in SQL', 'Wrote reports'), null);
  const { out } = optimize(P.googlePublicSector);
  const m = out.merges[0];
  assert.ok(m && out.doc.roles[0].bullets.some((b) => b.bulletId === m.bulletId && b.text === m.from), JSON.stringify(out.merges));
  assert.match(m.text, /\$9M\+ in customer transactions via AWS Marketplace/);
});
