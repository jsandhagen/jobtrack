// Is Sprout still quick with a big library? Loads a heavy profile (~45
// documents, 500 saved jobs) into the real main process (stub Electron, no
// window) and times what the dashboard calls. Prints JSON.
//
//   node test/e2e/bench-big.js                 # this checkout
//   node test/e2e/bench-big.js /path/to/other  # another checkout (e.g. a git worktree of the last release), same data
//   DOCS=/path/to/documents node test/e2e/bench-big.js
//
// Run the same command on the old and new code and compare; see
// .claude/skills/e2e-testing/SKILL.md for what "still usable" means.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { performance } = require('perf_hooks');

const HERE = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(process.argv[2] || HERE);
const STUB = path.join(HERE, 'test/helpers/electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return req === 'electron' ? STUB : resolve.call(this, req, ...rest);
};

const FIX = path.join(HERE, 'test/fixtures');
const DOCS = process.env.DOCS || path.join(HERE, 'test/e2e/fixtures');

(async () => {
  // The candidate's own documents (text extracted the way the app does), then
  // ~30 more resume versions and long write-ups, as a heavy user keeps them.
  const { importFile } = require(path.join(HERE, 'src/main/documents'));
  const own = [];
  for (const f of fs.readdirSync(DOCS).filter((x) => /\.(pdf|docx|txt|md)$/i.test(x))) own.push(await importFile(path.join(DOCS, f)));
  const persona = require(path.join(FIX, 'ctoOfficePersona'));
  const resumes = [...Object.values(persona.RESUMES || {}), ...fs.readdirSync(path.join(FIX, 'resumes')).map((f) => fs.readFileSync(path.join(FIX, 'resumes', f), 'utf8'))];
  const writeUp = (own.find((d) => d.kind === 'recommendation') || own[0]).text;
  const now = Date.now();
  const docs = own.map((d, i) => ({ id: `own${i}`, name: d.name, kind: d.kind, text: d.text, addedAt: new Date(now - i * 1000).toISOString() }));
  for (let i = 0; i < 30; i++) docs.push({ id: `v${i}`, name: `Resume version ${i + 1}.pdf`, kind: 'resume', text: `${resumes[i % resumes.length]}\n- Version ${i} note: tailored for posting ${i}`, addedAt: new Date(now - (i + 10) * 60000).toISOString() });
  for (let i = 0; i < 8; i++) docs.push({ id: `w${i}`, name: `Performance review ${2019 + i}.pdf`, kind: 'recommendation', text: writeUp.repeat(2), addedAt: new Date(now - (i + 50) * 60000).toISOString() });

  const sets = ['realWorld', 'ctoOfficePersona', 'ctoOfficeOpportunities', 'pmRoles', 'techStrategyDeep', 'techPostings', 'randomJobs', 'randomJobs2', 'longPostings'];
  const postings = sets.flatMap((s) => { try { const m = require(path.join(FIX, s)); return Object.values(m.POSTINGS || m.P || m).filter((p) => p && p.text); } catch { return []; } });
  const apps = Array.from({ length: 500 }, (_, i) => {
    const job = postings[i % postings.length];
    return {
      id: `a${i}`, createdAt: new Date(now - i * 3600000).toISOString(), status: i % 7 ? 'scored' : 'applied', statusHistory: [],
      job: { title: job.title || 'Role', company: `${job.company || 'Co'} ${Math.floor(i / postings.length) || ''}`.trim(), location: job.location || '', text: job.text },
      quick: { score: 50, version: 0 }, analysis: null,
    };
  });
  // Everything imported into the bullet bank, as importing the files does.
  const B = require(path.join(ROOT, 'src/main/bullets'));
  let bank = B.emptyBank();
  for (const d of docs) bank = B.mergeIntoBank(bank, B.parseResume(d.text), { id: d.id, name: d.name }).bank;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-bench-'));
  fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({ settings: { clipboardWatch: false }, profile: { name: 'Jordan Reyes', email: 'j@example.com' }, documents: docs, applications: apps, bank }));
  process.env.JOBTRACK_DATA_DIR = dir;

  const E = require(STUB);
  const t0 = performance.now();
  require(path.join(ROOT, 'src/main/main.js'));
  E.__ready();

  const out = { root: ROOT, docs: docs.length, apps: apps.length };
  const call = async (name, channel, ...args) => {
    const t = performance.now();
    const r = await E.__handlers.get(channel)({}, ...args);
    (out[name] = out[name] || []).push(r.ok ? Math.round(performance.now() - t) : `ERR ${r.error}`);
    await new Promise((res) => setTimeout(res, 30)); // as between clicks: timers (and the probe) run
    return r.value;
  };
  // The longest the main process stays busy: what a click would wait for.
  let worst = 0;
  let last = performance.now();
  const probe = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - 20); last = n; }, 20);
  try {
    await new Promise((r) => setTimeout(r, 50));
    await call('stateAtStart', 'state:get');
    out.startupMs = Math.round(performance.now() - t0);
    for (let i = 0; i < 5; i++) { await call('stateDuringRescore', 'state:get'); await new Promise((r) => setTimeout(r, 300)); }
    const until = Date.now() + 90000;
    for (let done = false; !done && Date.now() < until;) {
      const s = await E.__handlers.get('state:get')({});
      done = s.ok && s.value.applications.every((a) => a.score !== 50);
      if (!done) await new Promise((r) => setTimeout(r, 500));
    }
    out.rescoreAllDoneMs = Math.round(performance.now() - t0);
    out.longestStallStartupMs = Math.round(worst);
    worst = 0;
    await call('state', 'state:get');
    for (const id of ['a0', 'a1', 'a2', 'a3', 'a4']) await call('openJob', 'app:get', id);
    for (const id of ['a0', 'a1', 'a2']) await call('editor', 'builder:get', id);
    for (const id of ['a0', 'a1', 'a2']) await call('optimize', 'app:atsResume', id);
    await call('fixPage', 'builder:fixPage', 'a0', {});
    out.longestStallClicksMs = Math.round(worst);
    worst = 0;
    if (E.__handlers.get('app:haveIt')) await call('haveItYes', 'app:haveIt', { label: 'Roadmapping', id: 'a1', answer: 'yes' });
    await new Promise((r) => setTimeout(r, 3000));
    out.longestStallAfterHaveItMs = Math.round(worst);
  } catch (err) {
    out.crash = err.stack;
  }
  clearInterval(probe);
  out.rssMB = Math.round(process.memoryUsage().rss / 1048576);
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`, () => process.exit(0));
})();
