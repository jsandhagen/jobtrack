// "Write with Claude" asks first (claude.askResumeQuestions), and what you
// answer is kept for good: the library document "Answers you gave Sprout",
// your bank's confirmed experience, and the bullets Claude writes from your
// answers. Runs the real main process with test/e2e/fakeClaude.js standing in
// for Claude (helpers/runResumeQuestions.js).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');
const A = require('../src/main/answers');
const P = require('../src/main/prompts');
const { asBullet } = require('../src/main/resumeContext');

const run = () => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'runResumeQuestions.js')], { encoding: 'utf8', timeout: 90000 }));

test('ask, answer, write: the answers are kept in the library and the bank, and used', () => {
  const r = run();
  assert.equal(r.crash, undefined, r.crash);
  assert.equal(r.questions.length, 4, 'none of Root’s questions is about something the documents show');
  assert.ok(r.questions.every((q) => q.experienceId), 'each question is tied to a bank role, not a prompt id');
  assert.ok(r.questions.find((q) => /what did you own yourself/.test(q.question)).bulletId, 'a question names the bank bullet it strengthens');
  // Kept for good.
  assert.deepEqual(r.answered, { saved: 4, bullets: 0, wordings: 0, document: 'Answers you gave Sprout' });
  assert.ok(r.library.includes('Answers you gave Sprout'));
  assert.match(r.answersDoc, /Role: Sr\. Strategy Consultant - Office of the CTO, Northwind Software/);
  assert.match(r.answersDoc, /Q: Have you co-sold with AWS[^\n]*\nA: Yes\. I worked with AWS account managers on 6 joint deals/);
  assert.deepEqual(r.confirmed, ['driving co-sell revenue', 'AWS Partner Programs', 'Demand Generation'], 'a yes is experience you have, not a skill on the page');
  assert.equal(r.answers, 4);
  assert.equal(r.questionsAfter, 0, 'what you answered is not asked again');
  // The draft uses them, nothing flagged, and its bullets from your answers go into the bank.
  assert.match(r.page.roles[0].bullets[0].text, /^Managed the day-to-day relationship with Northwind’s AWS partner manager/);
  assert.ok(r.page.roles.every((role) => role.bullets.every((b) => !b.flag)), JSON.stringify(r.page));
  assert.ok(r.page.roles[0].bullets.slice(0, 2).every((b) => b.bulletId), 'bullets from answers now point at their bank entries');
  assert.equal(r.newBullets.length, 3);
  assert.ok(r.notes.some((n) => /Saved 3 new bullets written from your answers/.test(n)), r.notes.join(' | '));
  // The free optimizer has them too, and Spike asks only what's still missing, with what it adds.
  assert.ok(r.freePage.some((t) => /140 registrants|6 joint deals/.test(t)), r.freePage.join(' | '));
  assert.ok(r.spike.questions.every((q) => q.boost && q.boost.strength >= 1), JSON.stringify(r.spike.questions));
  assert.ok(!r.spike.questions.some((q) => /co-sell|demand generation/i.test(q.requirement)), 'not what was just answered');
  assert.ok(r.spike.ifAll >= r.spike.strength);
});

test('the documents check: a requirement in the documents is not asked about, a broader one doesn’t count', () => {
  const fs = require('fs');
  const { shownInDocuments, notInDocuments } = require('../src/main/askFirst');
  const job = require('./fixtures/allianceOpportunities').oktaAwsAlliance;
  const lib = ['Jordan_Reyes_Resume.txt', 'Impact_Statement.txt'].map((f) => fs.readFileSync(path.join(__dirname, 'e2e', 'fixtures', f), 'utf8')).join('\n');
  for (const r of ['AWS Marketplace', 'joint business planning', 'competitive intelligence', 'partnerships with Contoso']) assert.ok(shownInDocuments(r, job, lib), r);
  for (const r of ['driving co-sell revenue', 'AWS Partner Programs', 'Demand Generation', 'own and lead the partnership with AWS']) assert.ok(!shownInDocuments(r, job, lib), r);
  const qs = [{ question: 'Done AWS Marketplace work?', requirement: 'AWS Marketplace' }, { question: 'Co-sold?', requirement: 'driving co-sell revenue' }, { question: 'Skipped before?', requirement: '' }];
  assert.deepEqual(notInDocuments(qs, { job, libraryText: lib, skipped: ['skipped before?'] }).map((q) => q.question), ['Co-sold?']);
});

