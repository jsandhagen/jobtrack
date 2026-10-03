const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { resumeStrength } = require('../src/main/resumeStrength');
const { repeatOf } = require('../src/shared/resumeCheck');
const { atsScore } = require('../src/main/atsScore');
const { htmlToText } = require('../src/main/resumeRender');
const alliance = require('./fixtures/allianceOpportunities');
const analyst = require('./fixtures/optimizerAnalyst');
const bankOf = (text) => B.mergeIntoBank(null, B.parseResume(text), { id: 'resume' }).bank;
const jordan = bankOf(fs.readFileSync(path.join(__dirname, 'e2e/fixtures/Jordan_Reyes_Resume.txt'), 'utf8'));
const morgan = bankOf(analyst.resume);
const profile = { name: 'Candidate', email: 'candidate@example.com' };
const random = ['randomJobs', 'randomJobs2'].flatMap((f) => { const m = require(`./fixtures/${f}`); return Object.values(m.POSTINGS || m.P || m); });
const randomJob = (title) => random.find((p) => p.title === title);
const evaluate = (bank, job) => {
  const opt = B.optimizeResume({ profile, bank, job });
  const strength = resumeStrength(opt.doc, job, B.rankBullets(job, bank));
  const ats = atsScore(job, htmlToText(R.renderHtml(R.compact(opt.doc))), { profile });
  return { opt, strength, ats };
};
const checkPage = (bank, job) => {
  const snapshot = JSON.stringify(bank);
  const result = evaluate(bank, job);
  const minimum = ['A-LIGN', 'Zendesk'].includes(job.company) ? 0.58 : 0.72; // These bank-only pages lack essential role proof.
  assert.ok(result.strength.score >= minimum, `${job.title}: ${JSON.stringify(result.strength)}`);
  assert.ok(!result.strength.notes.includes('The summary repeats your first bullet.'), `${job.title}: ${result.opt.doc.summary}`);
  assert.ok(R.fits(result.opt.doc, result.opt.pages), `${job.title}: page limit`);
  const bullets = result.opt.doc.roles.flatMap((r) => r.bullets.map((b) => b.text));
  for (let i = 0; i < bullets.length; i++) {
    assert.ok(bank.bullets.some((b) => !b.hidden && b.text === bullets[i]), 'bullet must be documented');
    for (const other of bullets.slice(i + 1)) assert.ok(!repeatOf(bullets[i], other), `${job.title}: repeated accomplishment`);
  }
  assert.equal(JSON.stringify(bank), snapshot, 'the source bank must stay intact');
  return result;
};

for (const job of [...Object.values(alliance), ...['Consultant', 'Supply Chain Analyst', 'Financial Analyst'].map(randomJob)]) {
  test(`strategy candidate: ${job.company || ''} ${job.title}`, () => checkPage(jordan, job));
}
for (const job of [...analyst.postings, ...analyst.holdouts]) {
  test(`analyst candidate and adjacent roles: ${job.title}`, () => {
    const result = checkPage(morgan, job);
    assert.ok(result.ats.score >= 75, `${job.title}: ATS ${result.ats.score}`);
    assert.equal(result.strength.parts.summary, 1, result.opt.doc.summary);
    assert.doesNotMatch(result.opt.doc.summary, /technology partnerships professional/i);
  });
}

test('analyst summaries improve for the original candidate as well', () => {
  for (const title of ['Supply Chain Analyst', 'Financial Analyst']) {
    const result = evaluate(jordan, randomJob(title));
    assert.equal(result.strength.parts.summary, 1, `${title}: ${result.opt.doc.summary}`);
  }
});

test('unsupported requirements remain missing and are never added to the page', () => {
  const result = evaluate(morgan, analyst.unsupported);
  assert.ok(result.strength.parts.mustHaves < 1);
  assert.ok(result.ats.missingSkills.length > 0);
  assert.doesNotMatch(JSON.stringify(result.opt.doc), /Snowflake|\bdbt\b/i);
});

test('hidden achievements never supply a generated summary', () => {
  const { strategySummary } = require('../src/main/strategyResume');
  const job = { title: 'Strategy Manager', text: 'Competitive intelligence and market research.' };
  const doc = { roles: [{ experienceId: 'e', title: 'Consultant', organization: 'Cedar', bullets: [] }] };
  const text = 'Led competitive intelligence across 100 markets';
  const summary = strategySummary(job, doc, [{ id: 'hidden', experienceId: 'e', score: 10, text, hidden: true, strategy: [{ key: 'competition' }] }]);
  assert.ok(!summary.includes(text));
});
