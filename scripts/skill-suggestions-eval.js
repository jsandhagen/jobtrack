// Offline evaluation of the suggestions, rewordings and picked skill grid.
// node scripts/skill-suggestions-eval.js --out <directory>
// Optional real cases: --state <saved-state.json> --resumes <directory of {job,doc} JSON>
// Keep real candidate inputs and outputs outside the repository.
const fs = require('node:fs'), path = require('node:path');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { htmlToText } = require('../src/main/resumeRender');
const { atsScore, postingRewords } = require('../src/main/atsScore');
const { atsNudges } = require('../src/main/atsNudges');
const { resumeEnhancements } = require('../src/main/resumeContext');
const { isEvidenceDoc } = require('../src/main/sourceEvidence');
const cases = require('../test/fixtures/skillSuggestions');
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const output = arg('--out') && path.resolve(arg('--out'));
if (output) fs.mkdirSync(output, { recursive: true });
function evaluate(job, bank, doc, profile = {}) {
  const html = R.renderHtml(R.compact(doc));
  const pageText = htmlToText(html);
  const ats = atsScore(job, pageText, { profile });
  const ns = atsNudges({ ats, job, pageText, bank, doc });
  return { skills: doc.skills, picked: B.pickSkills(job, bank), nudges: [...ns.nudges, ...ns.later], rewords: postingRewords(job, doc), ats: ats.score, pages: R.measure(doc).pages };
}
const adversarial = cases.map(c => {
  const job = { title: 'Specialist', text: `Requirements\n- Experience with ${c.term} required` };
  const bank = { ...B.emptyBank(), skills: c.own ? [c.own] : [], experiences: [{ id: 'e', title: 'Analyst', organization: 'Example', start: '2020', end: 'Present' }], bullets: [{ id: 'b', experienceId: 'e', text: c.text, variants: [] }] };
  const doc = R.normalize({ skills: bank.skills, roles: [{ title: 'Analyst', organization: 'Example', dates: '2020 – Present', experienceId: 'e', bullets: [{ bulletId: 'b', text: c.text }] }] });
  const original = JSON.stringify({ bank, doc });
  const result = evaluate(job, bank, doc);
  const adds = result.nudges.filter(n => n.action?.type === 'add-skill');
  const pass = c.safe ? adds.length > 0 && result.rewords.length > 0
    : adds.length === 0 && result.rewords.length === 0 && !result.picked.all.some(s => s.toLowerCase() === c.term.toLowerCase());
  if (JSON.stringify({ bank, doc }) !== original) throw new Error('Suggestion mutated source data');
  return { ...c, ...result, pass };
});
const real = [];
if (arg('--state') || arg('--resumes')) {
  if (!arg('--state') || !arg('--resumes')) throw new Error('Supply --state and --resumes together.');
  const state = JSON.parse(fs.readFileSync(arg('--state'), 'utf8'));
  const bank = state.bank, profile = state.profile;
  const original = JSON.stringify(bank);
  for (const name of fs.readdirSync(arg('--resumes')).filter(n => n.endsWith('.json'))) {
    const input = JSON.parse(fs.readFileSync(path.join(arg('--resumes'), name), 'utf8'));
    if (!input.job || !input.doc) continue;
    const job = input.job;
    const context = resumeEnhancements({ job, bank, profile, documents: (state.documents || []).filter(isEvidenceDoc) });
    const optimized = B.optimizeResume({ job, bank, profile, evidence: context.filter(x => x.draft) });
    const doc = R.normalize({ ...optimized.doc, header: R.fillHeader(optimized.doc.header, profile) });
    const row = { company: job.company, title: job.title, ...evaluate(job, bank, doc, profile) };
    real.push(row);
    if (output) {
      const slug = job.company.toLowerCase().replace(/\W+/g, '-');
      fs.writeFileSync(path.join(output, slug + '.html'), R.renderHtml(R.compact(doc)));
      fs.writeFileSync(path.join(output, slug + '.json'), JSON.stringify({ job, doc }, null, 2));
    }
  }
  if (JSON.stringify(bank) !== original) throw new Error('Optimizer mutated source bank');
}
const report = { cases: adversarial.length, passed: adversarial.filter(c => c.pass).length, adversarial, real, sourceBankUnchanged: true };
if (output) fs.writeFileSync(path.join(output, 'evaluation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, cases: report.cases, passed: report.passed, failed: adversarial.filter(c => !c.pass).map(c => c.name), real: real.map(r => ({ company: r.company, skills: r.skills, add: r.nudges.filter(n => n.action?.type === 'add-skill').map(n => n.action.term), ats: r.ats, pages: r.pages })), sourceBankUnchanged: true }, null, 2));
