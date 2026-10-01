// Technology and technology-strategy roles (fixtures/techPostings.js): a
// technology strategy consultant should read as a strong fit for strategy and
// transformation consulting, partial for neighbouring tech roles, and weak for
// engineering; other tech profiles should land where a recruiter would put them.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const { POSTINGS, RESUMES, BANDS, ORDER } = require('./fixtures/techPostings');

const score = (resume, posting) => localFitScore(POSTINGS[posting], [{ kind: 'resume', text: RESUMES[resume] }]);

test('tech and tech-strategy fits land in the expected ranges', () => {
  const wrong = [];
  for (const [r, p, lo, hi, why] of BANDS) {
    const v = score(r, p).score;
    if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v} not in [${lo}, ${hi}] (${why})`);
  }
  assert.deepEqual(wrong, []);
});

test('the right profile wins each tech posting', () => {
  const wrong = [];
  for (const [p, a, b, why] of ORDER) {
    const x = score(a, p).score;
    const y = score(b, p).score;
    if (!(x > y)) wrong.push(`${p}: ${a} ${x} vs ${b} ${y} (${why})`);
  }
  assert.deepEqual(wrong, []);
});

test('a technology strategy posting is read as consulting work, not junk terms', () => {
  const r = score('techStrategyConsultant', 'techStrategySenior');
  assert.deepEqual(r.missingSkills, []);
  for (const s of ['Technology Strategy', 'Roadmapping', 'Business Cases', 'Operating Model', 'Stakeholder Management', 'PowerPoint']) assert.ok(r.matchedSkills.includes(s), s);
  // A technology roadmap is not product management.
  assert.ok(!r.matchedSkills.includes('Product Management'));
  assert.ok(r.components.role >= 80, `role ${r.components.role}`);
});
