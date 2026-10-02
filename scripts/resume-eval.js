// How good are the free optimizer's resumes? Builds one for every sample
// resume (and all of a persona's resumes merged, as a big bullet bank) against
// every sample posting, and scores each the way a recruiter and an ATS would:
//   cover   share of the posting's must-haves the page proves
//   ats     the ATS check's score
//   strong  share of bullets that pass every bullet check (verb, result, length, voice, not repeated)
//   repeat  bullets that say much the same as another on the page
//   recent  share of bullets from roles that ended in the last 6 years
//   n       bullets on the page; pages
// Run: node scripts/resume-eval.js [--each] [--matched]
// --matched uses the fixtures' declared plausible matches, not arbitrary cross-persona pairs.
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const C = require('../src/shared/resumeCheck');
const { atsScore } = require('../src/main/atsScore');
const { htmlToText } = require('../src/main/resumeRender');

const SETS = ['ctoOfficePersona', 'ctoOfficeScenarios', 'ctoOfficeHoldout', 'realWorld', 'techStrategyDeep'].map((n) => [n, require(`../test/fixtures/${n}`)]);
const now = new Date().getFullYear();
const yearOf = (s) => Number((String(s || '').match(/(?:19|20)\d{2}/) || [])[0]) || (/present|current/i.test(s || '') ? now : null);

function score(job, bank, profile) {
  const out = B.optimizeResume({ profile, bank, job });
  const { doc } = out;
  const units = B.rankBullets(job, bank).units.filter((u) => u.kind !== 'preferred');
  const pageTexts = [...doc.roles.flatMap((r) => r.bullets.map((b) => `${b.text}\n${r.title}`.toLowerCase())), doc.summary.toLowerCase(), doc.education.map((e) => [e.degree, e.school, ...e.lines.map((l) => l.text)].join('\n')).join('\n').toLowerCase(), doc.certifications.join('\n').toLowerCase()];
  const covered = units.filter((u) => Math.max(0, ...pageTexts.map((t) => u.match(t))) >= 0.6).length;
  const text = htmlToText(R.renderHtml(R.compact(doc)));
  const check = C.checkResume(doc, { jobTitle: job.title });
  const bullets = doc.roles.flatMap((r) => r.bullets.map((b) => ({ ...b, end: yearOf(r.dates.split(/[–-]/).pop()) })));
  const repeats = check.bullets.filter((b) => b.checks.some((c) => c.id === 'fresh' && !c.ok && /Much like/.test(c.label))).length;
  return {
    cover: units.length ? covered / units.length : 1,
    ats: atsScore(job, text, {}).score,
    strong: check.total ? check.strong / check.total : 0,
    repeat: repeats,
    recent: bullets.length ? bullets.filter((b) => b.end && now - b.end <= 6).length / bullets.length : 0,
    n: bullets.length,
    pages: out.pages,
    review: out.checks.length,
  };
}

const rows = [];
for (const [name, F] of SETS) {
  if (!F.RESUMES) continue;
  const resumes = Object.entries(F.RESUMES).filter(([, t]) => typeof t === 'string');
  const banks = resumes.map(([k, t]) => [k, B.mergeIntoBank(B.emptyBank(), B.parseResume(t), { id: k, name: k }).bank]);
  if (resumes.length > 1 && !process.argv.includes('--matched')) banks.push(['ALL', resumes.reduce((bank, [k, t]) => B.mergeIntoBank(bank, B.parseResume(t), { id: k, name: k }).bank, B.emptyBank())]);
  for (const [k, bank] of banks) {
    if (!bank.bullets.length) continue;
    for (const [pk, job] of Object.entries(F.POSTINGS)) {
      if (!job || !job.text) continue;
      if (process.argv.includes('--matched') && !(F.BANDS || []).some(([rk, jk, min]) => rk === k && jk === pk && min >= 60)) continue;
      const s = score(job, bank, { name: 'Jordan Avery', email: 'jordan@example.com', phone: '555-010-0100' });
      rows.push({ set: name, resume: k, posting: pk, ...s });
    }
  }
}
const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
const pct = (v) => `${Math.round(v * 100)}%`;
if (process.argv.includes('--each')) for (const r of rows) console.log(`${r.set}/${r.resume} × ${r.posting}: cover ${pct(r.cover)} ats ${r.ats} strong ${pct(r.strong)} repeat ${r.repeat} recent ${pct(r.recent)} n ${r.n} p${r.pages} review ${r.review}`);
console.log(`${rows.length} resumes · cover ${pct(avg('cover'))} · ats ${avg('ats').toFixed(1)} · strong ${pct(avg('strong'))} · repeats ${avg('repeat').toFixed(2)}/page (${rows.filter((r) => r.repeat).length} pages with any) · recent ${pct(avg('recent'))} · ${avg('n').toFixed(1)} bullets · ${rows.filter((r) => r.pages === 2).length} two-page`);
