const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toShown, shownLabel, BANDS, SCALE } = require('../src/shared/fitScale');
const { fitLabel } = require('../src/main/fitScore');
const { shownFit } = require('../src/main/localFit');
const { Store } = require('../src/main/store');
const { liftSavedAnalysis, scoreFromQualifications } = require('../src/main/claude');
const { generous } = require('../src/main/localFit');

test('the shown fit reads like a grade: a strong match lands in the 80s', () => {
  assert.deepEqual([0, 45, 65, 80, 100].map(toShown), [0, BANDS.good, BANDS.strong, BANDS.excellent, 100]);
  assert.ok(toShown(69) >= 80 && toShown(69) < 90, 'Sadia\'s 69 "Strong match" reads as a B');
  for (let s = 0; s <= 100; s++) {
    assert.equal(shownLabel(toShown(s)), fitLabel(s), `same label at ${s}`);
    if (s) assert.ok(toShown(s) >= toShown(s - 1), 'never reorders two jobs');
  }
  for (const s of [44.9, 45, 64.9, 65, 79.9, 80]) assert.equal(shownLabel(toShown(s)), fitLabel(s));
});

test('shownFit puts the generous score on the shown scale and keeps the calibrated one', () => {
  const q = shownFit({ score: 62, label: fitLabel(62), screens: [] });
  assert.equal(q.calibratedScore, 62);
  assert.equal(q.scale, SCALE);
  assert.ok(q.score >= 80, `a 62 lifts to Strong (${q.score})`);
  assert.equal(q.label, shownLabel(q.score));
  const capped = shownFit({ score: 30, label: 'Dealbreaker', dealbreakers: ['On-site only'] });
  assert.equal(capped.label, 'Dealbreaker');
  assert.ok(capped.score < BANDS.good, 'a dealbreaker stays a stretch');
  assert.deepEqual(shownFit(q), q, 'a displayed score is not converted twice');
});

test('saved scores move onto the shown scale once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitscale-'));
  fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({
    applications: [{ id: 'a', createdAt: '2026-01-01', quick: { score: 69 }, analysis: { score: 80 } }],
    companies: [{ id: 'c', jobs: [{ id: 'j', fit: { score: 45 } }] }],
    settings: { roleSearch: { minFit: 70 }, popupThreshold: 45, claudeFitThreshold: 65 },
  }));
  const store = new Store(dir);
  assert.equal(store.migrateFitScale({ toShown, SCALE }), true);
  const a = store.getApplication('a');
  assert.deepEqual([a.quick.score, a.analysis.score, store.list('companies')[0].jobs[0].fit.score], [toShown(69), 90, 65]);
  assert.equal(store.getSettings().roleSearch.minFit, 80);
  assert.equal(store.getSettings().popupThreshold, 65);
  assert.equal(store.getSettings().claudeFitThreshold, 80);
  assert.equal(store.migrateFitScale({ toShown, SCALE }), false, 'nothing moves twice');
  assert.equal(store.getApplication('a').quick.score, toShown(69));
  assert.equal(a.quick.calibratedScore, 69);
  // A fresh company preview must keep its marker when written to the board,
  // or the next app start would treat it as an old calibrated score.
  store.saveItem('companies', { id: 'c', jobs: [{ id: 'fresh', fit: { score: 83, scale: SCALE, calibratedScore: 69 } }] });
  assert.equal(store.migrateFitScale({ toShown, SCALE }), false);
  assert.equal(store.list('companies')[0].jobs[0].fit.score, 83);
});

test('company previews persist their scale marker through the app projection', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/main/main.js'), 'utf8');
  const block = source.slice(source.indexOf('function previewScorer'), source.indexOf('// silent:'));
  const projection = block.match(/const fit = (\{[^\n]+\});/);
  assert.ok(projection, 'company preview projection is present');
  const q = shownFit({ score: 69, label: fitLabel(69), screens: [], dealbreakers: [] });
  const fit = require('node:vm').runInNewContext('(' + projection[1] + ')', { q });
  assert.equal(fit.scale, SCALE);
  assert.equal(fit.calibratedScore, 69);
});

test('saved Claude scores are lifted like new ones, once, and a screened score stays put', () => {
  const quals = [
    { type: 'basic', status: 'met' },
    { type: 'basic', status: 'partial' },
    { type: 'preferred', status: 'not_met' },
  ];
  const raw = scoreFromQualifications(quals);
  const lifted = generous(raw);
  assert.ok(lifted > raw, `the checklist lifts (${raw} -> ${lifted})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlift-'));
  fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({
    applications: [
      // Saved before the scale: the migration moves it without the lift.
      { id: 'old', createdAt: '2026-01-01', analysis: { score: raw, qualifications: quals, screened: [] } },
      // Saved after the lift but with calibratedScore holding the lifted score.
      { id: 'mid', createdAt: '2026-01-01', analysis: { score: toShown(lifted), calibratedScore: lifted, scale: SCALE, qualifications: quals, screened: [] } },
      // Held down by a screen below the checklist.
      { id: 'cap', createdAt: '2026-01-01', analysis: { score: raw - 10, qualifications: quals, screened: ['Overqualified'] } },
    ],
    settings: {},
  }));
  const store = new Store(dir);
  store.migrateFitScale({ toShown, SCALE });
  assert.equal(store.liftClaudeScores(liftSavedAnalysis), true);
  for (const id of ['old', 'mid']) {
    const a = store.getApplication(id).analysis;
    assert.deepEqual([a.score, a.calibratedScore, a.label], [toShown(lifted), raw, fitLabel(lifted)], id);
  }
  const cap = store.getApplication('cap').analysis;
  assert.deepEqual([cap.score, cap.calibratedScore], [toShown(raw - 10), raw - 10]);
  assert.equal(store.liftClaudeScores(liftSavedAnalysis), false, 'runs once');
  assert.equal(store.getApplication('old').analysis.score, toShown(lifted), 'never lifted twice');
});
