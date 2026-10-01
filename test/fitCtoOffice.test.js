// One person's search end to end (fixtures/ctoOfficePersona.js): a technology
// strategy consultant in a software vendor's Office of the CTO, ex-Big 4,
// against the jobs they'd look at next and the near misses around them.
//
// First pass, before the changes this persona prompted: 10 of 20 bands, 6 of 8
// orderings. Every in-house role one step up ("Manager, Strategy & Operations,
// Office of the CTO", "Senior Manager, Product Strategy / Competitive
// Intelligence / Technology Partnerships") was capped as a stretch at 44 or
// less: "CTO" in a title read as an executive role, and "Senior Manager" as a
// director whatever the years asked. The resume parser also lost the employer
// ("Consultant, Office of the CTO, Appian" read Office of the CTO as the company).
// The misses left are within a few points of their band.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore, titleLevel } = require('../src/main/localFit');
const { parseResume } = require('../src/main/bullets');
const F = require('./fixtures/ctoOfficePersona');

const fit = (r, p) => localFitScore(F.POSTINGS[p], [{ kind: 'resume', text: F.RESUMES[r] }], F.PROFILE);

test('CTO-office strategist: nearly every band met, none far off', () => {
  const wrong = [];
  for (const [r, p, lo, hi, why] of F.BANDS) {
    const v = fit(r, p).score;
    if (v < lo - 15 || v > hi + 15) assert.fail(`${r} → ${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v}`);
  }
  assert.ok(wrong.length <= 7, `${wrong.length} of ${F.BANDS.length} outside their band: ${wrong.join('; ')}`);
});

test('CTO-office strategist: their list ranks the way they would rank it', () => {
  const wrong = F.RANKS.filter(([r, a, b]) => !(fit(r, a).score > fit(r, b).score));
  assert.ok(wrong.length <= 1, wrong.map((x) => x.join(' ')).join('; '));
});

test('CTO-office strategist: one step up is not a stretch, and the near misses stay below "Good potential"', () => {
  for (const p of ['octoStrategyOps', 'productStrategyAI', 'competitiveIntel', 'techPartnerships']) {
    const f = fit('ctoOfficeStrategist', p);
    assert.ok(f.score >= 60 && !/stretch/i.test(f.label), `${p}: ${f.score} ${f.label} — ${f.headline}`);
  }
  for (const p of ['aiStrategyDirector', 'productTechStrategyGVP', 'fieldCTO']) assert.match(fit('ctoOfficeStrategist', p).label, /stretch/i, p);
  for (const p of ['appianDeveloper', 'pegaArchitect', 'solutionsConsultant', 'enterpriseAE', 'backendEngineer', 'productMarketing']) {
    const f = fit('ctoOfficeStrategist', p);
    assert.ok(f.score < 45, `${p}: ${f.score} — ${f.headline}`);
  }
  assert.match(fit('ctoOfficeStrategist', 'solutionsConsultant').headline, /sales job/);
});

test('who a team serves is not its level; manager ranks follow the years asked', () => {
  assert.equal(titleLevel('Manager, Strategy & Operations, Office of the CTO'), 4);
  assert.equal(titleLevel('Strategy Analyst, Office of the Chief Technology Officer'), null);
  assert.equal(titleLevel('Operations Manager, reporting to the CEO'), 4);
  assert.equal(titleLevel('CTO'), 6);
  assert.equal(fit('ctoOfficeStrategist', 'productStrategyAI').postingLevel, 'staff/lead', 'a Senior Manager asking for 6+ years');
  assert.equal(fit('ctoOfficeStrategist', 'aiStrategyDirector').postingLevel, 'director');
});

test('a role line with a team before the employer keeps the employer', () => {
  const ex = parseResume(F.RESUMES.ctoOfficeStrategist).experiences;
  assert.deepEqual(
    ex.map((e) => [e.title, e.organization]),
    [
      ['Technology Strategy Consultant, Office of the CTO', 'Appian'],
      ['Technology Strategy Engineer, Office of the CTO', 'Appian'],
      ['Analyst, Technology Strategy & Transformation', 'Deloitte Consulting'],
    ],
  );
  const one = (line) => parseResume(`Experience\n${line}\n- Did a thing`).experiences[0];
  assert.deepEqual([one('Senior Engineer, Bloom Labs, Portland, OR, Jan 2020 – Present').organization, one('Senior Engineer, Bloom Labs, Portland, OR, Jan 2020 – Present').location], ['Bloom Labs', 'Portland, OR']);
  assert.equal(one('Consultant, Deloitte Consulting, Arlington, Jan 2020 – Present').organization, 'Deloitte Consulting', 'a company name is not a team');
  assert.equal(one('Product Manager, Ledgerline, Mar 2021 – Present').organization, 'Ledgerline');
});

test('working at a software vendor is enterprise software experience; using its product is not', () => {
  const posting = { title: 'Strategy Manager', text: 'Requirements\n- 5+ years of experience in strategy\n- Experience in enterprise software or SaaS\n- Bachelor\'s degree' };
  const vendor = localFitScore(posting, [{ kind: 'resume', text: 'Experience\nStrategy Manager, Appian, Jul 2020 – Present\n- Led strategy work for the CTO\nEducation\nB.A. Economics, 2015' }]);
  const user = localFitScore(posting, [{ kind: 'resume', text: 'Experience\nStrategy Manager, Acme Retail, Jul 2020 – Present\n- Led strategy work; managed vendors including Appian and Salesforce\nEducation\nB.A. Economics, 2015' }]);
  assert.ok(!vendor.missingSkills.some((s) => /enterprise software/i.test(s)), JSON.stringify(vendor.missingSkills));
  assert.ok(user.missingSkills.some((s) => /enterprise software/i.test(s)), JSON.stringify(user.missingSkills));
});
