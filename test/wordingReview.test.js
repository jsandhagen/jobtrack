// Wording you didn't write waits for your answer (approve, deny or edit), and
// benefits, location and work-authorization lines aren't requirements.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/main/wordingReview');
const { localFitScore, requirementUnits } = require('../src/main/localFit');
const { atsScore } = require('../src/main/atsScore');

const bank = { bullets: [{ id: 'b1', text: 'Built models in Python for pricing', variants: ['Built pricing models'] }], skills: ['Excel'], summary: 'Analyst.' };
const prev = { summary: 'Analyst.', skills: ['Excel'], roles: [{ title: 'Analyst', bullets: [{ bulletId: 'b1', text: 'Built models in Python for pricing' }] }] };
const next = {
  summary: 'Strategy analyst who builds pricing models.',
  skills: ['Excel', 'Python', 'Financial modeling'],
  roles: [{ title: 'Analyst', organization: 'Acme', bullets: [{ bulletId: 'b1', text: 'Built pricing models in Python' }, { bulletId: null, text: 'Led a pricing review' }] }],
};

test('every changed summary, bullet and skills line is listed for review', () => {
  const items = W.wordingChanges(prev, next, bank);
  assert.deepEqual(items.map((x) => x.kind), ['summary', 'bullet', 'bullet', 'skills']);
  assert.equal(items[1].before, 'Built models in Python for pricing');
  assert.equal(items[2].before, '', 'a bullet that is not in the bank is new');
  // "Python" is in your bullets; "Financial modeling" is a new word.
  assert.deepEqual(items[3].added, ['Financial modeling']);
});

test('your own wordings are not asked about', () => {
  const same = { ...prev, roles: [{ title: 'Analyst', bullets: [{ bulletId: 'b1', text: 'Built pricing models' }] }] };
  assert.deepEqual(W.wordingChanges(prev, same, bank), []);
});

test('approve keeps, deny restores (or removes a new bullet), edit uses your words', () => {
  const items = W.wordingChanges(prev, next, bank);
  const doc = W.applyDecisions(next, items, { w0: { choice: 'deny' }, w1: { choice: 'edit', text: 'Built Python pricing models' }, w2: { choice: 'deny' }, w3: { choice: 'approve' } });
  assert.equal(doc.summary, 'Analyst.');
  assert.deepEqual(doc.roles[0].bullets.map((b) => b.text), ['Built Python pricing models']);
  assert.deepEqual(doc.skills, ['Excel', 'Python', 'Financial modeling']);
  const denied = W.applyDecisions(next, items, { w3: { choice: 'deny' } });
  assert.deepEqual(denied.skills, ['Excel']);
});

const docs = [{ id: 'd', name: 'Resume', text: 'Strategy consultant. Built financial models in Excel. Led market analysis. BA Economics.' }];

test('"authorized to work in the United States" is a screening question, not a skill', () => {
  const job = { title: 'Strategy Analyst', text: 'Strategy Analyst\n\nQualifications\n- Strong Excel skills\n- Must be authorized to work in the United States\n- Candidates must be located in the US\nLocation: Remote, United States' };
  const labels = requirementUnits(job).units.map((u) => u.label);
  assert.ok(!labels.some((l) => /united states|\bus\b/i.test(l)), labels.join(' | '));
  assert.ok(!localFitScore(job, docs, {}).missingSkills.some((s) => /united states/i.test(s)));
  assert.ok(!atsScore(job, docs[0].text, {}).knockouts.some((s) => /united states/i.test(s)));
});

test('benefits are not requirements, whatever their heading', () => {
  const perks = [
    "Why you'll love working here\n- Medical, dental and vision insurance from day one\n- Paid parental leave and sick leave\n- Executive wellness program",
    'Perks:\n• Medical/Dental/Vision\n• 16 weeks parental leave\n• Executive coaching',
    'Medical, dental and vision coverage\nGenerous family leave\nTuition reimbursement',
  ];
  for (const p of perks) {
    const job = { title: 'Strategy Analyst', text: `Strategy Analyst\n\nQualifications\n- Strong Excel skills\n\n${p}` };
    const labels = requirementUnits(job).units.map((u) => u.label);
    assert.ok(!labels.some((l) => /medical|dental|leave|executive|wellness|tuition/i.test(l)), labels.join(' | '));
  }
});

test('place names are never skills to ask about', () => {
  for (const line of ['Remote (United States)', 'Experience working with clients across the United States and Canada', 'Open to candidates anywhere in the U.S.']) {
    const job = { title: 'Strategy Analyst', text: `Strategy Analyst\n\nQualifications\n- Strong Excel skills\n- ${line}` };
    const labels = requirementUnits(job).units.map((u) => u.label);
    assert.ok(!labels.some((l) => /states|canada|\bu\.?s\b/i.test(l)), `${line}: ${labels.join(' | ')}`);
  }
});

test('about five years for a job asking eight reads well under the same job asking five', () => {
  const resume = 'EXPERIENCE\nSenior Strategy Consultant, Northwind — Oct 2021 – Sep 2024\n- Led competitive intelligence and built financial models in Excel\nStrategy Analyst, Fabrikam — Oct 2019 – Sep 2021\n- Built market analysis and business cases\nEDUCATION\nBA Economics, 2019';
  const fit = (yrs) => localFitScore({ title: 'Senior Manager, Corporate Strategy', text: `Senior Manager, Corporate Strategy\n\nQualifications\n- ${yrs}+ years of experience in corporate strategy or management consulting\n- Strong financial modeling and Excel skills` }, [{ id: 'r', kind: 'resume', text: resume }], {}).score;
  assert.ok(fit(5) - fit(8) >= 8, `5+: ${fit(5)}, 8+: ${fit(8)}`);
  assert.ok(fit(8) < 65, 'not a strong match on the calibrated scale');
});
