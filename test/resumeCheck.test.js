const test = require('node:test');
const assert = require('node:assert');
const RC = require('../src/shared/resumeCheck');

const failed = (text, ctx) => RC.checkBullet(text, ctx).filter((c) => !c.ok).map((c) => c.id);

test('a strong bullet passes every check', () => {
  assert.deepEqual(failed('Built a demand forecasting model in Python that cut stockouts by 18% across 40 warehouses'), []);
});

test('duty-style openers are flagged, action verbs are not', () => {
  for (const t of ['Responsible for weekly reporting to finance leadership by 10%', 'Helped with weekly revenue reporting for 3 teams', 'Worked on the 2 data pipelines feeding finance', 'Assisted 4 managers with quarterly planning'])
    assert.ok(failed(t).includes('opener'), t);
  for (const t of ['Helmed a 5-person data team through a migration', 'Led 3 analysts through a reporting migration', 'Supervised 6 interns across two offices'])
    assert.ok(!failed(t).includes('opener'), t);
});

test('a result needs a real number: not a year, a quarter or a product name', () => {
  for (const t of ['cut costs by 12%', 'saved $40K a year', 'served thousands of customers', 'doubled signups', 'onboarded 3 clients']) assert.ok(RC.hasResult(t), t);
  for (const t of ['Joined in 2019 to lead reporting', 'Planned the Q3 roadmap', 'Moved jobs onto EC2 and S3', 'Won 1st place internally']) assert.ok(!RC.hasResult(t), t);
});

test('length: up to three lines is fine; more than three, or a fragment, gets a tip', () => {
  const three = 'Built and maintained a demand forecasting model in Python and SQL that cut stockouts by 18% across 40 regional warehouses, working closely with procurement, finance and the operations leadership team to roll it out region by region over two quarters while training analysts';
  assert.ok(!failed(three).includes('length'));
  const long = `${three} in every region, documenting the method, setting up weekly accuracy reviews with each regional lead, and handing the model over to the planning team with a runbook they still use today`;
  assert.ok(failed(long).includes('length'));
  assert.ok(failed('Cut costs 10%').includes('length'));
});

test('first person and repeats are flagged', () => {
  assert.ok(failed('I led the migration of 200 dashboards to Tableau').includes('voice'));
  assert.ok(!failed('Migrated 200 dashboards and their I/O jobs to Tableau').includes('voice'));
  const a = 'Built a demand forecasting model in Python that cut stockouts by 18%';
  assert.ok(failed('Built a forecasting model in Python for demand, cutting stockouts 18%', { others: [a] }).includes('fresh'));
  assert.ok(failed('Built 12 Tableau dashboards for the finance team', { siblings: [a] }).includes('fresh'));
});

test('the resume checks: role named up top, strongest bullet first, share of results', () => {
  const doc = {
    header: { name: 'J', line1: '', line2: '' },
    summary: 'Analyst with six years of forecasting experience.',
    roles: [{ title: 'Analyst', bullets: [{ text: 'Wrote weekly status notes for the team' }, { text: 'Built a SQL forecasting model that cut stockouts by 18%' }] }],
  };
  const out = RC.checkResume(doc, { jobTitle: 'Senior Data Analyst II', covers: [[[], ['sql']]] });
  const by = Object.fromEntries(out.resume.map((c) => [c.id, c]));
  assert.equal(by.aim.ok, false); // "data" is missing
  assert.equal(by.first.ok, false);
  assert.deepEqual(by.first.moves.map((m) => m.best), [1]);
  assert.equal(by.results.ok, true); // 1 of 2
  assert.equal(out.total, 2);
  doc.summary = 'Data analyst with six years of forecasting experience.';
  assert.equal(RC.checkResume(doc, { jobTitle: 'Senior Data Analyst II' }).resume.find((c) => c.id === 'aim').ok, true);
});

test('every check explains why it matters and how it is measured', () => {
  for (const c of [...RC.BULLET_CHECKS, ...RC.RESUME_CHECKS]) assert.ok(c.title && c.why.length > 40 && c.how.length > 20, c.id);
});

test('a long skill, or a list packed into one skill, is flagged with how to split it', () => {
  const doc = (skills) => ({ roles: [], skills });
  const skillsCheck = (skills) => RC.checkResume(doc(skills)).resume.find((c) => c.id === 'skills');
  assert.equal(skillsCheck(['SQL', 'Python', 'Microsoft Power BI (DAX, Power Query, M)']).ok, true);
  const packed = skillsCheck(['SQL', 'dbt, Snowflake, Looker']);
  assert.equal(packed.ok, false);
  assert.deepEqual(packed.long, [{ i: 1, text: 'dbt, Snowflake, Looker', parts: ['dbt', 'Snowflake', 'Looker'] }]);
  const wordy = skillsCheck(['Cross-functional stakeholder management, executive communication and storytelling for senior leaders']);
  assert.equal(wordy.ok, false);
  assert.equal(skillsCheck([]), undefined);
});
