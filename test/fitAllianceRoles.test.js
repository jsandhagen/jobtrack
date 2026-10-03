// Findings from an end-to-end run (October 2026) with live postings for the
// fictional e2e candidate (test/e2e/fixtures), fixtures/allianceOpportunities.js:
//
// - Workiva's "Associate Strategic Alliance Executive" asks for 4+ years and
//   pays $143–230k, but "Associate" read as entry level: 76 and "You would
//   likely be overqualified" for someone with seven years in that work.
// - Google's "US Citizenship required to meet customer and compliance
//   requirements" made Legal / Compliance a required skill to ask about.
// - The optimized Google page put "Executed $9M … via AWS Marketplace" in the
//   summary, above a bullet "driving $9M+ in customer transactions".
// - Zendesk's "AWS cloud ecosystems" asked for "an example of cloud work"
//   from someone whose resume shows $9M through AWS Marketplace.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { localFitScore, shownFit } = require('../src/main/localFit');
const { classifyJobSkills } = require('../src/main/fitScore');
const { resumeEnhancements } = require('../src/main/resumeContext');
const B = require('../src/main/bullets');
const P = require('./fixtures/allianceOpportunities');

const read = (f) => fs.readFileSync(path.join(__dirname, 'e2e', 'fixtures', f), 'utf8');
const RESUME = { name: 'Jordan_Reyes_Resume.txt', kind: 'resume', text: read('Jordan_Reyes_Resume.txt') };
const IMPACT = { name: 'Impact_Statement.txt', kind: 'recommendation', text: read('Impact_Statement.txt') };
const profile = { name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '555-010-2000', location: 'Arlington, VA' };
const bank = () => B.mergeIntoBank(null, B.parseResume(RESUME.text), { id: 'r', name: RESUME.name }).bank;
const fit = (job) => shownFit(localFitScore(job, [RESUME, IMPACT], profile));

test('an "Associate" title that asks for 4+ years is not an entry-level role', () => {
  const f = fit(P.workivaAlliance);
  assert.ok(f.score >= 85, `${f.score} ${f.label}`);
  assert.ok(!(f.screens || []).some((s) => /overqualified/.test(s.reason)), JSON.stringify(f.screens));
  assert.doesNotMatch(f.headline || '', /overqualified/);
});

test('a citizenship line is a screening question, not a compliance skill', () => {
  const skills = classifyJobSkills(P.googlePublicSector.text);
  assert.ok(!skills.has('Legal / Compliance'), [...skills.keys()].join(', '));
  assert.ok(classifyJobSkills('Requirements\n- Active TS/SCI security clearance; US citizenship required').has('Security Clearance'));
});

test('the optimized summary never repeats a figure the bullets give', () => {
  for (const job of Object.values(P)) {
    const { doc } = B.optimizeResume({ profile, bank: bank(), job });
    const figures = (t) => (String(t).match(/\$\d[\d.,]*[KMB]?/g) || []).map((f) => f.replace(/[+,]/g, ''));
    const onPage = new Set(doc.roles.flatMap((r) => r.bullets.flatMap((b) => figures(b.text))));
    const repeated = figures(doc.summary).filter((f) => onPage.has(f));
    assert.deepEqual(repeated, [], `${job.title}: ${doc.summary}`);
  }
});

test('no question about cloud work when the documents show AWS', () => {
  const asks = resumeEnhancements({ job: P.zendeskAlliance, bank: bank(), profile, documents: [RESUME, IMPACT], fit: 80 });
  assert.ok(!asks.some((a) => /\bcloud\b/i.test(a.topic || '') && !a.draft), asks.map((a) => a.text).join('\n'));
});

