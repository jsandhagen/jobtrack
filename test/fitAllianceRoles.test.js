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
