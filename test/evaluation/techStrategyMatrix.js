const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const B = require(root + '/src/main/bullets');
const R = require(root + '/src/shared/resumeDoc');
const { atsScore } = require(root + '/src/main/atsScore');
const { htmlToText } = require(root + '/src/main/resumeRender');
const { classifyJobSkills } = require(root + '/src/main/fitScore');
const { requirementUnits } = require(root + '/src/main/localFit');
const { strategyFocus } = require(root + '/src/main/strategyResume');
const { resumeStrength } = require(root + '/src/main/resumeStrength');
const persona = require(root + '/test/fixtures/ctoOfficePersona');
const deep = require(root + '/test/fixtures/techStrategyDeep');
const scenarios = require(root + '/test/fixtures/ctoOfficeScenarios');
const outdir = path.resolve(process.argv[2] || path.join(root, 'tmp/tech-strategy-evaluation'));
fs.mkdirSync(outdir, { recursive: true });
const profiles = [
  { key: 'cto-strategist', name: 'Jordan Avery', source: 'test/fixtures/ctoOfficePersona.js:459', text: persona.RESUMES.ctoOfficeStrategist },
  { key: 'cto-pdf-text', name: 'Jordan Avery (wrapped text)', source: 'test/fixtures/ctoOfficeScenarios.js:354', text: scenarios.RESUMES.ctoOfficePdfText },
  { key: 'strategy-manager', name: 'Dana Whitfield', source: 'test/fixtures/techStrategyDeep.js:192', text: deep.RESUMES.techStrategyManager },
  { key: 'junior-analyst', name: 'Riley Chen', source: 'test/fixtures/techStrategyDeep.js:174', text: deep.RESUMES.juniorAnalyst },
  { key: 'commercial-strategist', name: 'Jordan Reyes', source: 'test/e2e/fixtures/Jordan_Reyes_Resume.txt', text: fs.readFileSync(root + '/test/e2e/fixtures/Jordan_Reyes_Resume.txt', 'utf8') },
];
for (const file of ['techPostings', 'techStrategyDeep', 'realWorld']) {
  for (const [key, text] of Object.entries(require(root + '/test/fixtures/' + file).RESUMES)) {
    if (profiles.some(p => p.text === text)) continue;
    profiles.push({ key: file + '-' + key, name: text.split('\n')[0], source: 'test/fixtures/' + file + '.js', text });
  }
}
const jobs = [...require('./listings'), ...[
  ['repo-octo', persona.POSTINGS.octoStrategyOps],
  ['repo-corporate', persona.POSTINGS.corpStrategyVendor],
  ['repo-emerging', persona.POSTINGS.emergingTechStrategist],
  ['repo-cio', deep.POSTINGS.cioAdvisoryManager],
  ['repo-competitive', persona.POSTINGS.competitiveIntel],
  ['repo-cloud-advisory', require(root + '/test/fixtures/techStrategyHoldout').POSTINGS.cloudAdvisory],
].map(([key, job]) => ({ ...job, key, type: 'repo-fictional-fixture' }))];
for (const file of ['techStrategyHoldout', 'techStrategyNearMiss']) {
  for (const [key, job] of Object.entries(require(root + '/test/fixtures/' + file).POSTINGS).slice(0, 8))
    jobs.push({ ...job, key: file + '-' + key, type: 'repo-fictional-fixture' });
}
fs.writeFileSync(path.join(outdir, 'jobs.json'), JSON.stringify(jobs, null, 2));
const jobAudit = jobs.map(job => ({ key: job.key, title: job.title, type: job.type, url: job.url || null, focus: strategyFocus(job).map(({ key, weight }) => ({ key, weight })), skills: [...classifyJobSkills(job.text)].map(([skill, info]) => ({ skill, ...info })), requirements: requirementUnits(job).units.map(({ key, label, kind, gate }) => ({ key, label, kind, gate })) }));
fs.writeFileSync(path.join(outdir, 'job-extraction.json'), JSON.stringify(jobAudit, null, 2));
const results = [];
for (const candidate of profiles) {
  const profile = { name: candidate.name.replace(' (wrapped text)', ''), email: (candidate.text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/) || ['example@example.com'])[0] };
  const parsed = B.parseResume(candidate.text);
  const bank = B.mergeIntoBank(B.emptyBank(), parsed, { name: candidate.source }).bank;
  const original = JSON.stringify(bank);
  const folder = path.join(outdir, candidate.key);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'source.txt'), candidate.text);
  fs.writeFileSync(path.join(folder, 'parsed.json'), JSON.stringify(parsed, null, 2));
  for (const job of jobs) {
    const baseline = B.baselineDoc({ bank, profile, job });
    const beforeText = htmlToText(R.renderHtml(R.compact(baseline)));
    const before = atsScore(job, beforeText, { profile });
    const output = B.optimizeResume({ bank, profile, job });
    const html = R.renderHtml(R.compact(output.doc));
    const afterText = htmlToText(html);
    const after = atsScore(job, afterText, { profile });
    const units = requirementUnits(job).units.filter(u => u.kind === 'required');
    const met = (text) => units.filter(u => u.match(text.toLowerCase(), text) >= 0.6).map(u => u.label);
    const metBefore = met(beforeText), metAfter = met(afterText);
    const rolesIntact = output.doc.roles.every(role => {
      const source = bank.experiences.find(e => e.id === role.experienceId);
      return source && source.title === role.title && source.organization === role.organization;
    });
    const bulletsIntact = output.doc.roles.flatMap(r => r.bullets).every(b => {
      const source = bank.bullets.find(s => s.id === b.bulletId);
      return source && [source.text, ...(source.variants || [])].includes(b.text);
    });
    assert.equal(JSON.stringify(bank), original, 'source mutation');
    assert.ok(rolesIntact && bulletsIntact, 'source role or bullet changed');
    const rank = B.rankBullets(job, bank);
    const strength = resumeStrength(output.doc, job, { ranked: rank.ranked });
    const originalTextScore = atsScore(job, candidate.text, { profile }).score;
    const row = { candidate: candidate.key, job: job.key, type: job.type, title: job.title, originalTextScore, before: before.score, after: after.score, delta: after.score - before.score, pages: output.pages, skillCount: output.doc.skills.length, skills: output.doc.skills, summary: output.doc.summary, lead: output.doc.roles[0]?.bullets.slice(0, 3).map(b => b.text), requiredUnits: units.length, metBefore, metAfter, lostRequirements: metBefore.filter(x => !metAfter.includes(x)), warnings: output.checks, notes: output.notes, missingSkills: after.missingSkills, strength: { score: Math.round(strength.score * 100), grade: strength.grade }, rolesIntact, bulletsIntact, sourceBankUnchanged: true };
    results.push(row);
    fs.writeFileSync(path.join(folder, job.key + '.html'), html);
    fs.writeFileSync(path.join(folder, job.key + '.md'), R.toMarkdown(output.doc));
    fs.writeFileSync(path.join(folder, job.key + '.json'), JSON.stringify({ job, source: candidate.source, output, metrics: row }, null, 2));
  }
  console.log(candidate.key + ': ' + jobs.length + ' optimized resumes');
}
const imports = profiles.map(p => { const parsed = B.parseResume(p.text); return { key: p.key, source: p.source, roles: parsed.experiences.length, bullets: parsed.experiences.reduce((n,e)=>n+e.bullets.length,0), skills: parsed.skills.length, degrees: parsed.education.length }; });
const report = { commit: process.env.JOBTRACK_EVALUATION_REVISION || 'local', date: '2026-10-07', profiles: profiles.length, jobs: jobs.length, runs: results.length, imports, preservedSources: results.every(r=>r.rolesIntact && r.bulletsIntact && r.sourceBankUnchanged), results };
fs.writeFileSync(path.join(outdir, 'evaluation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ profiles: profiles.length, jobs: jobs.length, runs: results.length, preservedSources: report.preservedSources, lossCases: results.filter(r=>r.lostRequirements.length).length }, null, 2));
