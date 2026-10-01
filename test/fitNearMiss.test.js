// Near-miss postings across fields (fixtures/nearMisses.js): jobs that share a
// candidate's vocabulary but are a different job, plus the generic rules that
// keep them down: the kind of experience asked for, and requirement lines
// that only look like benefits boilerplate.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore, requirementUnits } = require('../src/main/localFit');
const F = require('./fixtures/fitCases');
const T = require('./fixtures/techPostings');
const N = require('./fixtures/nearMisses');

const CANDIDATES = { ...F.CANDIDATES };
for (const [k, text] of Object.entries(T.RESUMES)) CANDIDATES[k] = { documents: [{ kind: 'resume', text }], profile: {} };
const fit = (c, posting) => localFitScore(posting, CANDIDATES[c].documents, CANDIDATES[c].profile);
const labels = (posting) => requirementUnits(posting).units.map((u) => `${u.kind}: ${u.label}`);

test('near-miss postings stay below a good match', () => {
  const wrong = [];
  for (const [c, p, lo, hi, why] of N.BANDS) {
    const v = fit(c, N.POSTINGS[p]).score;
    if (v < lo || v > hi) wrong.push(`${c} → ${p}: ${v} not in [${lo}, ${hi}] (${why})`);
  }
  assert.deepEqual(wrong, []);
});

test('the kind of experience the years are in is a requirement', () => {
  const r = fit('softwareEngineer', N.POSTINGS.solutionsEngineerSales);
  assert.ok(r.missingSkills.some((s) => /sales engineering/.test(s)), r.missingSkills.join(', '));
  assert.ok(labels(N.POSTINGS.nurseRecruiter).includes('required: experience in healthcare recruiting'));
  // Examples are alternatives, not an optional list; a trailing "ideally …" doesn't make it optional.
  assert.ok(labels(N.POSTINGS.frontendSales).includes('required: experience in saas sales'), labels(N.POSTINGS.frontendSales).join(' | '));
  // "0-2 years of experience" names no kind.
  const plain = { title: 'Analyst', company: 'Acme', text: 'Requirements\n- 0-2 years of experience\n- Excel' };
  assert.ok(!labels(plain).some((l) => /experience in/.test(l)), labels(plain).join(' | '));
});

test('a held title in the same word family meets it: analyst / analysis, consultant / consulting', () => {
  const posting = { title: 'Analyst', company: 'Acme', text: 'Requirements\n- 3+ years of experience in data analysis\n- 2+ years in technology consulting\n- Excel' };
  const resume = 'Data Analyst, Northwind, 2019 – Present\n- Built Excel models\nConsultant, Technology Advisory, Brightpath, 2016 – 2019\n- Advised clients';
  const r = localFitScore(posting, [{ kind: 'resume', text: resume }]);
  for (const s of ['experience in data analysis', 'experience in technology consulting']) assert.ok(r.matchedSkills.includes(s), `${s}: ${r.matchedSkills.join(', ')}`);
});

test('insurance, compensation and benefits are requirements in jobs about them, not in perks', () => {
  const posting = {
    title: 'Claims Adjuster',
    company: 'Harbor Mutual',
    text: `Responsibilities
- Investigate and adjust property insurance claims
- Negotiate settlements with policyholders

Requirements
- 2+ years of insurance claims experience
- Knowledge of compensation and benefits for workers' comp claims
- Xactimate

Benefits
- Medical, dental and vision insurance
- 401(k) match`,
  };
  const l = labels(posting).join(' | ');
  assert.ok(/experience in insurance claims/.test(l), l);
  assert.ok(/Xactimate/.test(l), l);
  assert.ok(!/dental|vision|401/i.test(l), l);
});
