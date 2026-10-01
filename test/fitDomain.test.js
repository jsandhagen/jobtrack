// The fit score on full-length postings, which have enough distinctive wording
// for the domain signal: the same field scores high, a neighbouring field in
// between, unrelated fields low.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const LP = require('./fixtures/longPostings');
const { CANDIDATES } = require('./fixtures/fitCases');

const QUANT = [
  {
    kind: 'resume',
    text: `Priya Shah
priya@example.com · (555) 444-1212 · Arlington, VA

Experience
Credit Risk Analyst, Allegiant Mortgage, Jul 2021 – Present
- Built probability of default scorecards for a $9B mortgage portfolio using logistic regression in Python and SQL
- Ran quarterly performance monitoring of credit models and answered model validation findings
- Analyzed loan-level data to flag underwriting and borrower credit risk trends for credit policy
- Developed loss forecasting models used in CECL reserve estimates

Education
M.A. Economics, George Mason University, 2021
Coursework: Econometrics, Time Series, Statistical Learning

Skills
Python, SQL, SAS, Econometrics, Credit Risk Modeling`,
  },
];

const score = (posting, docs) => localFitScore(posting, docs).score;

test('a credit risk modeler: same field high, neighbouring field in between, unrelated low', () => {
  assert.ok(score(LP.CREDIT_RISK, QUANT) >= 80, `credit risk ${score(LP.CREDIT_RISK, QUANT)}`);
  const ds = score(LP.DATA_SCIENTIST, QUANT);
  assert.ok(ds >= 40 && ds < score(LP.CREDIT_RISK, QUANT), `data science ${ds}`);
  for (const k of ['BACKEND', 'ICU_NURSE', 'MARKETING']) assert.ok(score(LP[k], QUANT) <= 30, `${k} ${score(LP[k], QUANT)}`);
});

test('the domain signal separates fields on full-length postings', () => {
  const domain = (posting, docs) => localFitScore(posting, docs).components.domain;
  assert.ok(domain(LP.ICU_NURSE, CANDIDATES.nurse.documents) >= 80);
  assert.ok(domain(LP.CREDIT_RISK, QUANT) >= 80);
  for (const k of ['CREDIT_RISK', 'DATA_SCIENTIST', 'MARKETING']) assert.ok(domain(LP[k], CANDIDATES.nurse.documents) <= 10, k);
  for (const k of ['ICU_NURSE', 'MARKETING']) assert.ok(domain(LP[k], QUANT) <= 10, k);
});

test('a nurse fits the ICU posting and nothing else here', () => {
  assert.ok(score(LP.ICU_NURSE, CANDIDATES.nurse.documents) >= 60);
  for (const k of ['CREDIT_RISK', 'DATA_SCIENTIST', 'BACKEND', 'MARKETING']) assert.ok(score(LP[k], CANDIDATES.nurse.documents) <= 30, k);
});
