const test = require('node:test');
const assert = require('node:assert');
const { localFitScore, extractTerms, titleLevel, workMode, postingSalaryMax } = require('../src/main/localFit');
const { CANDIDATES, POSTINGS, CASES, ORDERINGS } = require('./fixtures/fitCases');

const score = (c, p) => localFitScore(POSTINGS[p], CANDIDATES[c].documents, CANDIDATES[c].profile);

test('offline fit lands every benchmark case in the expected band', () => {
  const misses = [];
  for (const [c, p, band] of CASES) {
    const r = score(c, p);
    const ok =
      band === 'strong' ? r.score >= 65 : band === 'possible' ? r.score >= 40 && r.score <= 72 : band === 'weak' ? r.score < 45 : r.dealbreakers.length > 0 && r.score <= 30;
    if (!ok) misses.push(`${c}/${p}: expected ${band}, got ${r.score}`);
  }
  assert.deepEqual(misses, []);
});

test('offline fit ranks better matches above worse ones', () => {
  for (const [c, better, worse] of ORDERINGS) {
    assert.ok(score(c, better).score > score(c, worse).score, `${c}: ${better} should beat ${worse}`);
  }
});

test('non-dictionary requirements are discovered (certifications, tools, phrases)', () => {
  const r = score('nurse', 'icuRN');
  assert.ok(r.matchedSkills.includes('BLS') && r.matchedSkills.includes('ACLS'));
  assert.ok(r.missingSkills.includes('CCRN'));
  assert.ok(r.missingSkills.includes('ventilator management'));
  assert.deepEqual(extractTerms('- Current RN license', new Set()), ['RN']);
  assert.ok(extractTerms('- Experience with Epic and Cerner', new Set()).includes('Cerner'));
});

test('dealbreakers: pay, work mode and avoided words', () => {
  assert.equal(postingSalaryMax('Pay: $60,000 - $75,000'), 75000);
  assert.equal(postingSalaryMax('$30 - $40 per hour'), 83200);
  assert.equal(workMode('Frontend Engineer (Remote)'), 'remote');
  assert.equal(workMode('3 days in-office'), 'onsite');
  const r = score('frontend', 'clearance');
  assert.equal(r.label, 'Dealbreaker');
  assert.ok(r.dealbreakers.some((d) => /security clearance/.test(d)));
});

test('seniority is judged only when the title states a level', () => {
  assert.equal(titleLevel('Principal Frontend Architect'), 4);
  assert.equal(titleLevel('Registered Nurse'), null);
  assert.equal(score('nurse', 'telemetryRN').components.seniority, null);
  assert.ok(score('frontend', 'staffFrontend').concerns.some((c) => /years/.test(c)));
});

test('no documents means no score, and confidence reflects what was recognised', () => {
  assert.equal(localFitScore(POSTINGS.seniorFrontend, [], {}).score, 0);
  assert.equal(score('frontend', 'seniorFrontend').confidence, 'high');
  const vague = localFitScore({ title: 'Team Member', text: 'Join our friendly team! Great culture.' }, CANDIDATES.frontend.documents, {});
  assert.equal(vague.confidence, 'low');
});

test('example-language lists, "accounting for", curly apostrophes and EEO text are not required qualifications', () => {
  const job = {
    title: 'Quantitative Analytics Senior',
    company: 'Freddie Mac',
    text: `Your Impact:
Design and code counterparty credit risk models.
These models must incorporate best practices while simultaneously accounting for the unique risks of each institution.
Qualifications:
PhD in economics, finance, statistics, or a related quantitative discipline, or Master’s degree with 3+ years of relevant experience.
Programming languages may include--but are not limited to--Python, R, SQL, and MATLAB.
Strong Programming skills is a must! Python and SQL are most frequently used; other useful languages and software available in the company include Java, SAS, MATLAB, C.
A safe and secure environment is critical. Employees adhere to privacy & security obligations as required via training programs and our acceptable use policy.`,
  };
  const resume = `Quantitative Risk Analyst  June 2022-Current
Built credit risk models in Python, SQL and Snowflake.
EDUCATION
Masters of Economics, May 2022`;
  const r = localFitScore(job, [{ kind: 'resume', text: resume }]);
  assert.deepEqual(r.missingSkills, []);
  assert.deepEqual(r.missingPreferred, ['one of Java, SAS, MATLAB']);
  assert.ok(!r.matchedSkills.includes('Accounting') && !r.missingSkills.includes('Accounting'));
  assert.ok(r.matchedSkills.includes('Programming'));
});

test('"X, Y, or Z" is one requirement that any one of them meets; "X and Y" stays two', () => {
  const job = { title: 'Data Analyst', company: 'Acme', text: 'Requirements\n- Experience with Python, R, or Java\n- SQL and Excel' };
  const r = localFitScore(job, [{ kind: 'resume', text: 'Analyst 2019-2024. Python, SQL.' }]);
  assert.ok(r.matchedSkills.includes('one of Python, Java'));
  assert.deepEqual(r.missingSkills, ['Excel']);
});
