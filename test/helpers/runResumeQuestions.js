// "Write with Claude" with its questions, through the real main process
// (stub Electron, test/e2e/fakeClaude.js for Claude): ask, answer, draft.
// Prints what the library, the bank and the page look like after. Run by
// test/resumeQuestions.test.js in its own process.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STUB = path.join(__dirname, 'electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  return req === 'electron' ? STUB : resolve.call(this, req, ...rest);
};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'e2e', 'fixtures', f), 'utf8');
const P = require('../fixtures/allianceOpportunities');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-qa-'));
const now = Date.now();
const docs = [
  { id: 'd1', name: 'Jordan_Reyes_Resume.txt', kind: 'resume', text: read('Jordan_Reyes_Resume.txt'), addedAt: new Date(now - 2000).toISOString() },
  { id: 'd2', name: 'Impact_Statement.txt', kind: 'recommendation', text: read('Impact_Statement.txt'), addedAt: new Date(now - 1000).toISOString() },
];
const job = P.oktaAwsAlliance;
const apps = [{ id: 'a0', createdAt: new Date(now).toISOString(), status: 'scored', saved: true, statusHistory: [], job: { title: job.title, company: job.company, location: job.location, text: job.text }, quick: { score: 50, version: 0 }, analysis: null }];
fs.writeFileSync(path.join(dir, 'jobtrack.json'), JSON.stringify({ settings: { clipboardWatch: false }, profile: { name: 'Jordan Reyes', email: 'jordan.reyes@example.com' }, documents: docs, applications: apps }));
process.env.JOBTRACK_DATA_DIR = dir;
process.env.SPROUT_FAKE_CLAUDE = path.join(__dirname, '..', 'e2e', 'fakeClaude.js');

const E = require(STUB);
require('../../src/main/main.js');
E.__ready();

// The answers the demo candidate gives.
const REPLIES = [
  { id: 'q1', answer: 'yes', detail: 'I registered our co-sell opportunities in ACE and worked with AWS account managers on 6 joint deals in 2025; 4 closed.' },
  { id: 'q2', answer: null, detail: '23 customer deals over 18 months (2024 to 2025)' },
  { id: 'q3', answer: null, detail: 'I owned the AWS joint business plan for 2025 with our AWS partner manager: quarterly pipeline targets and a Marketplace private-offer motion. It produced 31 co-sell opportunities.' },
  { id: 'q4', answer: 'yes', detail: 'We sold through AWS Marketplace private offers; I set them up with sales ops.' },
];

setTimeout(async () => {
  const out = {};
  const call = async (channel, ...args) => {
    const r = await E.__handlers.get(channel)({}, ...args);
    if (!r.ok) throw new Error(`${channel}: ${r.error}`);
    return r.value;
  };
  try {
    out.questions = (await call('app:resumeQuestions', 'a0')).questions;
    out.again = (await call('app:resumeQuestions', 'a0')).questions.length; // remembered
    out.answered = await call('app:answerResumeQuestions', 'a0', REPLIES);
    const state = await call('state:get');
    out.library = state.documents.map((d) => d.name);
    const answersDoc = state.documents.find((d) => d.name === 'Answers you gave Sprout');
    out.answersDoc = answersDoc ? (await call('docs:get', answersDoc.id)).text : null;
    const bankBefore = await call('bank:get');
    out.confirmed = bankBefore.confirmed || [];
    out.answers = (bankBefore.answers || []).length;
    out.bulletsBefore = bankBefore.bullets.length;
    out.questionsAfter = (await call('app:resumeQuestions', 'a0')).questions.length; // asked again only if still worth it
    await call('app:resume', 'a0');
    const ed = await call('builder:get', 'a0');
    out.page = { summary: ed.doc.summary, roles: ed.doc.roles.map((r) => ({ org: r.organization, bullets: r.bullets.map((b) => ({ text: b.text, flag: b.flag || null, bulletId: b.bulletId })) })) };
    out.notes = ed.notes;
    const bank = await call('bank:get');
    out.newBullets = bank.bullets.filter((b) => b.source && b.source.name === 'Answers you gave Sprout').map((b) => b.text);
    out.variants = bank.bullets.filter((b) => (b.variants || []).some((v) => /23 deals/.test(v))).map((b) => ({ text: b.text, variants: b.variants }));
    // The free optimizer can use the answers too.
    await call('app:atsResume', 'a0');
    const free = await call('builder:get', 'a0');
    out.freePage = free.doc.roles.flatMap((r) => r.bullets.map((b) => b.text));
  } catch (err) {
    out.crash = err.stack;
  }
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}, 2500);
