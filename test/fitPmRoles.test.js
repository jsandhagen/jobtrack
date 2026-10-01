// Product, project and program managers (fixtures/pmRoles.js).
//
// First pass: 12 of 21 bands, 5 of 5 orderings. A product manager read as an
// excellent fit (92) for a Group PM role that manages PMs, and strong (79) for
// product marketing, because "launched it with sales and marketing" counted as
// marketing experience; "8+ years of progressive experience managing IT
// projects" became the gap "experience in progressive"; "Certified ScrumMaster
// (CSM) or PSM" ignored the CSM they hold; and the free summary claimed "sales"
// and "marketing" for the product manager. People management ("2+ years
// managing product managers") wasn't read as a requirement at all.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore, requirementUnits } = require('../src/main/localFit');
const { titleMatches } = require('../src/main/careers');
const B = require('../src/main/bullets');
const X = require('./fixtures/pmRoles');

const fit = (r, p) => localFitScore(X.POSTINGS[p], [{ kind: 'resume', text: X.RESUMES[r] }], X.PROFILES[r]);

test('PM roles: nearly every band met, none far off, and the right person wins each posting', () => {
  const wrong = [];
  for (const [r, p, lo, hi, why] of X.BANDS) {
    const v = fit(r, p).score;
    if (v < lo - 16 || v > hi + 16) assert.fail(`${r} → ${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v}`);
  }
  assert.ok(wrong.length <= 7, wrong.join('; '));
  for (const [p, a, b] of X.ORDER) assert.ok(fit(a, p).score > fit(b, p).score, `${p}: ${a} over ${b}`);
});

test('managing people is a requirement, met only by managing people', () => {
  const labels = (line) => requirementUnits({ title: 'Manager', text: `Qualifications\n- ${line}` }).units.map((u) => u.label);
  assert.deepEqual(labels('2+ years of experience managing product managers'), ['experience managing product managers']);
  assert.deepEqual(labels('8+ years of progressive experience managing IT projects'), ['experience in it project management']);
  assert.match(fit('productManager', 'groupPM').headline, /managing product managers/);
  assert.ok(fit('productManager', 'groupPM').score < 70);
  assert.match(fit('projectManager', 'pmoDirector').headline, /managing project managers/);
  assert.ok(fit('projectManager', 'itProjectManager').score >= 90);
});

test('the teams you worked with are not work you did', () => {
  const f = fit('productManager', 'productMarketing');
  assert.ok(f.score < 60 && !f.matchedSkills.includes('Marketing'), `${f.score} ${f.matchedSkills}`);
  assert.ok(!titleMatches('Senior Product Marketing Manager', ['Product Manager']));
  assert.ok(!titleMatches('Product Operations Manager', ['Product Manager']));
  assert.ok(titleMatches('Senior Product Manager, Marketing Platforms', ['Product Manager']));
  assert.ok(titleMatches('Senior Manager, Sales Operations & Strategy', ['Operations Manager']));
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(X.RESUMES.productManager), { id: 'r', name: 'R' }).bank;
  assert.doesNotMatch(B.atsSummary(X.POSTINGS.seniorPMSaaS, bank), /sales|marketing/i);
  assert.ok(!B.pickSkills(X.POSTINGS.seniorPMSaaS, bank).all.some((s) => /^(sales|marketing)$/i.test(s)));
});

test('"Certified ScrumMaster (CSM) or PSM" is met by a CSM', () => {
  const units = requirementUnits(X.POSTINGS.scrumMaster).units.map((u) => u.label);
  assert.ok(units.includes('one of CSM, PSM'), units.join(' | '));
  assert.ok(!/PSM/.test(fit('projectManager', 'scrumMaster').headline));
});

test('PM summaries name skills and fields, never job titles, audiences or verb phrases', () => {
  for (const r of Object.keys(X.RESUMES)) {
    const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(X.RESUMES[r]), { id: 'r', name: 'R' }).bank;
    for (const p of Object.keys(X.POSTINGS)) {
      const s = B.atsSummary(X.POSTINGS[p], bank);
      const items = s.includes('Experience includes ') ? s.replace(/^.*Experience includes /, '').replace(/\.$/, '').split(/, | and /) : [];
      for (const it of items) assert.doesNotMatch(it, /(?:manager|engineer|owner|program|leaders|stakeholders)$|^(?:analyze|run|lead)\b/i, `${r} → ${p}: ${s}`);
      assert.doesNotMatch(s, /years in (?:product manager|software engineer|technical program)\b/, `${r} → ${p}: ${s}`);
    }
  }
});
