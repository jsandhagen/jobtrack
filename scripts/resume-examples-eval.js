// Run the real import + one-click optimizer on a user's examples and local
// snapshots of employer listings. No API calls or candidate uploads.
// node scripts/resume-examples-eval.js --listings <jobs.json> --out <directory>
// A job record: {key,title,company,location,url,text}. --examples defaults to examples/.
const fs = require('node:fs');
const path = require('node:path');
const D = require('../src/main/documents');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { htmlToText } = require('../src/main/resumeRender');
const { atsScore } = require('../src/main/atsScore');
const { isEvidenceDoc } = require('../src/main/sourceEvidence');
const arg = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };

async function main() {
  if (!arg('--listings') || !arg('--out')) throw new Error('Supply --listings <jobs.json> and --out <directory>.');
  const examples = path.resolve(arg('--examples') || 'examples');
  const outdir = path.resolve(arg('--out'));
  const jobs = JSON.parse(fs.readFileSync(arg('--listings'), 'utf8'));
  let bank = B.emptyBank();
  const imports = [];
  const documents = [];
  for (const name of fs.readdirSync(examples).filter((name) => D.SUPPORTED.includes(path.extname(name).toLowerCase()))) {
    const d = await D.importFile(path.join(examples, name));
    documents.push(d);
    const p = B.parseResume(d.text);
    if (isEvidenceDoc(d) && d.kind === 'resume') bank = B.mergeIntoBank(bank, p, { name }).bank;
    imports.push({ name, kind: d.kind, evidence: isEvidenceDoc(d), roles: p.experiences.length, bullets: p.experiences.reduce((n, e) => n + e.bullets.length, 0), skills: p.skills.length });
  }
  const contact = documents.find((d) => d.kind === 'resume' && /@/.test(d.text));
  const first = contact ? contact.text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4) : [];
  const profile = arg('--profile') ? JSON.parse(fs.readFileSync(arg('--profile'), 'utf8')) : {
    name: first[0] || '', email: (first.join(' ').match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/) || [''])[0],
    phone: (first.join(' ').match(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/) || [''])[0], location: (first[1] || '').split('|')[0].trim(),
  };
  fs.mkdirSync(outdir, { recursive: true });
  const results = jobs.map((job) => {
    const optimized = B.optimizeResume({ bank, job, profile, pages: arg('--pages') || 'auto' });
    const html = R.renderHtml(R.compact(optimized.doc));
    const ats = atsScore(job, htmlToText(html), { profile });
    const key = String(job.key || job.title).replace(/[^a-z0-9_-]/gi, '-');
    fs.writeFileSync(path.join(outdir, key + '.html'), html);
    fs.writeFileSync(path.join(outdir, key + '.md'), R.toMarkdown(optimized.doc));
    console.log(JSON.stringify({ key, title: job.title, score: ats.score, grade: ats.grade, pages: optimized.pages, checks: optimized.checks, first: optimized.doc.roles[0]?.bullets.slice(0, 3).map((b) => b.text), summary: optimized.doc.summary, skills: optimized.doc.skills }));
    return { job, ...optimized, ats: { score: ats.score, grade: ats.grade }, sourceBullets: optimized.doc.roles.flatMap((r) => r.bullets).map((b) => ({ id: b.bulletId, source: bank.bullets.find((s) => s.id === b.bulletId)?.source })) };
  });
  fs.writeFileSync(path.join(outdir, 'evaluation.json'), JSON.stringify({ imports, bank: { roles: bank.experiences.length, bullets: bank.bullets.length }, results }, null, 2));
  console.log(JSON.stringify({ imports, bank: { roles: bank.experiences.length, bullets: bank.bullets.length } }));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
