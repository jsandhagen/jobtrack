// Technology strategy in depth (fixtures/techStrategyDeep.js), held-out
// postings written after tuning (fixtures/techStrategyHoldout.js) and
// near-miss postings that share the vocabulary but are a different job
// (fixtures/techStrategyNearMiss.js).
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const T = require('./fixtures/techPostings');
const D = require('./fixtures/techStrategyDeep');
const H = require('./fixtures/techStrategyHoldout');
const N = require('./fixtures/techStrategyNearMiss');

const POSTINGS = { ...T.POSTINGS, ...D.POSTINGS, ...H.POSTINGS, ...N.POSTINGS };
const RESUMES = { ...T.RESUMES, ...D.RESUMES };
const fit = (resume, posting) => localFitScore(POSTINGS[posting], [{ kind: 'resume', text: RESUMES[resume] }]);

for (const [name, set] of [['tech strategy in depth', D], ['held-out tech strategy postings', H], ['near-miss postings', N]]) {
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

test("a career changer's experience counts in their own field's words", () => {
  const r = fit('quantCareerChanger', 'chiefOfStaffCTO');
  // "key point of contact … stakeholders", "recommendations to senior management"
  assert.ok(r.matchedSkills.includes('Stakeholder Management'), r.matchedSkills.join(', '));
  assert.ok(r.matchedSkills.includes('Project Management'));
  const ai = fit('quantCareerChanger', 'dataAIStrategy');
  for (const s of ['Python', 'SQL', 'Machine Learning', 'Data Quality']) assert.ok(ai.matchedSkills.includes(s), s);
});

test('screening items and interests are not scored as skills', () => {
  const r = fit('techStrategyConsultant', 'federalModernization');
  assert.ok(!r.missingSkills.some((s) => /clearance|obtain|travel/i.test(s)), r.missingSkills.join(', '));
  const a = fit('juniorAnalyst', 'techStrategyAnalyst');
  assert.ok(!a.missingSkills.some((s) => /interest/i.test(s)), a.missingSkills.join(', '));
});

test('consulting titles: chief of staff is not C-level; a manager is a consultant\'s next step', () => {
  const cos = fit('techStrategyConsultant', 'chiefOfStaffCTO');
  assert.notEqual(cos.postingLevel, 'executive');
  assert.ok(cos.components.role >= 40, `role ${cos.components.role}`);
  assert.ok(fit('techStrategyConsultant', 'inHouseStrategyManager').components.role >= 60);
});

test('partial evidence is reported as partial, not matched', () => {
  const r = fit('quantCareerChanger', 'techStrategySenior');
  // "strategic insights … to senior management" is related to technology strategy, not the thing itself.
  assert.ok(!r.matchedSkills.includes('Technology Strategy'));
  assert.ok(r.partialSkills.includes('Technology Strategy'), r.partialSkills.join(', '));
});

test('a product the title names is a requirement, and missing it caps the fit', () => {
  const r = fit('techStrategyConsultant', 'workdayConsultant');
  assert.ok(r.missingSkills.includes('Workday'), r.missingSkills.join(', '));
  assert.ok(r.score <= 40, `score ${r.score}`);
  assert.ok(r.concerns.some((c) => /title names Workday/.test(c)), r.concerns.join(' | '));
  // Ordinary title words (Technology, Risk, Audit) are not products: no cap.
  assert.ok(!fit('techStrategyConsultant', 'itAuditConsultant').concerns.some((c) => /title names/.test(c)));
});