test('Spike asks what the documents don’t show, with what answering adds, in plain words', () => {
  const fs = require('fs');
  const B = require('../src/main/bullets');
  const { atsQuestions, postingLine } = require('../src/main/askFirst');
  const { localFitScore, shownFit } = require('../src/main/localFit');
  const read = (f) => fs.readFileSync(path.join(__dirname, 'e2e', 'fixtures', f), 'utf8');
  const docs = [{ kind: 'resume', text: read('Jordan_Reyes_Resume.txt') }, { kind: 'recommendation', text: read('Impact_Statement.txt') }];
  const bank = B.mergeIntoBank(null, B.parseResume(docs[0].text), { id: 'r', name: 'r' }).bank;
  const P = require('./fixtures/allianceOpportunities');
  const ask = (job) => { const q = shownFit(localFitScore(job, docs, {})); return atsQuestions({ job, bank, libraryText: docs.map((d) => d.text).join('\n'), fit: q.score, missing: q.missingSkills || [] }); };
  const okta = ask(P.oktaAwsAlliance);
  const pick = okta.questions.find((q) => q.kind === 'pick');
  assert.deepEqual(pick.options, ['APN', 'ACE'], 'named programs in one question, not one each');
  assert.ok(okta.questions.every((q) => q.boost.strength >= 1));
  assert.ok(okta.ifAll > okta.strength);
  assert.match(okta.questions.find((q) => q.requirement === 'partnerships organization').question, /^The posting asks for “An in-depth knowledge of the AWS sales and partnerships organization”/);
  // A lead bullet with no number: edit it to add one.
  const ci = ask(P.kickboardCI);
  const num = ci.questions.find((q) => q.kind === 'bullet');
  assert.match(num.bullet, /^Led competitive intelligence for the CTO/);
  assert.ok(num.boost.strength >= 1, JSON.stringify(num.boost));
  // A stretch role: no requirement questions.
  assert.ok(!ask(P.ctoChiefOfStaff).questions.some((q) => q.kind !== 'bullet'));
  assert.equal(postingLine('Qualifications\n- Experience with Salesforce; SQL a plus', 'Salesforce'), 'Experience with Salesforce');
});

test('Spike’s answers go into the bank as you wrote them: an example as a bullet, a number as a new wording', () => {
  const qs = [
    { id: 's1', kind: 'yes_no', question: 'Co-sold?', requirement: 'co-selling', experienceId: 'e1' },
    { id: 's2', kind: 'bullet', question: 'Add a number?', bullet: 'Led competitive intelligence for the CTO', bulletId: 'b1', experienceId: 'e1' },
    { id: 's3', kind: 'pick', question: 'Which?', options: ['APN', 'ACE'], experienceId: 'e1' },
    { id: 's4', kind: 'bullet', question: 'Add a number?', bullet: 'Built dashboards', bulletId: 'b2' },
  ];
  const r = A.answerEntries(qs, [
    { id: 's1', answer: 'yes', detail: 'Yes, I co-sold with AWS account teams on 6 joint deals in 2025.' },
    { id: 's2', detail: 'Led competitive intelligence for the CTO, used by 40 sellers' },
    { id: 's3', picked: ['ACE'], detail: 'for co-sell registrations' },
    { id: 's4', detail: 'Built dashboards' },
  ], { writeBullets: true });
  assert.deepEqual(r.bullets, [{ experienceId: 'e1', text: 'Co-sold with AWS account teams on 6 joint deals in 2025' }]);
  assert.deepEqual(r.variants, [{ bulletId: 'b1', text: 'Led competitive intelligence for the CTO, used by 40 sellers' }]);
  assert.deepEqual(r.yes, ['co-selling', 'ACE']);
  assert.equal(r.entries.find((e) => e.question === 'Which?').answer, 'Used ACE. for co-sell registrations');
  assert.equal(r.entries.length, 3, 'an unchanged bullet is not an answer');
});

