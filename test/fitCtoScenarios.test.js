// Real technology strategy jobs (fixtures/ctoOfficeScenarios.js), found in October
// 2026 and pasted the way people paste them, for the CTO-office persona with real
// Profile constraints (U.S. citizen, no clearance, Washington, DC, travel up to 30%).
//
// First pass: 6 of 14 bands, 6 of 8 screens, 3 of 4 orderings. An 80%-travel
// consulting role read as a 69 strong match (its travel line sat under "Bonus
// points"); a Booz Allen role that only needs U.S. citizenship read as "requires
// an active Secret clearance"; Capital One's "Manager, Process Management (Tech
// Strategy & Operations)" didn't reach the job board; ServiceNow's AI Product
// Strategy & Operations role read 43 (later 28) because its must-haves were two
// soft phrases; and the free summary claimed "process management" (BPM, the
// technology, from the skills list), "ServiceNow" (a competitor they analysed)
// and "management consultant". The misses left are judgment calls noted below.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore } = require('../src/main/localFit');
const { cleanPosting } = require('../src/main/posting');
const { titleMatches } = require('../src/main/careers');
const B = require('../src/main/bullets');
const { atsScore, atsGaps } = require('../src/main/atsScore');
const S = require('./fixtures/ctoOfficeScenarios');
const F = require('./fixtures/ctoOfficePersona');

const asPasted = (k) => {
  const raw = S.POSTINGS[k];
  const c = cleanPosting(raw);
  return { title: c.title || raw.title, company: c.company || raw.company, location: c.location || raw.location, text: c.text };
};
const fit = (k, text = F.RESUMES.ctoOfficeStrategist) => localFitScore(asPasted(k), [{ kind: 'resume', text }], S.PROFILE);

// Kept as written: Microsoft's Account Technology Strategist roles are partly
// sales (consumption and growth with the account team), so the labels are lower
// than the 79 their stated requirements earn; and a Director of technical
// program management reads 44 (a stretch) rather than a different job.
const KNOWN = new Set(['msftSeniorATS', 'msftStrategicATS', 'capOneDirectorTPM']);

test('real tech strategy roles: nearly every band met, none far off', () => {
  const wrong = [];
  for (const [k, lo, hi, why] of S.BANDS) {
    const v = fit(k).score;
    if ((v < lo - 15 || v > hi + 15) && !KNOWN.has(k)) assert.fail(`${k}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${k}: ${v}`);
  }
  assert.ok(wrong.length <= 4, wrong.join('; '));
  const order = S.ORDER.filter(([a, b]) => !(fit(a).score > fit(b).score));
  assert.ok(order.length <= 1, order.map((x) => x.join(' ')).join('; '));
});

test('real tech strategy roles: travel, clearance and commute read the way a recruiter screens them', () => {
  for (const [k, want] of S.SCREENS) {
    const f = fit(k);
    const got = f.dealbreakers.length ? 'dealbreaker' : f.away ? 'move' : 'near';
    assert.equal(got, want, `${k}: ${f.dealbreakers.join('; ')}`);
  }
  assert.match(fit('accentureTSAManager').dealbreakers.join(), /travel up to 80%/i, 'travel under "Bonus points" is still the job\'s travel');
  assert.ok(!fit('boozDigitalTransformation').dealbreakers.length, 'a background investigation is eligibility, not an active clearance');
  assert.match(fit('boozMissionStrategy').dealbreakers.join(), /TS\/SCI/);
});

test('real tech strategy roles reach the job board, bracketed team names included', () => {
  const roles = S.PROFILE.targetRoles.split(',').map((s) => s.trim());
  assert.ok(titleMatches('Manager, Process Management (Tech Strategy & Operations)', roles));
  assert.ok(!titleMatches('Manager, Process Management (Finance Tech)', roles));
  assert.ok(!titleMatches('Software Engineer (Platform)', roles));
  assert.ok(fit('serviceNowAIProductSO').score >= 70, 'its must-haves are not two soft phrases');
});

test('the resume as a PDF\'s wrapped text scores like the resume', () => {
  for (const [k] of S.BANDS) assert.ok(Math.abs(fit(k).score - fit(k, S.RESUMES.ctoOfficePdfText).score) <= 5, k);
});

test('the free summary claims nothing the work history does not show', () => {
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(S.RESUMES.ctoOfficePdfText), { id: 'r', name: 'Resume' }).bank;
  const resume = S.RESUMES.ctoOfficePdfText.toLowerCase().replace(/\s+/g, ' ');
  for (const k of Object.keys(S.POSTINGS)) {
    const s = B.atsSummary(asPasted(k), bank);
    assert.doesNotMatch(s, /process management|ServiceNow|management consultant|years in technical|for the CTO\b(?!,)/, `${k}: ${s}`);
    const items = s.includes('Experience includes ') ? s.replace(/^.*Experience includes /, '').replace(/\.$/, '').split(/, | and /) : [];
    // "tech strategy" is "technology strategy" shortened, as the posting writes it.
    for (const it of items) assert.ok(resume.includes(it.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '').replace(/\btech\b/, 'technology')), `${k}: "${it}" isn't on the resume`);
  }
});

test('ATS gaps group "experience in A, B or C" as one ask, with or without years', () => {
  const msft = atsScore(asPasted('msftSeniorATS'), F.RESUMES.ctoOfficeStrategist, {});
  assert.ok(!msft.knockouts.some((k) => /sales/i.test(k)), msft.knockouts.join('; '));
  const cos = atsGaps(asPasted('msftCoSCTAIO'), F.RESUMES.ctoOfficeStrategist, []).gaps.filter((g) => g.type === 'knockout');
  assert.deepEqual(cos.map((g) => g.phrase), ['operations or program management']);
  const sn = atsGaps(asPasted('serviceNowAIProductSO'), F.RESUMES.ctoOfficeStrategist, []).gaps.map((g) => g.phrase);
  assert.ok(!sn.includes('influencing senior leaders') && !sn.includes('operational excellence'), sn.join(', '));
});
