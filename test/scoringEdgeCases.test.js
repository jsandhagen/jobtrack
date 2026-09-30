// Edge cases found by probing the offline fit and ATS scorers with common
// posting and resume phrasings.
const test = require('node:test');
const assert = require('node:assert');
const { findSkills, requiredYears, yearsOfExperience, classifyLines } = require('../src/main/fitScore');
const { degreeRequirements, degreeLevel, atsScore, hiredScoreStyleGrade } = require('../src/main/atsScore');
const { localFitScore, titleLevel, workMode, postingSalaryMax } = require('../src/main/localFit');

const NOW = new Date('2026-09-30');

test('requiredYears reads the experience ask, not ages, company history or degree lengths', () => {
  const cases = [
    ['3-5 years of experience', 3],
    ['3 to 5 years of experience', 3],
    ['five years of experience', 5],
    ['minimum of two years', 2],
    ['Ten (10) years of experience', 10],
    ['2+ yrs experience', 2],
    ['Must be 18 years or older. 5+ years experience', 5],
    ['We have been in business for 25 years. 3+ years of experience required', 3],
    ['5+ years preferred; 3 years required', 3],
    ['4-year degree required', null],
  ];
  for (const [text, want] of cases) assert.equal(requiredYears(text), want, text);
});

test('yearsOfExperience unions work date ranges and ignores school dates', () => {
  const cases = [
    ['Analyst 06/2020 - 08/2022', 2.2],
    ['Analyst Mar 2018 to Dec 2019', 1.8],
    ['Analyst 2019 - 2021\nEDUCATION\nState University 2014 - 2018', 2],
    ['Analyst June 2022-Current\nMasters of Economics May 2022', 4.3],
    ['Engineer 2010 - 2012\nEngineer 2020 - Present', 8.7], // a gap, not 16 years
    ['Analyst Jan 2019 – Dec 2020\nAnalyst Mar 2020 – Dec 2020', 1.9], // overlap counted once
    ['Worked 2015-16 at Acme', 1],
  ];
  for (const [text, want] of cases) assert.equal(yearsOfExperience(text, NOW), want, text);
});

test('degree requirements: abbreviations, clause-level "a plus", generic "degree in"', () => {
  const req = (s) => degreeRequirements('Requirements\n' + s);
  assert.deepEqual(req('BS in Computer Science or related field'), { required: 2, preferred: null });
  assert.deepEqual(req('BS/MS in Statistics'), { required: 2, preferred: null });
  assert.deepEqual(req("Bachelor's degree required; Master's a plus"), { required: 2, preferred: 3 });
  assert.deepEqual(req('Advanced degree (MS or PhD) preferred'), { required: null, preferred: 3 });
  assert.deepEqual(req('Degree in accounting'), { required: 2, preferred: null });
  assert.deepEqual(req('Scrum Master certification'), { required: null, preferred: null });
});

test('degreeLevel reads bare BS/MS/BA/MA but not "MS Excel" or a state', () => {
  const cases = [
    ['BS, Computer Science', 2],
    ['MS Statistics', 3],
    ['BA in History', 2],
    ['MA Economics', 3],
    ['Doctor of Philosophy', 4],
    ['Skilled in MS Excel and MS Word', 0],
    ['Boston, MA 02115', 0],
    ['Certified Scrum Master', 0],
  ];
  for (const [text, want] of cases) assert.equal(degreeLevel(text), want, text);
});

test('everyday words are not read as skills', () => {
  for (const s of [
    'You will excel in a fast-paced environment',
    'Swift execution and attention to detail',
    'We are a lean team',
    'Ideas that spark innovation',
    'Shipping containers and freight',
    'Social Security numbers',
    'Sales tax filings',
    'Onboarding new data vendors',
    'Administer 5 ml doses',
    'React quickly to incidents',
    'Rust belt manufacturing',
  ]) {
    assert.deepEqual([...findSkills(s)], [], s);
  }
});

test('skills written in other common ways are recognised', () => {
  const cases = [
    ['Proficiency in R and Python', ['Python', 'R']],
    ['Python, R, SQL', ['Python', 'SQL', 'R']],
    ['Machine-learning models', ['Machine Learning']],
    ['Strong communicator', ['Communication']],
    ['Verbal and written communication', ['Communication']],
    ['Active TS/SCI clearance', ['Security Clearance']],
    ['SAS and MATLAB', ['SAS', 'MATLAB']],
  ];
  for (const [text, want] of cases) assert.deepEqual([...findSkills(text)].sort(), [...want].sort(), text);
});

