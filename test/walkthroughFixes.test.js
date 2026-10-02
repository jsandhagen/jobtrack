// Fixes from walking through the app as a new user (a strategy consultant
// importing her resumes and checking a competitive intelligence role).
const test = require('node:test');
const assert = require('node:assert/strict');
const { contactFromResume } = require('../src/main/contact');
const { withoutCollaborators } = require('../src/main/fitScore');
const B = require('../src/main/bullets');
const RC = require('../src/shared/resumeCheck');
const { atsNudges } = require('../src/main/atsNudges');

test('an imported resume fills in your name and contact details', () => {
  assert.deepEqual(contactFromResume('Sadia Taieba\nFairfax, VA | 571-314-8026\nsadia.taieba@gmail.com\nPROFESSIONAL SUMMARY\nSr. Consultant…'), {
    name: 'Sadia Taieba', email: 'sadia.taieba@gmail.com', phone: '571-314-8026', location: 'Fairfax, VA', links: '',
  });
  const caps = contactFromResume('JORDAN RIVERA\nPortland, Oregon • (555) 123-4567 • jordan@x.dev • https://www.linkedin.com/in/jordanr/\nEXPERIENCE');
  assert.equal(caps.name, 'Jordan Rivera');
  assert.equal(caps.links, 'linkedin.com/in/jordanr');
  assert.equal(contactFromResume('PROFESSIONAL SUMMARY\nSenior consultant who…').name, '', 'no header, no guess');
});

test('competitors you tracked are not skills you have', () => {
  const tracked = 'Led competitive intelligence for the CTO by tracking competitor strategies (Microsoft, OpenAI, Palantir, ServiceNow, etc.), producing battlecards';
  assert.ok(!B.skillTags(tracked).includes('ServiceNow'));
  assert.ok(!/ServiceNow/.test(withoutCollaborators('Built the competitive analysis of Pega, ServiceNow and UiPath used in product planning')));
  assert.ok(B.skillTags('Administered ServiceNow ITSM for 3,000 users').includes('ServiceNow'), 'one you ran still counts');
});

test('"move the strongest bullet up" names the employer, short enough for its button', () => {
  const doc = { header: {}, summary: '', skills: [], education: [], roles: [{ organization: 'Appian', title: 'Sr. Technology Strategy Consultant - Chief Technology Office', bullets: [{ text: 'Helped with weekly reports for the team' }, { text: 'Cut reporting time 40% by automating 12 dashboards in SQL' }] }] };
  const first = RC.checkResume(doc, { covers: [[[], ['a', 'b']]] }).resume.find((c) => c.id === 'first');
  assert.equal(first.ok, false);
  assert.equal(first.moves[0].role, 'Appian');
});

test('a wording tip never names the same word twice', () => {
  const ats = { score: 70, wordingTips: [{ skill: 'Consulting', term: 'consulting' }], missingSkills: [], fixable: [], experience: { met: true }, education: { met: true } };
  const n = atsNudges({ ats, job: { title: 'X', text: 'Experience in strategy consulting' }, pageText: 'Strategy consultant at Appian', onPage: true });
  const tip = n.nudges.concat(n.later).find((x) => x.id === 'wording:Consulting');
  assert.ok(tip);
  assert.doesNotMatch(tip.text, /You show Consulting/);
  assert.match(tip.text, /“consulting”/i);
});

test('a library imported before Profile filled itself in gets one pass: newest resume first, empty fields only', () => {
  const { contactFromLibrary, contactPatch } = require('../src/main/contact');
  const docs = [
    { kind: 'resume', addedAt: '2026-01-01', text: 'Sadia Taieba\nArlington, VA | 571-000-0000\nold@example.com\nSUMMARY' },
    { kind: 'resume', addedAt: '2026-06-01', text: 'Sadia Taieba\nFairfax, VA | 571-314-8026\nsadia.taieba@gmail.com\nSUMMARY' },
    { kind: 'resume', addedAt: '2026-07-01', text: 'PROFESSIONAL SUMMARY\nNo header on this one' },
    { kind: 'letter', addedAt: '2026-08-01', text: 'Dear Hiring Manager\nsomeone@else.com' },
  ];
  const found = contactFromLibrary(docs);
  assert.deepEqual(found, { name: 'Sadia Taieba', email: 'sadia.taieba@gmail.com', phone: '571-314-8026', location: 'Fairfax, VA', links: '' });
  assert.deepEqual(contactPatch({ name: 'Sadia T.', phone: '' }, found), { email: 'sadia.taieba@gmail.com', phone: '571-314-8026', location: 'Fairfax, VA' }, 'what you typed stays');
});
