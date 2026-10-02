const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/main/bullets');
const { classifyLines } = require('../src/main/fitScore');
const { strategyChecks } = require('../src/main/strategyResume');
const { resumeEnhancements } = require('../src/main/resumeContext');
const profile = { name: 'Strategy Candidate', email: 'candidate@example.com' };
const source = 'Experience\nSenior Technology Strategy Consultant, Appian, Oct 2022 - Present\n- Managed quarterly business reviews and joint business planning across 7 technology partnerships, supporting $9M in customer transactions\n- Researched competitive strategies at ServiceNow and reviewed competitor product launches\n- Evaluated financial ROI and pipeline forecasts for strategic opportunities\nSkills\nSQL, Excel, Competitive Intelligence, Partnership Management';
const bankFor = () => B.mergeIntoBank(B.emptyBank(), B.parseResume(source)).bank;
const job = { title: 'Strategic Alliances Partnership Manager', text: 'We’re Looking For:\n- 5+ years working with ISV and cloud software partners\n- Demonstrated execution of an OEM motion\nPreferred:\n- Identity and access management experience' };

test('real employer requirements headings include “We’re Looking For” without promoting preferred criteria', () => {
  const lines = classifyLines(job.text);
  assert.equal(lines.find((l) => /5\+ years/.test(l.original)).kind, 'required');
  assert.equal(lines.find((l) => /OEM motion/.test(l.original)).kind, 'required');
  assert.equal(lines.find((l) => /Identity/.test(l.original)).kind, 'preferred');
});

test('optional context prompts ask about actual OEM experience and dated specialty tenure', () => {
  const bank = bankFor();
  const before = JSON.stringify(bank);
  const suggestions = resumeEnhancements({ bank, job, profile });
  assert.ok(suggestions.some((s) => /OEM/.test(s.topic) && /your contribution/.test(s.question)));
  assert.ok(suggestions.some((s) => /years specifically/.test(s.topic) && /dates/.test(s.question)));
  assert.ok(suggestions.every((s) => s.action.type === 'add-context'));
  assert.ok(suggestions.length <= 3);
  assert.equal(JSON.stringify(bank), before, 'asking creates no claimed experience');
  const out = B.optimizeResume({ bank, job, profile });
  assert.doesNotMatch(out.doc.roles.map((r) => r.bullets.map((b) => b.text)).join(' '), /OEM/);
  assert.ok(out.checks.some((s) => /OEM/.test(s) && /If you have/.test(s)));
});

test('a real example supplied by the user becomes eligible evidence and resolves its prompt', () => {
  const bank = bankFor();
  const text = 'Executed an OEM partnership with a cloud software partner, coordinating the embedded-software implementation and onboarding for 12 customer accounts';
  bank.bullets.push({ id: 'user-context', experienceId: bank.experiences[0].id, text, variants: [], source: { name: 'Context you added' } });
  assert.ok(!resumeEnhancements({ bank, job, profile }).some((s) => /OEM/.test(s.topic)));
  const out = B.optimizeResume({ bank, job, profile });
  assert.ok(out.doc.roles.flatMap((r) => r.bullets).some((b) => b.bulletId === 'user-context'));
  assert.ok(!out.checks.some((s) => /OEM/.test(s)));
  assert.ok(out.checks.some((s) => /years specifically/.test(s)), 'one bullet does not invent extra tenure');
});

test('context uses the complete eligible bank, excluding hidden roles', () => {
  const bank = bankFor();
  bank.experiences.push({ id: 'hidden', hidden: true, title: 'Partner Director', dates: '2010 - Present' });
  bank.bullets.push({ id: 'hidden-oem', experienceId: 'hidden', text: 'Executed OEM partnerships for 10 years', variants: [] });
  assert.ok(resumeEnhancements({ bank, job, profile }).some((s) => /OEM/.test(s.topic)));
});

test('undocumented career tenure offers an optional way to add role dates instead of inventing years', () => {
  const bank = bankFor();
  const target = { title: 'Digital Strategy Manager', text: 'Requirements\n- 7+ years of experience in consulting or strategy' };
  const suggestions = resumeEnhancements({ bank, job: target, profile });
  assert.ok(suggestions.some((s) => /7\+ years of experience/.test(s.topic) && /roles and their dates/.test(s.question)));
});

test('AI research and normal reporting do not prove Salesforce administration or production AI implementation', () => {
  const bank = bankFor();
  const target = { title: 'GTM Strategy and Operations Manager', text: 'Requirements\n- Strong Salesforce knowledge including permissions, configuration and data modeling\n- Experience integrating AI workflows in production' };
  bank.bullets.push({ id: 'ambiguous-ai', experienceId: bank.experiences[0].id, text: 'Implemented AI productivity tools and workflow automations for research, communication and documentation', variants: [] });
  let { doc } = B.optimizeResume({ bank, job: target, profile });
  assert.ok(strategyChecks(target, doc).some((s) => /Salesforce/.test(s)));
  assert.ok(strategyChecks(target, doc).some((s) => /production/.test(s)));
  bank.bullets.push({ id: 'real-work', experienceId: bank.experiences[0].id, text: 'Configured Salesforce permissions and data models and deployed AI workflows in production using APIs, reducing reconciliation time by 20%', variants: [] });
  doc = B.optimizeResume({ bank, job: target, profile }).doc;
  assert.deepEqual(strategyChecks(target, doc), []);
});

test('competitor names, reviewed launches and financial diligence do not turn into unearned skills', () => {
  const bank = bankFor();
  const target = { title: 'Digital M&A Strategy Manager', text: 'Requirements\n- ServiceNow platform experience\n- M&A integration experience\n- Product launches' };
  const skills = B.pickSkills(target, bank).relevant;
  assert.ok(!skills.some((s) => /ServiceNow|M&A|Product launches/i.test(s)), skills.join(', '));
  bank.skills.push('ServiceNow', 'M&A');
  assert.ok(B.pickSkills(target, bank).relevant.some((s) => /ServiceNow/i.test(s)), 'explicitly reported proficiency counts');
});
