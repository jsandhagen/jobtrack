// Starts the real main process against a stub Electron and a small data
// folder, calls what the dashboard calls, and prints the results as JSON.
// Run in its own process by test/main.test.js (main.js keeps timers and a
// local server going, so this exits itself).
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STUB = path.join(__dirname, 'electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return req === 'electron' ? STUB : resolve.call(this, req, ...rest);
};

const persona = require('../fixtures/ctoOfficePersona');
const resume = Object.values(persona.RESUMES)[0];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-main-'));
const now = Date.now();
const docs = [0, 1, 2].map((i) => ({ id: `d${i}`, name: `Resume v${i + 1}.pdf`, kind: 'resume', text: resume.replace('Present', i ? 'Present' : 'Present'), addedAt: new Date(now - i * 1000).toISOString() }));
const apps = Object.values(persona.POSTINGS).slice(0, 6).map((job, i) => ({ id: `a${i}`, createdAt: new Date(now - i * 86400000).toISOString(), status: 'scored', statusHistory: [], job: { title: job.title || 'Role', company: job.company || 'Co', location: '', text: job.text }, quick: { score: 50, version: 0 }, analysis: null }));
fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({ settings: { clipboardWatch: false }, profile: { name: 'Jordan Avery', email: 'j@example.com' }, documents: docs, applications: apps }));
process.env.JOBTRACK_DATA_DIR = dir;

const E = require(STUB);
require('../../src/main/main.js');
E.__ready();

setTimeout(async () => {
  const out = {};
  const call = async (name, channel, ...args) => {
    const t = Date.now();
    const r = await E.__handlers.get(channel)({}, ...args);
    out[name] = { ok: r.ok, error: r.error, ms: Date.now() - t, value: r.value };
    return r.value;
  };
  try {
    await call('state', 'state:get');
    await call('app', 'app:get', 'a0');
    await call('editor', 'builder:get', 'a0');
    await call('optimize', 'app:atsResume', 'a0');
    await call('fix', 'builder:fixPage', 'a0', {});
    await call('stateAfter', 'state:get');
  } catch (err) {
    out.crash = err.stack;
  }
  // Exit once the output is written: a pipe on macOS takes it asynchronously,
  // and exiting at once cut the JSON off at 64 KB.
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}, 2500); // after the background housekeeping (bullet bank, rescoring) has run
