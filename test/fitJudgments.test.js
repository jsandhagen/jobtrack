// The fit score against controlled resume variants (see fixtures/fitJudgments.js):
// must-haves dominate, related skills and older or listed-only evidence earn
// partial credit, and having held the title matters.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const { JUDGMENTS, BANDS } = require('./fixtures/fitJudgments');

const score = (posting, resume) => localFitScore(posting, [{ kind: 'resume', text: resume }]).score;

test('the better of each pair of resume variants scores higher', () => {
  const wrong = [];
  for (const [posting, better, worse, why] of JUDGMENTS) {
    const a = score(posting, better);
    const b = score(posting, worse);
    if (!(a > b)) wrong.push(`${why}: ${a} vs ${b}`);
  }
  assert.deepEqual(wrong, []);
});

test('absolute bands: meeting every must-have is a strong match, missing two is not', () => {
  const wrong = [];
  for (const [posting, resume, lo, hi, why] of BANDS) {
    const v = score(posting, resume);
    if (v < lo || v > hi) wrong.push(`${why}: ${v} not in [${lo}, ${hi}]`);
  }
  assert.deepEqual(wrong, []);
});
