// Real-world evaluation of the free fit score (test/fixtures/realWorld.js):
// postings rebuilt from real job descriptions, scored for many candidate
// profiles against labels set before scoring. Each posting is scored as
// clean text and as a captured page (LinkedIn, Workday or Indeed furniture
// around it, cleaned by posting.js the way the app cleans captures).
//   node scripts/fit-realworld.js [--set realWorld|randomJobs] [--units] [--pairs]
//     --units  every requirement read from each posting (for reviewing extraction)
//     --pairs  every labelled pair with its score and headline
const fs = require('fs');
const path = require('path');
const { localFitScore, requirementUnits } = require('../src/main/localFit');
const { cleanPosting } = require('../src/main/posting');
const setArg = process.argv.indexOf('--set');
const W = require(`../test/fixtures/${setArg > 0 ? process.argv[setArg + 1] : 'realWorld'}`);
W.PROFILE_CASES = W.PROFILE_CASES || [];

const fx = (f) => require(path.join(__dirname, '../test/fixtures', f));
const CANDIDATES = {};
for (const f of ['techPostings', 'techStrategyDeep', 'quantPostings', 'quantHoldout', 'realWorld', 'randomJobs', 'randomJobs2']) for (const [k, text] of Object.entries(fx(f).RESUMES || {})) CANDIDATES[k] = { documents: [{ kind: 'resume', text }], profile: {} };
for (const [k, c] of Object.entries(fx('fitCases').CANDIDATES)) CANDIDATES[k] = { documents: c.documents, profile: {} };

// Page furniture from real captures (test/fixtures/pastes), with the body swapped in.
const PASTES = ['linkedin', 'workday', 'indeed'].map((n) => fs.readFileSync(path.join(__dirname, '../test/fixtures/pastes', `${n}.txt`), 'utf8'));
const captured = (p, i) => {
  const tpl = PASTES[i % PASTES.length].replace(/Data Analyst/g, p.title).replace(/Brightline Health/g, p.company).replace(/Denver, CO(?: 80202)?/g, p.location || 'Remote');
  return cleanPosting({ text: tpl.replace('{{BODY}}', p.text) });
};

const args = process.argv.slice(2);
const postingKeys = Object.keys(W.POSTINGS);
const views = { clean: W.POSTINGS, captured: Object.fromEntries(postingKeys.map((k, i) => [k, captured(W.POSTINGS[k], i)])) };

const titleMisses = postingKeys.filter((k) => views.captured[k].title !== W.POSTINGS[k].title).map((k) => `${k}: "${views.captured[k].title}"`);

const cls = (lo, hi) => ((lo + hi) / 2 >= 70 ? 'strong' : (lo + hi) / 2 < 40 ? 'weak' : 'possible');
const scoreCls = (s) => (s >= 65 ? 'strong' : s < 45 ? 'weak' : 'possible');

function evaluate(postings) {
  const fit = (r, p, profile) => localFitScore(postings[p], CANDIDATES[r].documents, profile || CANDIDATES[r].profile);
  const misses = [];
  const confusion = {};
  let inBand = 0;
  let distance = 0;
  const pos = [];
  const neg = [];
  for (const [r, p, lo, hi, why] of W.BANDS) {
    const o = fit(r, p);
    const v = o.score;
    if (v >= lo && v <= hi) inBand++;
    else {
      distance += v < lo ? lo - v : v - hi;
      misses.push(`${r} → ${p}: ${v} not in [${lo}, ${hi}] (${why}) | ${o.headline}`);
    }
    const key = `${cls(lo, hi)}→${scoreCls(v)}`;
    confusion[key] = (confusion[key] || 0) + 1;
    if (lo >= 60) pos.push(v);
    if (hi <= 45) neg.push(v);
  }
  let orderOk = 0;
  const orderMisses = [];
  for (const [p, a, b, why] of W.ORDER) {
    const x = fit(a, p).score;
    const y = fit(b, p).score;
    if (x > y) orderOk++;
    else orderMisses.push(`${p}: ${a} ${x} vs ${b} ${y} (${why})`);
  }
  // AUC: how often a should-be-strong pair outscores a should-be-weak pair.
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  const auc = pos.length && neg.length ? wins / (pos.length * neg.length) : NaN;
  const profileResults = W.PROFILE_CASES.map(([r, p, profile, expect, why]) => {
    const o = fit(r, p, profile);
    const got = o.dealbreakers.length ? 'dealbreaker' : 'clear';
    return { ok: got === expect, line: `${r} → ${p} ${JSON.stringify(profile)}: ${got} (${o.score}) — expected ${expect}: ${why}${o.dealbreakers.length ? ` [${o.dealbreakers.join('; ')}]` : ''}` };
  });
  return { inBand, misses, distance, confusion, orderOk, orderMisses, auc, profileResults, pos, neg };
}

for (const [name, postings] of Object.entries(views)) {
  const e = evaluate(postings);
  console.log(`\n=== ${name} postings (${postingKeys.length}) ===`);
  console.log(`bands: ${e.inBand}/${W.BANDS.length} in range (distance ${e.distance}); orderings: ${e.orderOk}/${W.ORDER.length}; AUC strong-vs-weak: ${e.auc.toFixed(3)} (${e.pos.length} × ${e.neg.length} pairs)`);
  const labels = ['strong', 'possible', 'weak'];
  console.log('confusion (label → score):');
  for (const a of labels) console.log(`  ${a.padEnd(8)} ${labels.map((b) => `${b}: ${String(e.confusion[`${a}→${b}`] || 0).padStart(3)}`).join('  ')}`);
  console.log(`screening with Profile answers: ${e.profileResults.filter((x) => x.ok).length}/${e.profileResults.length}`);
  for (const x of e.profileResults.filter((y) => !y.ok)) console.log('  ✗ ' + x.line);
  if (e.misses.length) console.log('band misses:\n  ' + e.misses.join('\n  '));
  if (e.orderMisses.length) console.log('ordering misses:\n  ' + e.orderMisses.join('\n  '));
}
console.log(`\ntitles read from captured pages: ${postingKeys.length - titleMisses.length}/${postingKeys.length}${titleMisses.length ? `\n  ${titleMisses.join('\n  ')}` : ''}`);

if (args.includes('--units')) {
  for (const k of postingKeys) {
    const { units } = requirementUnits(W.POSTINGS[k]);
    console.log(`\n# ${k}: ${W.POSTINGS[k].title}`);
    for (const u of units) console.log(`  ${u.kind.padEnd(9)} ${u.label}${u.core ? ' [core]' : ''}`);
  }
}
if (args.includes('--pairs')) {
  for (const [r, p, lo, hi] of W.BANDS) {
    const o = localFitScore(W.POSTINGS[p], CANDIDATES[r].documents);
    console.log(`${String(o.score).padStart(3)} [${lo}-${hi}] ${r} → ${p} | ${o.headline}`);
  }
}
