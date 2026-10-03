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
  assert.equal(r.questions.length, 4);
  assert.ok(r.questions.every((q) => q.experienceId), 'each question is tied to a bank role, not a prompt id');
  assert.ok(r.questions.find((q) => q.kind === 'number').bulletId, 'a number question names the bank bullet it strengthens');
  // Kept for good.
  assert.deepEqual(r.answered, { saved: 4, document: 'Answers you gave Sprout' });
  assert.ok(r.library.includes('Answers you gave Sprout'));
  assert.match(r.answersDoc, /Role: Sr\. Strategy Consultant - Office of the CTO, Northwind Software/);
  assert.match(r.answersDoc, /Q: Have you co-sold with AWS account teams[^\n]*\nA: Yes\. I registered our co-sell opportunities in ACE/);
  assert.deepEqual(r.confirmed, ['driving co-sell revenue', 'AWS Partner Programs'], 'a yes is experience you have, not a skill on the page');
  assert.equal(r.answers, 4);
  assert.equal(r.questionsAfter, 0, 'what you answered is not asked again');
  // The draft uses them, nothing flagged, and its bullets from your answers go into the bank.
  assert.match(r.page.roles[0].bullets[0].text, /^Owned Northwind’s 2025 AWS joint business plan/);
  assert.ok(r.page.roles.every((role) => role.bullets.every((b) => !b.flag)), JSON.stringify(r.page));
  assert.ok(r.page.roles[0].bullets.slice(0, 2).every((b) => b.bulletId), 'bullets from answers now point at their bank entries');
  assert.equal(r.newBullets.length, 2);
  assert.match(r.variants[0].variants[0], /23 deals over 18 months/, 'a bank bullet strengthened by an answer keeps the new wording');
  assert.ok(r.notes.some((n) => /Saved 2 new bullets and a new wording of a bullet written from your answers/.test(n)), r.notes.join(' | '));
  // The free optimizer has them too.
  assert.ok(r.freePage.some((t) => /31 co-sell opportunities/.test(t)), r.freePage.join(' | '));
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
  assert.match(P.answeredBlock([{ question: 'Q?', answer: 'Yes.' }], ['co-selling'], ['M&A']), /- Q\? — Yes\.\n- Has: co-selling\n- Doesn't have: M&A/);
});
