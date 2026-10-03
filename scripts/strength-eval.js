// Deterministic, offline resume quality and timing report for two personas.
//   OUT=/tmp/strength-eval node scripts/strength-eval.js
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { resumeStrength } = require('../src/main/resumeStrength');
const { atsScore } = require('../src/main/atsScore');
const { htmlToText } = require('../src/main/resumeRender');
const analyst = require('../test/fixtures/optimizerAnalyst');
const of = (name) => { const m = require(`../test/fixtures/${name}`); return Object.values(m.POSTINGS || m.P || m); };
const random = [...of('randomJobs'), ...of('randomJobs2')];
const candidates = [
  { name: 'Jordan Reyes', documents: [{ name: 'Impact Statement', kind: 'recommendation', text: fs.readFileSync(path.join(__dirname, '../test/e2e/fixtures/Impact_Statement.txt'), 'utf8') }], resume: fs.readFileSync(path.join(__dirname, '../test/e2e/fixtures/Jordan_Reyes_Resume.txt'), 'utf8'), jobs: [...of('allianceOpportunities'), ...['Consultant', 'Supply Chain Analyst', 'Financial Analyst'].map((title) => random.find((j) => j.title === title))] },
  { name: 'Morgan Chen', documents: [], resume: analyst.resume, jobs: [...analyst.postings, ...analyst.holdouts] },
];
const rows = [];
for (const candidate of candidates) {
  const bank = B.mergeIntoBank(null, B.parseResume(candidate.resume), { id: 'resume' }).bank;
  const profile = { name: candidate.name, email: 'candidate@example.com' };
  for (const job of candidate.jobs) {
    B.optimizeResume({ profile, bank, job, documents: candidate.documents }); // Warm posting caches and the JIT.
    const times = [];
    let opt;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      opt = B.optimizeResume({ profile, bank, job, documents: candidate.documents });
      times.push(performance.now() - start);
    }
    const strength = opt.strength || resumeStrength(opt.doc, job, B.rankBullets(job, bank));
    const ats = atsScore(job, htmlToText(R.renderHtml(R.compact(opt.doc))), { profile });
    rows.push({ candidate: candidate.name, title: job.title, company: job.company || '', ats: ats.score, strength: Math.round(strength.score * 1000) / 10, grade: strength.grade, parts: strength.parts, notes: strength.notes, medianMs: Math.round(times.sort((a, b) => a - b)[1] * 10) / 10, summary: opt.doc.summary, opening: opt.doc.roles[0].bullets.slice(0, 2).map((b) => b.text), pages: opt.pages, checks: opt.checks, evidence: opt.evidence || [], resume: htmlToText(R.renderHtml(R.compact(opt.doc))) });
  }
}
const out = process.env.OUT || '/tmp/jobtrack-strength-eval';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'strength.json'), JSON.stringify(rows, null, 2));
const markdown = ['# Resume optimizer evaluation', '', 'Two fictional candidates; 16 strategy/alliance/analyst postings and six analyst postings, including two held-out titles. Timings are medians of three warm offline runs on this machine, not desktop UI timings.', '', '| Candidate | Posting | ATS | Strength | Summary | ms |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.candidate} | ${r.company} ${r.title} | ${r.ats} | ${r.grade} ${r.strength} | ${r.parts.summary} | ${r.medianMs} |`), '', ...rows.flatMap((r) => [`## ${r.candidate}: ${r.company} ${r.title}`, '', r.summary, '', `Notes: ${r.notes.join(' ') || 'none'}`, '', '```text', r.resume, '```', '', `Evidence sources: ${r.evidence.map((s) => s.name).join(', ') || 'bullet bank'}`, '', `Remaining gaps: ${r.checks.join(' ') || 'none flagged'}`, ''])];
fs.writeFileSync(path.join(out, 'strength.md'), markdown.join('\n'));
console.log(`${rows.length} pages: ${rows.filter((r) => r.grade === 'A').length} A / ${rows.filter((r) => r.grade === 'B').length} B; reports at ${out}`);
