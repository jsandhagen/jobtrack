// Real main-process editor reads/saves, with a large bank and a small page.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const stub = path.join(__dirname, 'electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) { return req === 'electron' ? stub : resolve.call(this, req, ...rest); };
const B = require('../../src/main/bullets');
const R = require('../../src/shared/resumeDoc');
const F = require('../fixtures/ctoOfficePersona');
const { SCORER_VERSION } = require('../../src/main/localFit');
const rank = B.rankBullets;
let rankCalls = 0;
let tagCalls = 0;
B.rankBullets = (...args) => { rankCalls++; return rank(...args); };
const tags = B.skillTags;
B.skillTags = (...args) => { tagCalls++; return tags(...args); };
const original = B.mergeIntoBank(B.emptyBank(), B.parseResume(F.RESUMES.ctoOfficeStrategist)).bank;
const bank = { ...original, experiences: [], bullets: [] };
for (let i = 0; i < 20; i++) {
  const experience = original.experiences[i % original.experiences.length];
  bank.experiences.push({ ...experience, id: `r${i}`, organization: `Organization ${String.fromCharCode(65 + i).repeat(4)}` });
  for (let j = 0; j < 30; j++) {
    const bullet = original.bullets[j % original.bullets.length];
    const text = `${bullet.text} for division ${i}, program ${j}.`;
    bank.bullets.push({ ...bullet, id: `b${i}-${j}`, experienceId: `r${i}`, text, variants: [text.replace('division', 'team'), text.replace('program', 'initiative')] });
  }
}
const profile = { name: 'Jordan Avery', email: 'jordan@example.com' };
const job = F.POSTINGS.chiefOfStaffCTO;
const doc = B.baselineDoc({ bank: original, profile, job });
doc.roles.forEach((r, i) => { Object.assign(r, bank.experiences[i], { experienceId: `r${i}` }); r.bullets.forEach((b, j) => { b.bulletId = `b${i}-${j}`; }); });
const now = new Date().toISOString();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-editor-perf-'));
fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({
  settings: { clipboardWatch: false }, profile, bank,
  applications: [{ id: 'app', createdAt: now, status: 'scored', job, quick: { score: 80, version: SCORER_VERSION }, builder: { doc }, resumeHtml: R.renderHtml(doc) }],
}));
process.env.JOBTRACK_DATA_DIR = dir;
const E = require(stub);
require('../../src/main/main');
E.__ready();
setImmediate(async () => {
  const out = {};
  const call = async (name, channel, ...args) => {
    const before = rankCalls;
    const beforeTags = tagCalls;
    const start = performance.now();
    const r = await E.__handlers.get(channel)({}, ...args);
    out[name] = { ok: r.ok, error: r.error, ms: Math.round(performance.now() - start), ranks: rankCalls - before, tags: tagCalls - beforeTags };
    return r.value;
  };
  try {
    const first = await call('open', 'builder:get', 'app');
    out.open.bankSize = first.bankSize;
    const second = await call('reopen', 'builder:get', 'app');
    out.reopen.same = JSON.stringify(first) === JSON.stringify(second);
    await call('detail', 'app:get', 'app');
    const edited = JSON.parse(JSON.stringify(first.doc));
    edited.summary += ' Executive communications.';
    const saved = await call('summarySave', 'builder:save', 'app', edited);
    out.summarySave.summary = saved.doc.summary;
    const role = edited.roles[0];
    role.title = 'Chief of Staff';
    const roleSaved = await call('roleSave', 'builder:save', 'app', edited);
    out.roleSave.title = roleSaved.doc.roles[0].title;
    const savedBank = await call('bankAfterRole', 'bank:get');
    out.bankAfterRole.title = savedBank.experiences.find((e) => e.id === role.experienceId).title;
    const cachedBank = await call('cachedBank', 'bank:get');
    out.cachedBank.same = JSON.stringify(savedBank) === JSON.stringify(cachedBank);
    await call('bulletEdit', 'bank:updateBullet', 'b0-0', { text: 'Led executive planning and portfolio reviews for the CTO office.' });
    await call('afterBulletEdit', 'builder:get', 'app');
    await call('afterBulletRead', 'builder:get', 'app');
    const editedBank = await call('bankAfterBullet', 'bank:get');
    out.bankAfterBullet.text = editedBank.bullets.find((b) => b.id === 'b0-0').text;
    await call('jobEdit', 'app:update', 'app', { job: { title: 'Strategy Director' } });
    const beforeHide = await call('afterJobEdit', 'builder:get', 'app');
    out.afterJobEdit.offered = beforeHide.roles.some((r) => r.more.some((b) => b.bulletId === 'b0-29'));
    await call('hideBullet', 'bank:updateBullet', 'b0-29', { hidden: true });
    const hidden = await call('afterHide', 'builder:get', 'app');
    out.afterHide.offered = hidden.roles.some((r) => r.more.some((b) => b.bulletId === 'b0-29'));
  } catch (error) { out.crash = error.stack; }
  // Exit once the output is written (a macOS pipe takes it asynchronously).
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
});
