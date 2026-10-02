// Exercise real IPC handlers with enough saved resumes to expose global work
// accidentally performed by an ordinary add/delete and its state refresh.
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const stub = path.join(__dirname, 'electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return req === 'electron' ? stub : resolve.call(this, req, ...rest);
};

const B = require('../../src/main/bullets');
const R = require('../../src/shared/resumeDoc');
const F = require('../fixtures/ctoOfficePersona');
const { SCORER_VERSION } = require('../../src/main/localFit');
const ats = require('../../src/main/atsScore');
const counts = { library: 0, page: 0 };
const scoredJobs = [];
for (const [key, name] of [['library', 'libraryAtsScore'], ['page', 'atsScore']]) {
  const original = ats[name];
  ats[name] = (...args) => { counts[key]++; if (key === 'library') scoredJobs.push(args[0].text); return original(...args); };
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-responsive-'));
const now = new Date().toISOString();
const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(F.RESUMES.ctoOfficeStrategist)).bank;
const doc = B.baselineDoc({ bank, profile: {}, job: {} });
const postings = Object.values(F.POSTINGS);
const applications = Array.from({ length: 80 }, (_, i) => ({
  id: `a${i}`, createdAt: now, status: 'scored', statusHistory: [],
  job: { ...postings[i % postings.length], text: `${postings[i % postings.length].text}\nJob reference ${i}` },
  quick: { score: 70, label: 'Good fit', version: SCORER_VERSION },
  builder: { doc }, resumeHtml: R.renderHtml(doc), resumeSource: 'baseline',
}));
const documents = Array.from({ length: 12 }, (_, i) => ({
  id: `d${i}`, name: `Resume ${i}`, kind: 'resume', addedAt: now,
  text: `${F.RESUMES.ctoOfficeStrategist}\nVersion ${i}`,
}));
const resumes = ['read', 'export', 'copy', 'save', 'legacy', 'stale'].map((id) => ({
  id, name: `Resume ${id}`, createdAt: now, job: postings[0],
  builder: { doc: { ...doc, header: { name: id === 'copy' ? 'J. Avery' : '', line1: id === 'copy' ? 'Remote' : '', line2: '' } } },
  resumeHtml: R.renderHtml(doc), resumeSource: 'baseline',
}));
resumes.find((r) => r.id === 'legacy').builder = undefined;
resumes.find((r) => r.id === 'legacy').resume = { name: '', contact: [], summary: 'Experienced strategist', experience: [], skills: [], education: [] };
resumes.find((r) => r.id === 'stale').builder.doc.header = { name: 'J. Avery', line1: 'Remote', line2: 'custom@example.com' };
fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({
  settings: { clipboardWatch: false }, profile: { name: 'Jordan Avery', email: 'j@example.com' },
  bank, documents, applications, resumes,
}));
process.env.JOBTRACK_DATA_DIR = dir;
const E = require(stub);
E.dialog = { showSaveDialog: async () => ({ filePath: path.join(dir, 'export.html') }) };
const broadcasts = [];
const OriginalWindow = E.BrowserWindow;
E.BrowserWindow = class extends OriginalWindow {
  constructor(...args) { super(...args); this.webContents.send = (channel) => broadcasts.push(channel); }
};
require('../../src/main/main');
E.__ready();
setImmediate(async () => {
  const out = {};
  const call = async (name, channel, ...args) => {
    const before = { ...counts };
    const start = performance.now();
    const result = await E.__handlers.get(channel)({}, ...args);
    out[name] = { ok: result.ok, error: result.error, ms: Math.round(performance.now() - start),
      libraryReads: counts.library - before.library, pageReads: counts.page - before.page };
    return result.value;
  };
  const waitForScores = async () => {
    const deadline = performance.now() + 10000;
    let state;
    do {
      await new Promise((resolve) => setTimeout(resolve, 5));
      state = (await E.__handlers.get('state:get')({})).value;
      if (state.applications.every((a) => a.atsAfter !== null)) return state;
    } while (performance.now() < deadline);
    throw new Error('Background list scores never finished');
  };
  try {
    await call('initialState', 'state:get');
    await call('add', 'docs:addText', { name: 'Notes', kind: 'other', text: 'Built a forecasting dashboard using SQL and Python.' });
    await call('afterAdd', 'state:get');
    await call('remove', 'docs:remove', 'd0');
    const state = await call('afterRemove', 'state:get');
    out.afterRemove.applications = state.applications.length;
    await call('removeApplication', 'app:remove', 'a79');
    await call('afterRemoveApplication', 'state:get');
    const complete = await waitForScores();
    out.background = { ok: true, reads: counts.library, deletedWasScored: scoredJobs.some((s) => s.endsWith('Job reference 79')),
      broadcast: broadcasts.includes('state-changed'), before: complete.applications[0].atsBefore, after: complete.applications[0].atsAfter };
    await call('cachedState', 'state:get');
    await call('profile', 'profile:update', { name: 'Jordan Rivera', email: 'jordan@example.com', phone: '555-0100', location: 'Portland, OR' });
    const pending = await call('afterProfile', 'state:get');
    out.afterProfile.invalidated = pending.applications.every((a) => a.atsAfter === null);
    await waitForScores();
    await call('afterProfileScored', 'state:get');

    const read = await call('readHeader', 'resume:get', 'read');
    out.readHeader.header = read.builder.doc.header;
    out.readHeader.html = read.resumeHtml.includes('jordan@example.com');
    const copied = await call('copyHeader', 'resume:create', { from: { resume: 'copy' } });
    out.copyHeader.header = copied.builder.doc.header;
    const saved = await call('saveHeader', 'builder:save', 'save', doc);
    out.saveHeader.header = saved.doc.header;
    const legacy = await call('legacyHeader', 'resume:get', 'legacy');
    out.legacyHeader.header = legacy.builder.doc.header;
    const stale = await call('staleHeader', 'resume:get', 'stale');
    out.staleHeader.filled = ['J. Avery', 'Remote', 'custom@example.com'].every((s) => stale.resumeHtml.includes(s));
    await call('exportHeader', 'app:export', 'export', 'resume', 'html', null);
    const html = fs.readFileSync(path.join(dir, 'export.html'), 'utf8');
    out.exportHeader.filled = ['Jordan Rivera', '555-0100', 'Portland, OR', 'jordan@example.com'].every((s) => html.includes(s));
    const application = await call('applicationHeader', 'app:get', 'a0');
    out.applicationHeader.header = application.builder.doc.header;
  } catch (error) { out.crash = error.stack; }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
});
