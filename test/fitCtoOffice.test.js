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

// ---------- held out (fixtures/ctoOfficeHoldout.js) ----------
// First pass, before the fixes they prompted: 10 of 16 bands, 5 of 7
// orderings; a sales-analytics manager role read as a strong fit (74, "you
// meet all 3 must-haves") while an applied-AI strategy role read 56; the
// LinkedIn PDF export lost the employer and the current role's description.
const H = require('./fixtures/ctoOfficeHoldout');
const hfit = (p, text = F.RESUMES.ctoOfficeStrategist) => localFitScore(H.POSTINGS[p], [{ kind: 'resume', text }], F.PROFILE);

test('held out: nearly every band met, none far off, and the order holds', () => {
  const wrong = [];
  for (const [p, lo, hi, why] of H.BANDS) {
    const v = hfit(p).score;
    if (v < lo - 15 || v > hi + 15) assert.fail(`${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${p}: ${v}`);
  }
  assert.ok(wrong.length <= 4, wrong.join('; '));
  const order = H.ORDER.filter(([a, b]) => !(hfit(a).score > hfit(b).score));
  assert.ok(order.length <= 1, order.map((x) => x.join(' ')).join('; '));
});

test('held out: "analytics" experience is data work, and "SQL and Tableau or Power BI" is two requirements', () => {
  const f = hfit('salesIntelAIStrategy');
  assert.ok(f.score < 50, `${f.score} ${f.headline}`);
  assert.ok(f.missingSkills.some((s) => /analytics/.test(s)), JSON.stringify(f.missingSkills));
  const { requirementUnits } = require('../src/main/localFit');
  const labels = (line) => requirementUnits({ title: 'Analyst', text: `Requirements\n- ${line}` }).units.map((u) => u.label);
  assert.deepEqual(labels('Expert SQL and Tableau or Power BI').sort(), ['SQL', 'one of Tableau, Power BI']);
  assert.deepEqual(labels('Python or SAS, and SQL').sort(), ['SQL', 'one of Python, SAS']);
  assert.deepEqual(labels('Python, R and SAS or similar tools'), ['one of Python, R, SAS']);
  // A large language model is generative AI; "technology roles" is the kind of experience again.
  const ai = hfit('appliedAIStrategyOps');
  assert.ok(ai.score >= 70 && !ai.missingSkills.some((s) => /language models|technology roles/.test(s)), `${ai.score} ${JSON.stringify(ai.missingSkills)}`);
});

test('held out: the same person as a LinkedIn PDF export or a two-line layout parses to the same roles', () => {
  const roles = (text) => parseResume(text).experiences.map((e) => [e.title, e.organization.replace(/ Corporation| Consulting LLP| Consulting$/, ''), e.bullets.length > 0]);
  const want = [
    ['Technology Strategy Consultant, Office of the CTO', 'Appian', true],
    ['Technology Strategy Engineer, Office of the CTO', 'Appian', true],
    ['Analyst, Technology Strategy & Transformation', 'Deloitte', true],
  ];
  assert.deepEqual(roles(H.RESUMES.ctoOfficeLinkedInPdf), want);
  assert.deepEqual(roles(H.RESUMES.ctoOfficeTwoLine), want);
  const li = parseResume(H.RESUMES.ctoOfficeLinkedInPdf);
  assert.equal(li.experiences[0].location, 'McLean, Virginia, United States');
  assert.ok(li.experiences[0].bullets.length >= 5, 'a LinkedIn description becomes one bullet per sentence');
  assert.deepEqual(li.skills, ['Technology Strategy', 'Competitive Analysis', 'Generative AI']);
  assert.deepEqual(parseResume(H.RESUMES.ctoOfficeTwoLine).education.map((e) => [e.school, e.degree]), [['University of Virginia', 'B.S. Systems Engineering']]);
  for (const [p, tol] of H.FORMAT) {
    const main = hfit(p).score;
    // The LinkedIn export has no full skills list, so a role that asks for listed skills may read lower.
    assert.ok(Math.abs(hfit(p, H.RESUMES.ctoOfficeTwoLine).score - main) <= tol, `two-line ${p}`);
    assert.ok(Math.abs(hfit(p, H.RESUMES.ctoOfficeLinkedInPdf).score - main) <= (p === 'bizOpsEngineering' ? 15 : tol), `LinkedIn ${p}`);
  }
});
