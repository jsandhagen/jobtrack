const test = require('node:test');
const assert = require('node:assert/strict');
const { resumeStrength, createStrengthScorer } = require('../src/main/resumeStrength');

const job = { title: 'Data Analyst', text: 'Requirements\n- SQL\n- Python' };
const bullet = (text, bulletId) => ({ text, bulletId });
const doc = (summary, bullets) => ({ summary, roles: [{ experienceId: 'e', bullets }] });

test('summary rewards relevant evidence and penalizes echoes, objectives and off-topic text', () => {
  const summaryJob = { ...job, title: '' };
  const bullets = [bullet('Built SQL dashboards for 40 customers, cutting reporting delays by 25%'), bullet('Automated Python forecasts for 12 regions, reducing planning time by 30%')];
  assert.equal(resumeStrength(doc('SQL and Python analytics specialist.', bullets), summaryJob).parts.summary, 1);
  assert.equal(resumeStrength(doc('Experience includes SQL, dashboards and Python.', bullets), summaryJob).parts.summary, 1, 'shared tool names are not an accomplishment echo');
  assert.equal(resumeStrength(doc('Built SQL dashboards for 40 customers.', bullets), summaryJob).parts.summary, 0.4);
  assert.equal(resumeStrength(doc('Automated Python forecasts for 12 regions.', bullets), summaryJob).parts.summary, 0.75);
  assert.equal(resumeStrength(doc('Seeking opportunities in SQL analytics.', bullets), summaryJob).parts.summary, 0.5);
  assert.equal(resumeStrength(doc('An experienced technology partnerships professional.', bullets), summaryJob).parts.summary, 0.4);
});

test('sector evidence matters near the top only when it is available on the page', () => {
  const posting = { title: 'Data Analyst, Public Sector', text: 'Analyze SQL data for public sector agencies.\nRequirements\n- SQL' };
  const bullets = [bullet('Built SQL dashboards for retail clients'), bullet('Automated sales forecasting in Python'), bullet('Analyzed public sector budgets for 20 agencies')];
  const scored = resumeStrength(doc('SQL data analysis specialist.', bullets), posting);
  assert.equal(scored.parts.summary, 0.7);
  assert.match(scored.notes.join(' '), /public sector/);
  assert.equal(resumeStrength(doc('SQL data analysis specialist.', [bullets[2], ...bullets.slice(0, 2)]), posting).parts.summary, 1);
  assert.equal(resumeStrength(doc('SQL data analysis specialist.', bullets.slice(0, 2)), posting).parts.summary, 1);
});

test('lead compares available, visible proof from the latest job and ignores twins', () => {
  const ranked = [
    { id: 'a', experienceId: 'e', score: 10, text: 'Built SQL dashboards for 40 customers' },
    { id: 'b', experienceId: 'e', score: 8, text: 'Automated Python forecasting across 12 regions' },
    { id: 'c', experienceId: 'e', score: 1, text: 'Coordinated weekly stakeholder meetings' },
    { id: 'hidden', experienceId: 'e', score: 100, text: 'Managed payroll', hidden: true },
    { id: 'other', experienceId: 'old', score: 100, text: 'Managed inventory' },
    { id: 'twin', experienceId: 'e', score: 100, text: 'Built SQL dashboards for 40 customers, delivering recommendations' },
  ];
  const page = doc('', ranked.slice(0, 2).map((r) => bullet(r.text, r.id)));
  assert.equal(resumeStrength(page, job, { ranked }).parts.lead, 1);
  page.roles[0].bullets[1] = bullet(ranked[2].text, 'c');
  assert.equal(resumeStrength(page, job, { ranked }).parts.lead, 13 / 18);
});

test('projects show must-haves and results but do not displace the latest job lead', () => {
  const page = doc('', [bullet('Analyzed customer feedback')]);
  assert.equal(resumeStrength(page, job).parts.mustHaves, 0);
  page.roles.unshift({ isProject: true, bullets: [bullet('Built SQL and Python analytics for 40 stores')] });
  const scored = resumeStrength(page, job);
  assert.equal(scored.parts.mustHaves, 1);
  assert.equal(scored.parts.results, 0.5 / 0.6);
  assert.equal(scored.parts.lead, null);
});

test('duplicate achievements incur the total penalty, including projects', () => {
  const text = 'Built SQL and Python analytics for 40 stores';
  const original = resumeStrength(doc('', [bullet(text)]), job);
  const page = doc('', [bullet(text)]);
  page.roles.push({ isProject: true, bullets: [bullet(text)] });
  const repeated = resumeStrength(page, job);
  assert.equal(repeated.score, original.score * 0.85);
  assert.match(repeated.notes.join(' '), /same accomplishment/);
});

test('inapplicable parts are reweighted and an empty page stays finite', () => {
  const scored = resumeStrength(doc('', [bullet('Delivered training to 40 customers')]), { text: '' });
  assert.equal(scored.score, 1);
  assert.equal(scored.grade, 'A');
  assert.equal(resumeStrength({}, { text: '' }).score, 0);
});

test('a reusable scorer agrees with fresh scoring after edits and across postings', () => {
  const score = createStrengthScorer(job);
  const page = doc('SQL analytics specialist.', [bullet('Built SQL dashboards for 40 customers')]);
  assert.deepEqual(score(page), resumeStrength(page, job));
  page.summary = 'Seeking opportunities in SQL analytics.';
  page.roles[0].bullets.push(bullet('Automated Python forecasting across 12 regions'));
  assert.deepEqual(score(page), resumeStrength(page, job));
  const unrelated = { title: 'Nurse', text: 'Requirements\n- Nursing\n- Patient care' };
  assert.deepEqual(createStrengthScorer(unrelated)(page), resumeStrength(page, unrelated));
  assert.deepEqual(score(page), resumeStrength(page, job));
});
