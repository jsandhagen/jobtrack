// Every labelled fit judgment in the test fixtures, scored at once: band
// misses, ordering misses, and a total "distance from right" to compare
// scorer changes by (lower is better). For tuning the offline fit score:
//   node scripts/fit-benchmark.js [--list]
const path = require('path');
const { localFitScore } = require('../src/main/localFit');
const fx = (f) => {
  try {
    return require(path.join(__dirname, '../test/fixtures', f));
  } catch {
    return null;
  }
};

const RESUMES = {};
const POSTINGS = {};
for (const f of ['techPostings', 'techStrategyDeep', 'techStrategyHoldout', 'techStrategyNearMiss', 'quantPostings', 'quantNearMiss', 'quantHoldout']) {
  const m = fx(f);
  if (!m) continue;
  Object.assign(POSTINGS, m.POSTINGS || {});
  for (const [k, v] of Object.entries(m.RESUMES || {})) RESUMES[k] = { documents: [{ kind: 'resume', text: v }], profile: {} };
}
const C = fx('fitCases');
const N = fx('nearMisses');
const J = fx('fitJudgments');
const docs = (r) => RESUMES[r] || C.CANDIDATES[r] || (C && { documents: [{ kind: 'resume', text: '' }], profile: {} });
const fit = (r, p) => {
  const c = RESUMES[r] || C.CANDIDATES[r];
  return localFitScore(typeof p === 'string' ? POSTINGS[p] || C.POSTINGS[p] || N.POSTINGS[p] : p, c.documents, c.profile).score;
};

const misses = [];
let distance = 0;
let checks = 0;
const band = (name, v, lo, hi, why) => {
  checks++;
  if (v < lo || v > hi) {
    const d = v < lo ? lo - v : v - hi;
    distance += d;
    misses.push(`${name}: ${v} not in [${lo}, ${hi}] (${why})`);
  }
};
const order = (name, x, y, why) => {
  checks++;
  if (!(x > y)) {
    distance += y - x + 1;
    misses.push(`${name}: ${x} vs ${y} (${why})`);
  }
};
for (const f of ['techPostings', 'techStrategyDeep', 'techStrategyHoldout', 'techStrategyNearMiss', 'quantPostings', 'quantNearMiss', 'quantHoldout']) {
  const m = fx(f);
  if (!m) continue;
  for (const [r, p, lo, hi, why] of m.BANDS || []) band(`${f} ${r} → ${p}`, fit(r, p), lo, hi, why);
  for (const [p, a, b, why] of m.ORDER || []) order(`${f} ${p}: ${a} vs ${b}`, fit(a, p), fit(b, p), why);
}
const BAND = { strong: [65, 100], possible: [40, 72], weak: [0, 44], dealbreaker: [0, 30] };
for (const [c, p, b] of C.CASES) band(`fitCases ${c} → ${p}`, fit(c, p), ...BAND[b], b);
for (const [c, better, worse] of C.ORDERINGS) order(`fitCases ${c}: ${better} vs ${worse}`, fit(c, better), fit(c, worse), '');
for (const [c, p, lo, hi, why] of N.BANDS) band(`nearMisses ${c} → ${p}`, fit(c, p), lo, hi, why);
const s = (posting, resume) => localFitScore(posting, [{ kind: 'resume', text: resume }]).score;
for (const [posting, better, worse, why] of J.JUDGMENTS) order(`judgment`, s(posting, better), s(posting, worse), why);
for (const [posting, resume, lo, hi, why] of J.BANDS) band(`judgment band`, s(posting, resume), lo, hi, why);

console.log(`${checks} checks, ${misses.length} missed, distance ${distance}`);
if (process.argv.includes('--list')) for (const m of misses) console.log('  ' + m);
module.exports = { distance, misses };
