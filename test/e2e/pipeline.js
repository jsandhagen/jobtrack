// The scoring pipeline for one candidate against a set of postings, without
// the UI: free fit score, ATS (their own best resume, the untailored bank,
// the free optimizer), the optimized page itself, and "Ask if applicable".
// For grading resume quality and spotting scoring problems; the UI journey
// (journey.js) checks the same things as a person sees them.
//
//   node test/e2e/pipeline.js                      # fictional candidate, fixture postings
//   DOCS=/path/to/documents JOBS=/path/to/postings.json OUT=/tmp/pipeline node test/e2e/pipeline.js
//
// Writes OUT/pipeline.md (scores, optimized resumes, suggestions) and prints a summary.
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const R = (m) => require(path.join(ROOT, 'src', m));
const { Store } = R('main/store');
const { importFile } = R('main/documents');
const { isEvidenceDoc } = R('main/sourceEvidence');
const { localFitScore, shownFit } = R('main/localFit');
const B = R('main/bullets');
const ResumeDoc = R('shared/resumeDoc');
const { htmlToText } = R('main/resumeRender');
const { atsScore, libraryAtsScore } = R('main/atsScore');
const { contactFromResume, contactPatch } = R('main/contact');
const { resumeEnhancements } = R('main/resumeContext');
const { resumeStrength } = R('main/resumeStrength');

const DOCS = process.env.DOCS || path.join(__dirname, 'fixtures');
const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-pipeline-'));
fs.mkdirSync(OUT, { recursive: true });

function loadJobs() {
  if (process.env.JOBS) {
    const raw = /\.json$/i.test(process.env.JOBS) ? JSON.parse(fs.readFileSync(process.env.JOBS, 'utf8')) : require(path.resolve(process.env.JOBS));
    return (Array.isArray(raw) ? raw : Object.values(raw)).filter((p) => p && p.text);
  }
  const of = (f) => { const m = require(path.join(ROOT, 'test/fixtures', f)); return Object.values(m.POSTINGS || m.P || m).filter((p) => p && p.text); };
  return [...of('allianceOpportunities'), ...of('randomJobs'), ...of('randomJobs2')];
}

(async () => {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-pipeline-data-')));
  for (const f of fs.readdirSync(DOCS).filter((x) => /\.(pdf|docx|txt|md)$/i.test(x)).sort()) store.addDocument(await importFile(path.join(DOCS, f)));
  // As importing does: bullets into the bank, contact details into Profile.
  store.updateBank((bank) => {
    let b = bank;
    for (const d of store.allDocuments().filter(isEvidenceDoc)) {
      const parsed = B.parseResume(d.text);
      if (!parsed.experiences.some((e) => e.bullets.length)) continue;
      if (d.kind === 'resume') { const p = contactPatch(store.getProfile(), contactFromResume(d.text)); if (Object.keys(p).length) store.updateProfile(p); }
      b = B.mergeIntoBank(b, parsed, { id: d.id, name: d.name }).bank;
    }
    return b;
  });
  const bank = store.getBank();
  const profile = store.getProfile();
  const evidence = store.allDocuments().filter(isEvidenceDoc);
  const scoring = [...evidence, { kind: 'bank', text: [...bank.bullets.map((b) => b.text), bank.skills.join(', ')].join('\n') }];
  const pageOf = (doc) => htmlToText(ResumeDoc.renderHtml(ResumeDoc.compact(ResumeDoc.normalize({ ...doc, header: ResumeDoc.fillHeader(doc.header, profile) }))));

  const lines = ['# Pipeline run', '', `Documents: ${store.allDocuments().map((d) => `${d.name} (${d.kind}${isEvidenceDoc(d) ? '' : ', not evidence'})`).join(', ')}`, '', `Bank: ${bank.experiences.length} roles, ${bank.bullets.length} bullets`, '', '| Posting | Fit | ATS: own best | untailored | optimized | Strength | ms |', '|---|---|---|---|---|---|---|'];
  const detail = [];
  for (const job of loadJobs()) {
    const q = shownFit(localFitScore(job, scoring, profile));
    const own = libraryAtsScore(job, evidence, profile);
    const base = atsScore(job, pageOf(B.baselineDoc({ profile, bank, job })), { profile });
    const t = Date.now();
    const opt = B.optimizeResume({ profile, bank, job });
    const ms = Date.now() - t;
    const page = pageOf(opt.doc);
    const ats = atsScore(job, page, { profile });
    const strength = resumeStrength(opt.doc, job, { ranked: B.rankBullets(job, bank).ranked });
    const asks = resumeEnhancements({ job, bank, profile, documents: evidence, fit: q.score });
    lines.push(`| ${job.title} (${job.company || ''}) | ${q.score} ${q.label} | ${own ? own.score : '–'} | ${base.score} | ${ats.score}${ats.score < base.score ? ' ⚠️' : ''} | ${strength.grade} (${Math.round(strength.score * 100)}) | ${ms} |`);
    detail.push(`\n## ${job.title} — ${job.company || ''}\n\nFit ${q.score} (${q.label}); missing: ${(q.missingSkills || []).join(', ') || 'none'}; screens: ${(q.screens || []).map((s) => s.reason).join('; ') || 'none'}\n\nATS ${ats.score} ${JSON.stringify(ats.components)}; missing phrases: ${ats.missingKeywords.join(', ')}\n\nStrength ${strength.grade} (${Math.round(strength.score * 100)}): ${JSON.stringify(strength.parts)}; notes: ${strength.notes.join(' ') || 'none'}\n\nOptimizer notes: ${opt.notes.join(' ')} ${opt.checks.join(' ')}\n\nAsk if applicable:\n${asks.map((a) => `- ${a.draft ? '[from documents] ' : ''}${a.text}${a.draft ? `\n  draft: ${a.draft}` : ''}`).join('\n') || '- (none)'}\n\n\`\`\`\n${page.replace(/\n\n+/g, '\n')}\n\`\`\``);
    console.log(`${String(q.score).padStart(3)} ${q.label.padEnd(16)} ATS own ${own ? own.score : '–'} / untailored ${base.score} / optimized ${ats.score}  Strength ${strength.grade} ${Math.round(strength.score * 100)}  ${ms}ms  ${job.title}`);
  }
  fs.writeFileSync(path.join(OUT, 'pipeline.md'), [...lines, ...detail].join('\n'));
  console.log(`\nDetails: ${path.join(OUT, 'pipeline.md')}`);
})().catch((e) => { console.error(e); process.exit(1); });

