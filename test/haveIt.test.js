// "Do you have it?" (src/main/haveIt.js): which missing must-haves the card
// asks about, and where a yes is recorded so the free score counts it.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const { asksFor, recordYes, isSkill, question } = require('../src/main/haveIt');
const W = require('./fixtures/realWorld');

const job = W.POSTINGS.tsConsultantBig4;
const docs = [{ kind: 'resume', text: W.RESUMES.productManager }];
const scoreWith = (extra) => localFitScore(job, [...docs, { kind: 'bank', text: extra }], {});

test('asks about missing must-haves that would move the score, biggest first', () => {
  const quick = localFitScore(job, docs, {});
  const asks = asksFor(quick, scoreWith);
  assert.ok(asks.length >= 1 && asks.length <= 3, JSON.stringify(asks));
  for (const a of asks) {
    assert.ok(quick.missingSkills.includes(a.label));
    assert.ok(a.gain >= 3);
  }
  assert.deepEqual(asks.map((a) => a.gain), [...asks.map((a) => a.gain)].sort((x, y) => y - x));
});

test('a no is not asked again; a dealbreaker means nothing is asked', () => {
  const quick = localFitScore(job, docs, {});
  const first = asksFor(quick, scoreWith);
  const again = asksFor(quick, scoreWith, { declined: [first[0].label.toUpperCase()] });
  assert.ok(!again.some((a) => a.label === first[0].label));
  assert.deepEqual(asksFor({ ...quick, dealbreakers: ['On-site only'] }, scoreWith), []);
});

test('a yes, recorded in the bank, raises the score the way the card said', () => {
  const quick = localFitScore(job, docs, {});
  const [top] = asksFor(quick, scoreWith);
  const bank = { skills: [] };
  recordYes(bank, top.label, top.options && top.options[0]);
  const bankText = [bank.skills.join(', '), ...(bank.confirmed || [])].join('\n');
  const after = localFitScore(job, [...docs, { kind: 'bank', text: bankText }], {});
  assert.ok(after.score >= quick.score + top.gain - 1, `${quick.score} -> ${after.score}, promised +${top.gain}`);
  assert.ok(!after.missingSkills.includes(top.label));
});

test('skills go in the skills list; experience is kept apart, off resumes', () => {
  assert.ok(isSkill('SQL') && isSkill('Tableau') && isSkill('PMP') && isSkill('Change Management'));
  assert.ok(!isSkill('experience managing people') && !isSkill('enterprise-scale organizations') && !isSkill('experience in healthcare consulting or health plan strategy'));
  const bank = { skills: ['Excel'] };
  assert.equal(recordYes(bank, 'SQL').where, 'skills');
  assert.equal(recordYes(bank, 'sql').where, 'skills');
  assert.deepEqual(bank.skills, ['Excel', 'SQL'], 'no duplicates');
  assert.equal(recordYes(bank, 'experience managing people').where, 'confirmed');
  assert.deepEqual(bank.confirmed, ['experience managing people']);
  // "one of" records the one you have.
  assert.equal(recordYes(bank, 'one of Tableau, Power BI', 'Power BI').value, 'Power BI');
  assert.ok(bank.skills.includes('Power BI') && !bank.skills.some((s) => /one of/.test(s)));
  assert.equal(question('one of AWS, GCP, Azure'), 'AWS, GCP or Azure');
  assert.equal(question('managing people'), 'Experience managing people');
  assert.equal(question('consolidations'), 'Consolidations');
  assert.equal(question('Legal / Compliance'), 'Legal / Compliance experience');
  // The score's areas of work are experience, not resume skills.
  assert.equal(recordYes(bank, 'Legal / Compliance').where, 'confirmed');
});
