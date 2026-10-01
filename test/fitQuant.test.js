// Quantitative analyst roles in depth (fixtures/quantPostings.js) and
// near-miss postings that share the vocabulary but are a different job
// (fixtures/quantNearMiss.js).
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const T = require('./fixtures/techPostings');
const Q = require('./fixtures/quantPostings');
const N = require('./fixtures/quantNearMiss');

const POSTINGS = { ...Q.POSTINGS, ...N.POSTINGS };
const RESUMES = { ...T.RESUMES, ...Q.RESUMES };
const fit = (resume, posting) => localFitScore(POSTINGS[posting], [{ kind: 'resume', text: RESUMES[resume] }]);

for (const [name, set] of [['quant roles', Q], ['quant near-miss postings', N]]) {
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