test('section headings: Qualifications is required; Responsibilities and Benefits end it', () => {
  const kinds = Object.fromEntries(
    classifyLines('Qualifications:\n- SQL\nResponsibilities\n- Build dashboards\nBenefits\n- 401k match').map((l) => [l.original, l.kind])
  );
  assert.equal(kinds['- SQL'], 'required');
  assert.equal(kinds['- Build dashboards'], 'neutral');
  assert.equal(kinds['- 401k match'], 'neutral');
});

test('"not required" and fields of study are not requirements', () => {
  const job = {
    title: 'Data Analyst',
    company: 'Acme',
    text: 'Requirements\n- SQL\n- No Java experience required\n- Python is not required but helpful\n- Bachelor’s degree in statistics, economics, or a related field',
  };
  const r = localFitScore(job, [{ kind: 'resume', text: 'Analyst 2020 - 2024. SQL.\nEducation\nBA in Economics' }]);
  assert.deepEqual(r.missingSkills, []);
  assert.deepEqual(r.missingPreferred.sort(), ['Java', 'Python']);
});

test('soft skills never become ATS knockouts; a clearance does', () => {
  const job = { title: 'Engineer', text: 'Requirements\n- Excellent communication skills\n- Active TS/SCI security clearance required' };
  const r = atsScore(job, 'Engineer 2020 - 2024', { checkFormatting: false });
  assert.deepEqual(r.knockouts, ['Security Clearance (posting says "security clearance")']);
});

test('titles, pay and work mode edge cases', () => {
  assert.equal(titleLevel('Software Engineer III'), 3);
  assert.equal(titleLevel('Staff Accountant'), null);
  assert.equal(titleLevel('Lead Generation Specialist'), null);
  assert.equal(titleLevel('Product Manager'), null);
  assert.equal(titleLevel('Engineering Manager'), 4);
  assert.equal(postingSalaryMax('Pay: $45.00 - $55.00 an hour'), 114400);
  assert.equal(postingSalaryMax('$25/hr - $30/hr'), 62400);
  assert.equal(postingSalaryMax('Up to $90,000'), 90000);
  assert.equal(workMode('This is not a remote position. On-site in McLean, VA'), 'onsite');
  assert.equal(workMode('Remote: No'), null);
  assert.equal(workMode('Work from home'), 'remote');
});

// Behaviour documented (or widely reported) for real systems.

test('date formats parsers reportedly drop are flagged; "Mon YYYY – Present" is not', () => {
  const tip = (resume) => atsScore({ title: 'Analyst', text: 'Requirements\n- SQL' }, resume).tips.find((t) => t.startsWith('Date format')) || null;
  assert.match(tip('Analyst June 2022-Current'), /"Current"/);
  assert.match(tip('Analyst Jan 2020 – Present\nIntern Summer 2019 - Fall 2019'), /seasons/);
  assert.match(tip('Analyst 3/22 - 5/24'), /two-digit/);
  assert.match(tip('Analyst Jan 2020 – Present\nIntern 06/2018 - 08/2018'), /mix/);
  assert.equal(tip('Analyst Jan 2020 – Present\nAssociate Mar 2017 – Dec 2019'), null);
});

test('HiredScore-style C needs "most" (more than half) of the basic qualifications', () => {
  assert.equal(hiredScoreStyleGrade({ basicMet: 2, basicTotal: 4, preferredMet: 0, preferredTotal: 0, score: 60 }), 'D');
  assert.equal(hiredScoreStyleGrade({ basicMet: 3, basicTotal: 4, preferredMet: 0, preferredTotal: 0, score: 60 }), 'C');
});

test('ATS keywords accept other forms of the same word (Taleo "related terms"), not synonyms', () => {
  const job = { title: 'Analyst', text: 'Responsibilities\n- Managed vendor relationships and reconciled accounts' };
  const r = atsScore(job, 'Relationship management with vendors; account reconciliation', { checkFormatting: false });
  for (const w of ['managed', 'relationships', 'vendor']) assert.ok(!r.missingKeywords.includes(w), w);
});
