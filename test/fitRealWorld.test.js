// Postings rebuilt from real job descriptions (fixtures/realWorld.js), technology
// strategy consulting first, then general roles, scored as clean text and as
// captured pages. scripts/fit-realworld.js prints the full report.
//
// First pass, before any rule change these postings prompted: 78 of 105 bands,
// 23 of 24 orderings, 7 of 8 screening cases, AUC 0.993, 24 of 25 titles read
// from captured pages. The general fixes they led to (see the commit) brought
// that to the numbers scripts/fit-realworld.js prints now. The misses left are mostly within a few
// points of their band; the tests allow for them but not for any far off.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { localFitScore } = require('../src/main/localFit');
const { cleanPosting } = require('../src/main/posting');
const W = require('./fixtures/realWorld');

const fx = (f) => require(`./fixtures/${f}`);
const C = {};
for (const f of ['techPostings', 'techStrategyDeep', 'quantPostings', 'quantHoldout', 'realWorld', 'randomJobs', 'randomJobs2']) for (const [k, text] of Object.entries(fx(f).RESUMES || {})) C[k] = [{ kind: 'resume', text }];
for (const [k, c] of Object.entries(fx('fitCases').CANDIDATES)) C[k] = c.documents;
const fit = (r, p, profile = {}) => localFitScore(W.POSTINGS[p], C[r], profile);

// Labels the score disagrees with by more than a little, kept as written:
// the Strategy & Operations posting asks for strategy and client advisory
// work an in-house business analyst doesn't show; the label (35-70) credited
// their process and delivery work more than the posting does.
const KNOWN_DISAGREEMENTS = new Set(['businessAnalyst → strategyOpsConsultant']);

test('real-world postings: nearly every band met, none far off', () => {
  const wrong = [];
  for (const [r, p, lo, hi, why] of W.BANDS) {
    const v = fit(r, p).score;
    if ((v < lo - 15 || v > hi + 15) && !KNOWN_DISAGREEMENTS.has(`${r} → ${p}`)) assert.fail(`${r} → ${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v}`);
  }
  assert.ok(wrong.length <= 12, `${wrong.length} of ${W.BANDS.length} outside their band: ${wrong.join('; ')}`);
});

test('real-world postings: a should-be-strong pair always outscores a should-be-weak one', () => {
  const strong = W.BANDS.filter(([, , lo]) => lo >= 60).map(([r, p]) => fit(r, p).score);
  const weak = W.BANDS.filter(([, , , hi]) => hi <= 45).map(([r, p]) => fit(r, p).score);
  assert.ok(Math.min(...strong) > Math.max(...weak), `lowest strong ${Math.min(...strong)}, highest weak ${Math.max(...weak)}`);
  const wrong = W.ORDER.filter(([p, a, b]) => !(fit(a, p).score > fit(b, p).score));
  assert.ok(wrong.length <= 1, wrong.map((x) => x.join(' ')).join('; '));
});

test('real-world postings: screening questions against Profile answers', () => {
  for (const [r, p, profile, expect, why] of W.PROFILE_CASES) {
    const o = fit(r, p, profile);
    assert.equal(o.dealbreakers.length ? 'dealbreaker' : 'clear', expect, `${r} → ${p}: ${why} (${o.dealbreakers.join('; ')})`);
  }
});

test('real-world postings captured from a page score like the clean text', () => {
  const tpl = fs.readFileSync(path.join(__dirname, 'fixtures/pastes/linkedin.txt'), 'utf8');
  for (const [k, p] of Object.entries(W.POSTINGS)) {
    const captured = cleanPosting({ text: tpl.replace(/Data Analyst/g, p.title).replace(/Brightline Health/g, p.company).replace('{{BODY}}', p.text) });
    assert.equal(captured.title, p.title, k);
    const a = localFitScore(p, C.techStrategyConsultant).score;
    const b = localFitScore(captured, C.techStrategyConsultant).score;
    assert.ok(Math.abs(a - b) <= 5, `${k}: ${a} clean vs ${b} captured`);
  }
});

test('real-world reading: framework lists, breadth lists, duties and the role named in the title', () => {
  const { requirementUnits } = require('../src/main/localFit');
  const labels = (p) => requirementUnits(W.POSTINGS[p]).units.map((u) => `${u.kind}: ${u.label}`);
  // "Projects involving ITIL, ISO 20000, COBIT": one requirement, any of them.
  assert.ok(labels('tsConsultantBig4').some((l) => /^required: one of .*ITSM/.test(l)), labels('tsConsultantBig4').join(' | '));
  // A long "knowledge of …" list is one requirement asking for range.
  assert.ok(labels('strategyOpsConsultant').some((l) => /^required: several of /.test(l)), labels('strategyOpsConsultant').join(' | '));
  // "Write product requirements" is a duty, not a requirement.
  assert.ok(!labels('seniorPMSaaS').some((l) => /^required: (?:Write|acceptance criteria)/.test(l)), labels('seniorPMSaaS').join(' | '));
  // A manager applying to a consultant-rank role is overqualified; a consultant to a director role is a stretch.
  assert.match(fit('techStrategyManager', 'tsConsultantBig4').headline, /overqualified/);
  assert.match(fit('techStrategyConsultant', 'techConsultingDirector').headline, /^A stretch/);
  // A strategy consultant isn't an accountant, however much Excel they use.
  assert.match(fit('techStrategyConsultant', 'seniorAccountant').headline, /^A different line of work: it asks for experience in accounting/);
});

// Randomly drawn occupations (fixtures/randomJobs.js, randomJobs2.js): the
// person doing each job and other profiles. First passes: 35/52 and, for the
// second batch written after the first batch's fixes, 23/30.
for (const set of ['randomJobs', 'randomJobs2']) {
  test(`random jobs (${set}): the person doing the job reads strong, fits always above non-fits, none far off`, () => {
    const R = require(`./fixtures/${set}`);
    const docs = (r) => (R.RESUMES[r] ? [{ kind: 'resume', text: R.RESUMES[r] }] : C[r]);
    const s = (r, p) => localFitScore(R.POSTINGS[p], docs(r)).score;
    const strong = [];
    const weak = [];
    const wrong = [];
    for (const [r, p, lo, hi, why] of R.BANDS) {
      const v = s(r, p);
      if (v < lo - 15 || v > hi + 15) assert.fail(`${r} → ${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
      if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v}`);
      if (lo >= 70) {
        strong.push(v);
        assert.ok(v >= 60, `${r} → ${p}: ${v} for someone doing the job`);
      }
      if (hi <= 45) weak.push(v);
    }
    assert.ok(Math.min(...strong) > Math.max(...weak), `lowest strong ${Math.min(...strong)}, highest weak ${Math.max(...weak)}`);
    assert.ok(wrong.length <= Math.ceil(R.BANDS.length * 0.2), `${wrong.length} of ${R.BANDS.length} outside their band: ${wrong.join('; ')}`);
    const misordered = R.ORDER.filter(([p, a, b]) => !(s(a, p) > s(b, p)));
    assert.ok(misordered.length <= 2, misordered.map((x) => x.join(' ')).join('; '));
  });
}