test('an answer is recorded as given: yes, no, a detail, or nothing', () => {
  const qs = [
    { id: 'q1', kind: 'yes_no', question: 'Co-sold with AWS?', requirement: 'co-selling', experienceId: 'e1' },
    { id: 'q2', kind: 'yes_no', question: 'Managed a channel team?', requirement: 'channel team management' },
    { id: 'q3', kind: 'number', question: 'How many deals?', requirement: '' },
    { id: 'q4', kind: 'text', question: 'What did the plan cover?', requirement: '' },
  ];
  const { entries, yes, no } = A.answerEntries(qs, [
    { id: 'q1', answer: 'yes', detail: ' 6 joint deals  in 2025 ' },
    { id: 'q2', answer: 'no', detail: '' },
    { id: 'q3', answer: null, detail: '23' },
    { id: 'q4', answer: null, detail: '   ' },
  ], { job: { title: 'Alliance Manager', company: 'Okta' }, at: '2026-10-03T00:00:00Z' });
  assert.deepEqual(entries.map((e) => e.answer), ['Yes. 6 joint deals in 2025', 'No.', '23']);
  assert.deepEqual(yes, ['co-selling']);
  assert.deepEqual(no, ['channel team management']);
  const text = A.answersDocText(entries, [{ id: 'e1', title: 'Consultant', organization: 'Northwind' }], 'Jordan Reyes');
  assert.match(text, /^Answers Jordan gave Sprout/);
  assert.match(text, /Role: Consultant, Northwind\nAsked for: Alliance Manager \(Okta\), 2026-10-03\nQ: Co-sold with AWS\?\nA: Yes\. 6 joint deals in 2025/);
  assert.match(text, /Role: Not tied to one role/);
  assert.equal((text.match(/Asked for:/g) || []).length, 2, 'the posting is named once per role');
  // New answers go at the end: a correction made in My library stays.
  const edited = text.replace('6 joint deals', '7 joint deals');
  const more = A.withAnswers(edited, [{ question: 'Q2?', answer: 'Yes.', experienceId: 'e1', job: { title: 'Partner Manager', company: 'Acme' }, at: '2026-10-05' }], [{ id: 'e1', title: 'Consultant', organization: 'Northwind' }], 'Jordan');
  assert.ok(more.startsWith(edited));
  assert.match(more, /\n\nRole: Consultant, Northwind\nAsked for: Partner Manager \(Acme\), 2026-10-05\nQ: Q2\?\nA: Yes\.$/);
});

test('first-person answers become draft bullets for the free optimizer, without "I" or "our"', () => {
  assert.equal(asBullet('I registered our co-sell opportunities in ACE and worked with AWS account managers on 6 joint deals in 2025; 4 closed.', ['Jordan']),
    'Registered co-sell opportunities in ACE and worked with AWS account managers on 6 joint deals in 2025; 4 closed');
  assert.equal(asBullet('Jordan has researched, launched, and managed technology partnerships with Contoso and Fabrikam.', ['Jordan']),
    'Researched, launched, and managed technology partnerships with Contoso and Fabrikam');
});

test('the resume prompt writes for the hiring manager, and the questions prompt asks only what changes the page', () => {
  assert.match(P.SYSTEM, /The hiring manager decides whether to interview/);
  assert.match(P.SYSTEM, /Passing them is a floor, not the goal/);
  assert.match(P.SYSTEM, /Answers you gave Sprout/);
  const t = P.TASKS.resume;
  assert.match(t, /The first bullet of the latest role is the candidate's strongest evidence of the work the job is titled for/);
  assert.match(t, /not a supporting verb/);
  assert.match(t, /A concrete proof point is welcome only if it is not already on the page/);
  assert.match(t, /Before you answer, read the page as the hiring manager would/);
  assert.doesNotMatch(t, /with a concrete proof point from the documents where one fits/);
  // No "say the industry once, in the summary" keyword sentence.
  const ats = P.atsBlock({ title: 'X' }, { score: 70, fixable: [{ employer: 'Appian', term: 'SaaS' }] });
  assert.doesNotMatch(ats, /Say that word once, in the summary/);
  assert.match(ats, /don't add a sentence for it/);
  const i = P.TASKS.interview;
  assert.match(i, /Ask at most 4/);
  assert.match(i, /Return no questions when the documents already make the strongest page they can/);
  assert.match(i, /Never suggest an answer or a number/);
  assert.match(i, /Ask only about what the documents don't say/);
  assert.match(P.answeredBlock([{ question: 'Q?', answer: 'Yes.' }], ['co-selling'], ['M&A']), /- Q\? — Yes\.\n- Has: co-selling\n- Doesn't have: M&A/);
});
