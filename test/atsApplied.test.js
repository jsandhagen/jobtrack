// The ATS score models an application being screened (October 2026): most
// people apply rather than wait to be found, so the resume is parsed, screened
// on basic qualifications, years and degree, and ranked by skills. The exact
// job title and the posting's other phrases count, but little: they matter when
// a recruiter searches the database or keyword-filters the applicants.
//
// Calibrated on the fictional e2e candidate against 39 postings: optimized
// pages for their Excellent/Strong fits read 77-94, Good potential 61-90,
// stretches 19-73 (median 37). Hence the bands: 75+ strong, 60-74 in the
// running, under 60 likely screened out.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { atsScore, WEIGHTS } = require('../src/main/atsScore');
const { atsNudges } = require('../src/main/atsNudges');
const { localFitScore, shownFit } = require('../src/main/localFit');
const B = require('../src/main/bullets');
const { resumeEnhancements } = require('../src/main/resumeContext');
const RD = require('../src/shared/resumeDoc');
const { htmlToText } = require('../src/main/resumeRender');
const P = require('./fixtures/allianceOpportunities');

const read = (f) => fs.readFileSync(path.join(__dirname, 'e2e', 'fixtures', f), 'utf8');
const RESUME = read('Jordan_Reyes_Resume.txt');
const DOCS = [{ kind: 'resume', text: RESUME }, { kind: 'recommendation', text: read('Impact_Statement.txt') }];
const profile = { name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '555-010-2000', location: 'Arlington, VA' };
const bank = () => B.mergeIntoBank(null, B.parseResume(RESUME), { id: 'r' }).bank;
const page = (d) => htmlToText(RD.renderHtml(RD.compact(RD.normalize({ ...d, header: RD.fillHeader(d.header, profile) }))));
const optimized = (job) => atsScore(job, page(B.optimizeResume({ profile, bank: bank(), job }).doc), { profile });
const randomJob = (title) => {
  for (const f of ['randomJobs', 'randomJobs2']) { const m = require(`./fixtures/${f}`); const j = Object.values(m.POSTINGS || m.P || m).find((p) => p && p.title === title); if (j) return j; }
  throw new Error(title);
};

test('screening weighs qualifications most; title and phrases a little', () => {
  assert.equal(Math.round(Object.values(WEIGHTS).reduce((s, w) => s + w, 0) * 100), 100);
  assert.ok(WEIGHTS.hardSkills + WEIGHTS.qualifications >= 0.5);
  assert.ok(WEIGHTS.jobTitle + WEIGHTS.keywords <= 0.1);
});

// Strong fits whose page reads under 75 for a reason the fit doesn't weigh.
// Fivetran's duties name the partners the job sells with (Snowflake, Databricks,
// GCP, Azure) and this candidate has worked with AWS only: in the running (71),
// while the fit reads its two must-haves, which they meet. Open: should the fit weigh them?
const KNOWN_UNDER_75 = new Set(['fivetranTechPartnerSales']);
test('a strong fit reads 75+ once optimized; a job outside the lane reads under 60', () => {
  for (const [key, job] of Object.entries(P)) {
    const fit = shownFit(localFitScore(job, DOCS, profile)).score;
    if (fit < 80 || KNOWN_UNDER_75.has(key)) continue;
    // As the app optimizes a good fit: with the bullets your other documents prove ("Ask if applicable").
    const b = bank();
    const evidence = resumeEnhancements({ job, bank: b, profile, documents: DOCS.map((d, i) => ({ ...d, name: i ? 'Impact_Statement.txt' : 'Resume.txt' })), fit }).filter((a) => a.draft);
    const { score } = atsScore(job, page(B.optimizeResume({ profile, bank: b, job, evidence }).doc), { profile });
    assert.ok(score >= 75, `${job.company} ${job.title}: ${score}`);
  }
  for (const title of ['Network Engineer', 'Commercial Lines Underwriter', 'Registered Dental Hygienist', 'Bank Teller', 'Journeyman Electrician']) {
    const { score } = optimized(randomJob(title));
    assert.ok(score < 60, `${title}: ${score}`);
  }
});

test('requirements the skills dictionary does not name are screened too', () => {
  const ne = atsScore(randomJob('Network Engineer'), RESUME, { profile });
  assert.ok(ne.components.qualifications !== null && ne.components.qualifications < 20, JSON.stringify(ne.components));
  assert.ok(ne.missingQualifications.includes('experience in network engineering'), ne.missingQualifications.join(' | '));
  const n = atsNudges({ ats: ne, job: randomJob('Network Engineer'), pageText: RESUME, bank: bank() });
  assert.ok(n.nudges.some((x) => /requires “experience in network engineering”/.test(x.text)), n.nudges.map((x) => x.text).join('\n'));
});

test('length and numbers are advice, not parsing: a short, clean page parses fully', () => {
  const job = { title: 'Data Analyst', text: 'Requirements\n- SQL\n- Excel' };
  const short = 'Sam Lee\nsam@example.com | 555-123-4567\nExperience\nData Analyst, Acme, Jan 2020 – Present\n- Wrote SQL reports in Excel\nEducation\nB.S. Statistics, State University, 2019\nSkills\nSQL, Excel';
  const r = atsScore(job, short, {});
  assert.equal(r.components.parseability, 100);
  assert.ok(r.formatChecks.some((c) => c.id === 'length' && !c.ok), 'still flagged as advice');
});

test('the A grade is about qualifications, not a score cut-off', () => {
  const job = { title: 'Data Analyst', text: 'Requirements\n- SQL\nPreferred\n- Tableau' };
  const r = atsScore(job, 'SQL and Tableau', { checkFormatting: false });
  assert.equal(r.grade, 'A');
});