// Second run, with adjacent lanes, stretches and random jobs:
//
// - A Bank Teller read 76 "Good potential": "cash handling or customer
//   service" was met by one sentence saying "financial services" and "used
//   with customers".
// - A Chief of Staff asking for 12-15 years in executive management read as
//   Good potential for seven years as an individual contributor, and asked for
//   "an example of defining" and "of driving top-level" (verbs from "Experience
//   defining, planning, and driving top-level strategic initiatives").
// - "direct reports" was offered as "analytical reports" said another way, and
//   "An example of 12+ years of experience" read as no sentence does.
test('a bank teller is a stretch for a strategist whose documents mention customers and financial services', () => {
  const R = require('./fixtures/randomJobs');
  const teller = Object.values(R.POSTINGS || R.P || R).find((p) => p && p.title === 'Bank Teller');
  const f = fit(teller);
  assert.ok(f.score < 65, `${f.score} ${f.label}`);
});

test('twelve years asked of someone with seven is a stretch, and clause verbs are not requirements', () => {
  const f = fit(P.ctoChiefOfStaff);
  assert.ok(f.score < 65, `${f.score} ${f.label}`);
  const { requirementUnits } = require('../src/main/localFit');
  const labels = requirementUnits(P.ctoChiefOfStaff).units.map((u) => u.label);
  for (const bad of ['defining', 'driving top-level', 'responsibility']) assert.ok(!labels.includes(bad), labels.join(' | '));
});

test('questions about years and wording read plainly', () => {
  const asks = resumeEnhancements({ job: P.ctoChiefOfStaff, bank: bank(), profile, documents: [RESUME, IMPACT], fit: 64 });
  const text = asks.map((a) => a.text).join('\n');
  assert.doesNotMatch(text, /An example of \d+\+ years/);
  assert.doesNotMatch(text, /direct reports/);
  assert.match(text, /The posting asks for 12\+ years; your dated roles show about 7\./);
});

test('the optimizer says so when it keeps your own summary', () => {
  const opt = B.optimizeResume({ profile, bank: bank(), job: P.ctoChiefOfStaff });
  const own = bank().summary;
  if (opt.doc.summary === own) assert.ok(opt.notes.some((n) => /Kept your own summary/.test(n)), opt.notes.join(' '));
  else assert.ok(opt.notes.some((n) => /achievement in the summary/.test(n)), opt.notes.join(' '));
});

// Third run, good fits and one-level step-ups:
//
// - EvenUp's "Competitive Intelligence Manager" lists only duties, all of them
//   this candidate's work (battle cards, win/loss, objection handling), and
//   read 40 "Stretch": the competitors' "M&A activity" it monitors and the
//   "input to product roadmap discussions" it gives became must-haves, and the
//   competitive intelligence they've led didn't count as having done the role.
// - Mark43's "8-10 years …, ideally within SaaS or B2G" read as 5 years:
//   "ideally" made the whole line preferred.
// - Salesforce's PubSec competitive intelligence role didn't offer the impact
//   statement's public sector passage ("PubSec" wasn't public sector), and the
//   draft kept "120 slides" over "influencing deals with the Army, Navy and DARPA".
test('a duties-only posting for work you lead is a real fit', () => {
  const f = fit(P.evenupCI);
  assert.ok(f.score >= 65, `${f.score} ${f.label}`);
  for (const gap of ['M&A', 'Product Management', 'Roadmapping', 'Digital Products']) assert.ok(!(f.missingSkills || []).includes(gap), (f.missingSkills || []).join(', '));
  const { classifyJobSkills } = require('../src/main/fitScore');
  assert.ok(!classifyJobSkills(P.evenupCI.text).has('M&A'));
});

test('years before "ideally" are required years', () => {
  const { requiredYears } = require('../src/main/fitScore');
  assert.equal(requiredYears(P.mark43SeniorCI.text), 8);
});

test('a PubSec posting is offered the public sector passage, with the deals it influenced', () => {
  const asks = resumeEnhancements({ job: P.salesforcePubSecCI, bank: bank(), profile, documents: [RESUME, IMPACT], fit: 79 });
  const pub = asks.find((a) => a.draft && /pitches/.test(a.draft));
  assert.ok(pub, asks.map((a) => a.text).join('\n'));
  assert.match(pub.draft, /Army, Navy and DARPA/);
});

