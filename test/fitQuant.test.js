// Quantitative analyst roles in depth (fixtures/quantPostings.js) and
// near-miss postings that share the vocabulary but are a different job
// (fixtures/quantNearMiss.js).
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const T = require('./fixtures/techPostings');
const Q = require('./fixtures/quantPostings');
const N = require('./fixtures/quantNearMiss');

const POSTINGS = { ...Q.POSTINGS, ...N.POSTINGS };
const RESUMES = { ...T.RESUMES, ...Q.RESUMES };
const fit = (resume, posting) => localFitScore(POSTINGS[posting], [{ kind: 'resume', text: RESUMES[resume] }]);

for (const [name, set] of [['quant roles', Q], ['quant near-miss postings', N]]) {
  test(`${name}: scores land in the expected ranges`, () => {
    const wrong = [];
    for (const [r, p, lo, hi, why] of set.BANDS) {
      const v = fit(r, p).score;
      if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v} not in [${lo}, ${hi}] (${why})`);
    }
    assert.deepEqual(wrong, []);
  });
  test(`${name}: the right candidate wins each posting`, () => {
    const wrong = [];
    for (const [p, a, b, why] of set.ORDER) {
      const x = fit(a, p).score;
      const y = fit(b, p).score;
      if (!(x > y)) wrong.push(`${p}: ${a} ${x} vs ${b} ${y} (${why})`);
    }
    assert.deepEqual(wrong, []);
  });
}

test('the headline says the one thing that decides it', () => {
  const T2 = require('./fixtures/techStrategyNearMiss');
  const D = require('./fixtures/techStrategyDeep');
  const h = (resume, posting) => localFitScore({ ...POSTINGS, ...T2.POSTINGS, ...D.POSTINGS }[posting], [{ kind: 'resume', text: { ...RESUMES, ...D.RESUMES }[resume] }]).headline;
  assert.match(h('quantResearcherPhD', 'quantResearcher'), /^You meet all \d+ must-haves and have done this kind of role\.$/);
  assert.match(h('quantResearcherPhD', 'entryQuantAnalyst'), /overqualified/);
  assert.match(h('quantResearcherPhD', 'headOfQuantResearch'), /^A stretch: this is a director-level role.*12\+ years/);
  assert.match(h('techStrategyConsultant', 'presalesConsultant'), /sales job/);
  assert.match(h('techStrategyConsultant', 'workdayConsultant'), /^The title names Workday,/);
  assert.match(h('dataScientist', 'creditRiskModeler'), /^You show \d+ of \d+ must-haves; the gap is experience in credit risk modeling/);
  assert.match(h('fpaAnalyst', 'quantResearcher'), /^This role needs .*which your documents don't show\.$/);
  // A dealbreaker comes first.
  const r = localFitScore(POSTINGS.derivativesQuant, [{ kind: 'resume', text: RESUMES.mfeNewGrad }], { minSalary: '250000' });
  assert.match(r.headline, /^Dealbreaker: pay tops out/);
  // No documents, no headline.
  assert.equal(localFitScore(POSTINGS.quantResearcher, []).headline, '');
});

test('degree fields: a quantitative field is asked for and checked', () => {
  const { fieldsAsked, degreeCredit } = require('../src/main/degreeFields');
  const ask = fieldsAsked("PhD or Master's degree in mathematics, statistics, physics, computer science, or another quantitative field");
  assert.deepEqual(ask.families, ['quantitative']);
  assert.equal(degreeCredit('PhD Physics, Columbia University, 2021', 3, ask), 1);
  assert.equal(degreeCredit('Master of Financial Engineering, Baruch College, 2025', 3, ask), 1);
  assert.equal(degreeCredit('MBA, Georgetown University, 2020', 3, ask), 0.5, 'the level, in another field');
  assert.equal(degreeCredit('B.S. Mathematics, State University, 2019', 3, ask), 0.4, 'the field, a level lower');
  assert.equal(degreeCredit('B.S. Mathematics, 2016\nMBA, 2020', 3, ask), 0.75, 'the level and the field in two degrees');
  // "Information systems, business or a related field": economics is related to business.
  const rel = fieldsAsked("Bachelor's degree in information systems, business or a related field");
  assert.equal(degreeCredit('B.A. Economics, Duke University, 2019', 2, rel), 0.8);
  assert.equal(degreeCredit('B.A. English, Duke University, 2019', 2, rel), 0.5);
  assert.equal(fieldsAsked("Bachelor's degree required"), null);
});

test('titles: the same role noun in a different function is a different job', () => {
  const { titleSimilarity } = require('../src/main/localFit');
  assert.ok(titleSimilarity('Sales Engineer', 'Software Engineer') < 0.4);
  assert.ok(titleSimilarity('Quantitative Analyst', 'Data Analyst') < 0.4);
  assert.ok(titleSimilarity('Construction Project Manager', 'IT Project Manager') <= 0.5);
  assert.ok(titleSimilarity('Investment Banking Analyst, M&A', { title: 'Quantitative Analyst Intern', org: 'Ashcroft Bank' }) < 0.4, "the employer's name doesn't make you a banker");
  assert.ok(titleSimilarity('Quantitative Researcher, Systematic Equities', 'Quantitative Researcher') >= 0.75, 'the desk after the comma counts less');
  assert.ok(titleSimilarity('Quantitative Developer, C++', { title: 'Senior Software Engineer', org: 'Trading Systems' }) >= 0.7, 'a team name is part of the title');
  assert.equal(titleSimilarity('Quantitative Analyst, Entry Level', 'Quantitative Analyst Intern'), 1);
});

test('requirements are phrases a resume can show, not filler', () => {
  const { extractTerms, requirementUnits } = require('../src/main/localFit');
  const terms = (l) => extractTerms(l, new Set());
  const labels = (l) => requirementUnits({ title: 'Analyst', company: 'Acme', text: `Requirements\n${l}` }).units.map((u) => u.label).sort();
  assert.deepEqual(labels('- Strong foundation in probability, statistics and time series analysis'), ['Probability', 'Statistics', 'Time Series']);
  assert.deepEqual(labels('- Experience with machine learning methods and rigorous out-of-sample testing'), ['Backtesting', 'Machine Learning']);
  assert.deepEqual(labels('- Knowledge of SR 11-7 and regulatory expectations'), ['Model Validation']);
  assert.deepEqual(terms('- FINRA Series 7 and 63 licenses'), []);
  assert.deepEqual(terms('- Experience with machine learning and walk-forward evaluation'), []);
  assert.deepEqual(terms('- Experience working with designers and product teams'), []);
  assert.deepEqual(terms('- Strong attention to detail'), []);
  assert.deepEqual(terms('- JavaScript/TypeScript, React on the frontend'), ['frontend']);
});

test('internships and research assistant jobs count half toward years', () => {
  const { yearsOfExperience } = require('../src/main/fitScore');
  const now = new Date('2026-01-01');
  assert.equal(yearsOfExperience('Analyst, Acme, Jan 2024 – Jan 2026', now), 2);
  assert.equal(yearsOfExperience('Quantitative Analyst Intern, Acme, Jan 2024 – Jan 2026', now), 1);
  assert.equal(yearsOfExperience('Research Assistant, Dept. of Mathematics, Jan 2024 – Jan 2026\nAnalyst, Acme, Jan 2025 – Jan 2026', now), 2);
});

test('a sales job under another title is flagged when you have not sold', () => {
  const posting = {
    title: 'Strategic Advisor, Digital Transformation',
    company: 'Nimbus Cloud',
    text: `Responsibilities
- Build relationships with CIOs at 40 named enterprise accounts
- Run discovery workshops and build business cases for cloud migration
- Own a pipeline and close new business to exceed an annual quota of $2M

Requirements
- 5+ years of experience in technology consulting or enterprise software sales
- Bachelor's degree`,
  };
  const r = localFitScore(posting, [{ kind: 'resume', text: RESUMES.techStrategyConsultant }]);
  assert.ok(r.score <= 40, `score ${r.score}`);
  assert.match(r.concerns[0], /sales role/);
  const D = require('./fixtures/techStrategyDeep');
  // Someone who has sold consulting work isn't flagged.
  assert.ok(!localFitScore(posting, [{ kind: 'resume', text: D.RESUMES.techStrategyManager }]).concerns.some((c) => /sales role/.test(c)));
});
