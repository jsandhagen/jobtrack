#!/usr/bin/env node
// Runs every Claude button's prompt against the synthetic candidates in
// test/fixtures and reports how often the output passes the app's own checks
// and how consistent it is from run to run. Use it after changing a prompt.
//
//   ANTHROPIC_API_KEY=... npm run eval:prompts -- --runs 3 --model claude-opus-5-5
//
// It makes real API calls (about 7 per run for the default cases).

const claude = require('../src/main/claude');
const draft = require('../src/main/draft');
const bullets = require('../src/main/bullets');
const P = require('../src/main/prompts');
const { CANDIDATES, POSTINGS } = require('../test/fixtures/fitCases');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const RUNS = Number(opt('runs', 3));
const MODEL = opt('model', undefined);
// [candidate, posting]: a strong fit, a partial fit and a clear mismatch.
const CASES = [
  ['frontend', 'seniorFrontend'],
  ['accountant', 'seniorAccountant'],
  ['nurse', 'icuRN'],
  ['frontend', 'dataAnalyst'],
];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY to run the prompt evals.');
  process.exit(1);
}
const client = claude.createClient(process.env.ANTHROPIC_API_KEY);
let cost = 0;
claude.onUsage((u) => (cost += u.cost || 0));

const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');

function setup(candidateKey) {
  const c = CANDIDATES[candidateKey];
  const documents = c.documents.map((d, i) => ({ name: d.name || `${candidateKey}-${i + 1}.txt`, kind: d.kind, text: d.text }));
  let bank = bullets.emptyBank();
  for (const d of documents) {
    const parsed = bullets.parseResume(d.text);
    if (parsed.experiences.length) bank = bullets.mergeIntoBank(bank, parsed, { id: d.name, name: d.name }).bank;
  }
  return { profile: { name: 'Test Candidate', ...c.profile }, documents, bank };
}

async function evalFit(cand, job) {
  const scores = [];
  let quotes = 0;
  let verified = 0;
  const counts = [];
  for (let i = 0; i < RUNS; i++) {
    const a = await claude.analyzeFit(client, { job, documents: cand.documents, profile: cand.profile, model: MODEL });
    scores.push(a.score);
    counts.push(a.qualifications.length);
    for (const q of a.qualifications) if (q.status !== 'not_met') (quotes++, q.verified && verified++);
  }
  return { scores, spread: spread(scores), requirementCounts: counts, quotesVerified: pct(verified, quotes) };
}

async function evalResume(cand, job) {
  const flags = [];
  const rolesKept = [];
  const lengths = [];
  const fromBank = [];
  const checks = [];
  const library = claude.libraryText(cand.documents, cand.profile);
  for (let i = 0; i < RUNS; i++) {
    const ids = draft.promptIds(cand.bank, []);
    const out = await claude.generateResume(client, { job, documents: cand.documents, profile: cand.profile, roles: ids.roles, picked: [], model: MODEL });
    const res = draft.draftToDoc(out, { bank: cand.bank, profile: cand.profile, library, posting: job.text, ids });
    const all = res.doc.roles.flatMap((r) => r.bullets);
    flags.push(all.filter((b) => b.flag).length);
    fromBank.push(pct(all.filter((b) => b.bulletId).length, all.length));
    rolesKept.push(out.experience.length);
    lengths.push(all.length);
    checks.push(res.checks.length);
    const long = all.filter((b) => b.text.length > 200).length;
    if (long) console.log(`   ⚠ run ${i + 1}: ${long} bullets over two lines`);
  }
  return { bullets: lengths, flaggedBullets: flags, fromBank, rolesReturned: rolesKept, otherChecks: checks };
}

async function evalPolish(cand, job) {
  const list = cand.bank.bullets.slice(0, 8).map((b, i) => ({ id: `0:${i}`, text: b.text, role: 'Role' }));
  const changed = [];
  const held = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await claude.polishBullets(client, { job, bullets: list, documents: cand.documents, profile: cand.profile, model: MODEL });
    changed.push(r.edits.map((e) => e.id).sort().join(','));
    held.push(r.rejected.length);
  }
  const same = changed.every((c) => c === changed[0]);
  return { bulletsSent: list.length, editedIds: changed, sameBulletsEachRun: same, heldBack: held };
}

async function evalLetter(cand, job) {
  const words = [];
  const checks = [];
  const banned = [];
  for (let i = 0; i < RUNS; i++) {
    const l = await claude.generateCoverLetter(client, { job, documents: cand.documents, profile: cand.profile, model: MODEL });
    const text = l.paragraphs.join(' ');
    words.push(text.split(/\s+/).length);
    checks.push(l.checks.length);
    banned.push(/I am writing to express|I am excited to apply|perfect candidate|passionate/i.test(text));
  }
  return { words, untraceableParagraphs: checks, usedBannedPhrase: banned.filter(Boolean).length };
}

(async () => {
  console.log(`Prompt version ${P.PROMPT_VERSION} · ${RUNS} runs per case${MODEL ? ` · ${MODEL}` : ''}\n`);
  for (const [ck, pk] of CASES) {
    const cand = setup(ck);
    const job = POSTINGS[pk];
    console.log(`▶ ${ck} → ${pk}`);
    console.log('  fit   ', JSON.stringify(await evalFit(cand, job)));
    if (pk === CASES.find((c) => c[0] === ck)[1]) {
      console.log('  resume', JSON.stringify(await evalResume(cand, job)));
      console.log('  polish', JSON.stringify(await evalPolish(cand, job)));
      console.log('  letter', JSON.stringify(await evalLetter(cand, job)));
    }
    console.log('');
  }
  console.log(`Total cost ≈ $${cost.toFixed(2)}`);
  console.log('\nWhat good looks like: fit spread ≤ 5 points and ~100% quotes verified; 0 flagged bullets and most bullets from the bank;');
  console.log('polish touching the same bullets each run with nothing held back; letters 250–350 words with no untraceable claims.');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