test('no bullet is tagged as proving a degree ("or equivalent professional experience")', () => {
  const { ranked } = B.rankBullets(P.cyeraOctoStrategyOps, bank());
  const tags = ranked.flatMap((r) => r.covers.map((c) => c.label));
  assert.ok(!tags.some((l) => /degree/i.test(l)), [...new Set(tags)].join(' | '));
});

// Grading the final pages (October 2026): the optimized page read lower than
// the untailored one for three good fits. Two bank bullets told one $9M result,
// so one was left out with the page's only "collaborating" and "AWS
// Marketplace": the optimizer can't merge them, so it says so. And the posting
// phrases it checked included "first point", "enough technical depth" and
// "respective products", which no recruiter searches for.
test('the optimizer says when a left-out repeat costs ATS, and which bullets to merge', () => {
  const opt = B.optimizeResume({ profile, bank: bank(), job: P.awsSapAlliances });
  assert.ok(opt.notes.some((n) => /^Left out “Executed \$9M.*same result as “Led quarterly business reviews.*Merging the two/.test(n)), opt.notes.join('\n'));
});

test('posting phrases checked are search terms, not fragments', () => {
  const { atsScore } = require('../src/main/atsScore');
  for (const job of [P.salesforcePubSecCI, P.evenupCI, P.awsSapAlliances, P.ctoChiefOfStaff]) {
    const { missingKeywords } = atsScore(job, RESUME.text, { profile });
    for (const junk of ['first point', 'enough technical depth', 'broader legal', 'respective products', 'enables engagement', 'business background', 'recommend actions', 'advice', 'gaps', 'topics', 'record', 'basic']) assert.ok(!missingKeywords.includes(junk), `${job.title}: ${missingKeywords.join(' | ')}`);
  }
});

test('the public sector draft names the deals it influenced, with the bank merged too', () => {
  const b = bank();
  const find = (re) => b.bullets.find((x) => re.test(x.text));
  find(/^Led quarterly/).text = 'Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), collaborating with marketing, sales, and product teams to drive $9M+ in customer transactions via AWS Marketplace';
  find(/^Built analytical/).text = 'Built analytical reports and Excel- and SQL-driven dashboards, translating technical concepts into executive-ready insights through business review presentations for senior leadership';
  b.bullets = b.bullets.filter((x) => !/^(?:Executed \$9M|Translated technical)/.test(x.text));
  const asks = resumeEnhancements({ job: P.salesforcePubSecCI, bank: b, profile, documents: [RESUME, IMPACT], fit: 79 });
  assert.match((asks.find((a) => a.draft && /pitches/.test(a.draft)) || {}).draft || '', /Army, Navy and DARPA/);
});

// Every saved live posting, in the band it belongs in for this candidate
// (shown scale: Excellent 90+, Strong 80+, Good potential 65+, else Stretch).
// Judged as a recruiter would: their own lane is Excellent or Strong, a step
// up or an adjacent lane is Good potential or better (people often move up a
// level when they change jobs), and twelve years asked of seven is a stretch.
const BANDS = {
  kickboardCI: [90, 100], workivaAlliance: [90, 100], zendeskAlliance: [80, 100], googlePublicSector: [80, 100],
  openaiPartnerMarketing: [65, 89], alignCorpDev: [65, 89], weyerhaeuserMarketIntel: [65, 89], ctoChiefOfStaff: [45, 64],
  salesforcePubSecCI: [65, 100], evenupCI: [65, 100], mark43SeniorCI: [80, 100], cyeraOctoStrategyOps: [80, 100], awsSapAlliances: [80, 100],
};
test('every saved live posting lands in its band', () => {
  assert.deepEqual(Object.keys(BANDS).sort(), Object.keys(P).sort(), 'a new posting in the fixture needs a band here');
  const off = Object.entries(BANDS).map(([k, [lo, hi]]) => [k, fit(P[k]).score, lo, hi]).filter(([, s, lo, hi]) => s < lo || s > hi);
  assert.deepEqual(off, [], off.map(([k, s, lo, hi]) => `${k}: ${s} (expected ${lo}-${hi})`).join('; '));
});
