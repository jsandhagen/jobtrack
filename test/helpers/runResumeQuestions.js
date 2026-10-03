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
// The answers the demo candidate gives, by question.
const ANSWERS = [
  [/co-sold with AWS/, { answer: 'yes', detail: 'I worked with AWS account managers on 6 joint deals in 2025 and registered each one in ACE; 4 closed.' }],
  [/what did you own yourself/, { answer: null, detail: 'I owned the day-to-day relationship with our AWS partner manager and the 2025 joint business plan (quarterly pipeline targets and a Marketplace private-offer motion). Our VP owned the executive relationship.' }],
  [/AWS Partner Network/, { answer: 'yes', detail: 'We sold through AWS Marketplace private offers, and I set them up with sales ops.' }],
  [/demand generation/, { answer: 'yes', detail: 'I ran two co-marketing webinars with AWS in 2025 that brought in 140 registrants.' }],
];
const replyTo = (qs) => qs.map((q) => ({ id: q.id, ...(ANSWERS.find(([re]) => re.test(q.question)) || [null, {}])[1] }));

setTimeout(async () => {
  const out = {};
  const call = async (channel, ...args) => {
    const r = await E.__handlers.get(channel)({}, ...args);
    if (!r.ok) throw new Error(`${channel}: ${r.error}`);
    return r.value;
  };
  try {
    // Two at a time: answer the first two, and the next two come up the next time.
    out.questions = (await call('app:resumeQuestions', 'a0')).questions;
    out.again = (await call('app:resumeQuestions', 'a0')).questions.length; // remembered
    out.answered = await call('app:answerResumeQuestions', 'a0', replyTo(out.questions));
    out.next = (await call('app:resumeQuestions', 'a0')).questions;
    out.answeredNext = await call('app:answerResumeQuestions', 'a0', replyTo(out.next));
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
    out.variants = bank.bullets.filter((b) => (b.variants || []).some((v) => /private offers/.test(v))).map((b) => ({ text: b.text, variants: b.variants }));
    // Spike, on the free path, for the same job.
    out.spike = await call('app:atsQuestions', 'a0');
    // The free optimizer can use the answers too.
    await call('app:atsResume', 'a0');
    const free = await call('builder:get', 'a0');
    out.freePage = free.doc.roles.flatMap((r) => r.bullets.map((b) => b.text));
  } catch (err) {
    out.crash = err.stack;
  }
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}, 2500);
