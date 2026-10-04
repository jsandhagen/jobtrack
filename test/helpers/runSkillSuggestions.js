const Module = require('node:module');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const STUB = path.join(__dirname, 'electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) { return req === 'electron' ? STUB : resolve.call(this, req, ...args); };
const cases = require('../fixtures/skillSuggestions');
const R = require('../../src/shared/resumeDoc');
const bank = require('../../src/main/bullets').emptyBank();
const applications = cases.map((c, i) => {
  const id = `a${i}`, experienceId = `e${i}`;
  bank.experiences.push({ id: experienceId, title: 'Analyst', organization: 'Example', start: '2020', end: 'Present' });
  bank.bullets.push({ id: `b${i}`, experienceId, text: c.text, variants: [] });
  if (c.own && !bank.skills.includes(c.own)) bank.skills.push(c.own);
  const doc = R.normalize({ skills: c.own ? [c.own] : [], roles: [{ experienceId, organization: 'Example', title: 'Analyst', dates: '2020 – Present', bullets: [{ bulletId: `b${i}`, text: c.text }] }] });
  return { id, createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(), status: 'applied', saved: true, notes: 'Keep my notes', job: { title: 'Specialist', company: 'Example', text: `Requirements\n- Experience with ${c.term} required` }, builder: { doc }, resumeHtml: R.renderHtml(R.compact(doc)), resumeSource: 'baseline' };
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-skill-suggestions-'));
const file = path.join(dir, 'jobtrack.json');
fs.writeFileSync(file, JSON.stringify({ settings: { clipboardWatch: false }, profile: { name: 'Test Candidate' }, bank, applications }));
process.env.JOBTRACK_DATA_DIR = dir;
const E = require(STUB);
require('../../src/main/main');
E.__ready();
setTimeout(async () => {
  try {
    const call = async (channel, ...args) => JSON.parse(JSON.stringify(await E.__handlers.get(channel)({}, ...args)));
    const originalBank = JSON.stringify(JSON.parse(fs.readFileSync(file)).bank);
    const rows = [];
    for (const [i, c] of cases.entries()) {
      const id = `a${i}`;
      const before = await call('builder:get', id);
      const added = await call('builder:fixPage', id, { addSkill: c.term });
      const after = await call('builder:get', id);
      let repeated, undone;
      if (c.safe) {
        repeated = await call('builder:fixPage', id, { addSkill: c.term });
        undone = await call('builder:undo', id);
      }
      const rec = JSON.parse(fs.readFileSync(file)).applications.find(a => a.id === id);
      rows.push({ name: c.name, safe: !!c.safe, before: before.value.doc, added, after: after.value.doc, repeated, undone, status: rec.status, notes: rec.notes });
    }
    const bankUnchanged = originalBank === JSON.stringify(JSON.parse(fs.readFileSync(file)).bank);
    process.stdout.write(JSON.stringify({ rows, bankUnchanged }), () => process.exit(0));
  } catch (e) { process.stderr.write(e.stack, () => process.exit(1)); }
}, 2500);
