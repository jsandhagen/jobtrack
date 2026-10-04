const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { htmlToText } = require('../src/main/resumeRender');
const { atsScore, postingRewords } = require('../src/main/atsScore');
const { atsNudges } = require('../src/main/atsNudges');
const { validatedAddition, evidenceSpans, supportsWording, isSkillPhrase } = require('../src/main/skillSuggestions');
const cases = require('./fixtures/skillSuggestions');

function fixture(c) {
  const job = { title: 'Specialist', text: `Requirements\n- Experience with ${c.term} required` };
  const bank = { ...B.emptyBank(), skills: c.own ? [c.own] : [], experiences: [{ id: 'e', title: 'Analyst', organization: 'Example', start: '2020', end: 'Present' }], bullets: [{ id: 'b', experienceId: 'e', text: c.text, variants: [] }] };
  const doc = R.normalize({ skills: bank.skills, roles: [{ title: 'Analyst', organization: 'Example', dates: '2020 – Present', experienceId: 'e', bullets: [{ bulletId: 'b', text: c.text }] }] });
  const pageText = htmlToText(R.renderHtml(R.compact(doc)));
  return { job, bank, doc, pageText };
}
for (const c of cases) test(`suggested skills: ${c.name}`, () => {
  const { job, bank, doc, pageText } = fixture(c);
  const original = JSON.stringify({ bank, doc });
  const selected = B.pickSkills(job, bank);
  const ats = atsScore(job, pageText);
  const ns = atsNudges({ ats, job, bank, pageText, doc });
  const additions = [...ns.nudges, ...ns.later].filter(n => n.action?.type === 'add-skill');
  const changes = postingRewords(job, doc);
  const validation = validatedAddition(job, doc, c.term);
  if (c.safe) {
    assert.ok(validation?.addition, 'a real alias is accepted');
    assert.ok(additions.some(n => n.action.term.toLowerCase() === c.term.toLowerCase()), JSON.stringify(ns));
    assert.ok(changes.length, 'the safe alias is offered in context');
  } else {
    assert.equal(validation, null, 'the add button rejects the unproven term');
    assert.equal(additions.length, 0, JSON.stringify(additions));
    assert.equal(changes.length, 0, JSON.stringify(changes));
    assert.ok(!selected.all.some(s => s.toLowerCase() === c.term.toLowerCase()), selected.all.join(' | '));
  }
  assert.equal(JSON.stringify({ bank, doc }), original, 'suggestions do not mutate the source');
});

test('confirmed exact skills stay available even when a historical bullet is weaker evidence', () => {
  const c = { own: 'Python', term: 'Python', text: 'Currently learning Python.' };
  const { job, bank, doc } = fixture(c);
  assert.ok(B.pickSkills(job, bank).all.includes('Python'));
  assert.ok(validatedAddition(job, doc, 'Python'));
});
test('negated evidence is scoped to its clause rather than discarding real skills', () => {
  const text = 'Used SQL for reporting, but no Python experience. Not only SQL but also PostgreSQL supported the reporting system.';
  assert.equal(evidenceSpans(text, 'Python').length, 0);
  assert.ok(evidenceSpans(text, 'SQL').length >= 2);
});
test('compound source skills do not get a duplicate wording entry', () => {
  const c = { own: 'Financial Modeling & Quantitative Analysis', term: 'Financial models', text: 'Built financial modeling tools.' };
  const { job, bank, doc, pageText } = fixture(c);
  assert.equal(validatedAddition(job, doc, c.term).addition, null);
  const n = atsNudges({ ats: atsScore(job, pageText), job, bank, doc, pageText });
  assert.ok(![...n.nudges, ...n.later].some(n => n.action?.type === 'add-skill'));
});
test('an exact unsupported related tool is asked about instead of silently added', () => {
  const { job, bank, doc, pageText } = fixture(cases[0]);
  const n = atsNudges({ ats: atsScore(job, pageText), job, bank, doc, pageText });
  const ask = [...n.nudges, ...n.later].find(n => n.action?.type === 'have-skill');
  assert.ok(ask.action.terms.includes('CloudFormation'));
});
test('add validation accepts only posting terms and rejects truncated or fabricated input', () => {
  const { job, doc } = fixture(cases.find(c => c.name === 'AWS acronym expansion'));
  assert.equal(validatedAddition(job, doc, 'C++'), null);
  assert.equal(validatedAddition(job, doc, 'Amazon Web Services' + ' '.repeat(2) + 'X'.repeat(100)), null);
  assert.ok(!supportsWording('M&A', 'M&A', 'Performed commercial due diligence on vendor costs.'));
});
test('noun skills such as Workday and user experience survive phrase validation', () => {
  for (const term of ['Workday', 'User experience', 'Software development', 'Workflow automation']) assert.ok(isSkillPhrase(term), term);
  assert.ok(validatedAddition({ text: 'Requirements\n- sql experience required' }, R.normalize({ skills: ['SQL'] }), 'SQL'));
});
test('a generated target title or summary cannot supply its own skill evidence', () => {
  const job = { title: 'AWS Architect', text: 'Requirements\n- Amazon Web Services experience required' };
  const doc = R.normalize({ summary: 'AWS architect with transferable business analysis experience.', skills: ['Business Analysis'], roles: [{ title: 'Analyst', bullets: [{ text: 'Built financial models and reporting dashboards.' }] }] });
  const pageText = htmlToText(R.renderHtml(R.compact(doc)));
  const n = atsNudges({ ats: atsScore(job, pageText), job, pageText, doc });
  assert.equal(validatedAddition(job, doc, 'Amazon Web Services'), null);
  assert.ok(![...n.nudges, ...n.later].some(n => n.action?.type === 'add-skill'));
});
test('suggested additions cannot push a full resume onto another page', () => {
  const job = { text: 'Requirements\n- Amazon Web Services experience required' };
  const doc = R.normalize({ skills: ['Excel', 'Python', 'SQL', 'Tableau', 'Jira', 'Git', 'Linux', 'Java', 'React'], roles: [{ title: 'Engineer', organization: 'Example', bullets: [{ text: 'Deployed services on AWS.' }] }] });
  const fill = ' Delivered reliable software and supported customer reporting.';
  while (R.measure({ ...doc, summary: doc.summary + fill }).pages === 1) doc.summary += fill;
  assert.equal(R.measure(doc).pages, 1);
  assert.equal(R.measure({ ...doc, skills: ['Amazon Web Services', ...doc.skills] }).pages, 2);
  assert.equal(validatedAddition(job, doc, 'Amazon Web Services').addition, null);
});
