const test = require('node:test');
const assert = require('node:assert');
const { atsScore, libraryAtsScore, hiredScoreStyleGrade, gradeFromQualifications, skillsMatchLabel, degreeLevel } = require('../src/main/atsScore');
const { htmlToText, renderResumeHtml } = require('../src/main/resumeRender');
const claude = require('../src/main/claude');

const JOB = {
  title: 'Senior Frontend Engineer',
  company: 'Acme Co.',
  text: `Senior Frontend Engineer — Acme Co.

Requirements
- 5+ years of experience building web apps
- Strong TypeScript and React skills
- Experience with REST APIs
- Bachelor's degree in Computer Science or equivalent experience

Nice to have
- Amazon Web Services
- Docker

Benefits: health insurance, 401k. Acme is an equal opportunity employer.`,
};

const GOOD = `Jordan Rivera
Senior Frontend Engineer
jordan@example.com · (555) 123-4567

Summary
Frontend engineer with 8 years building React and TypeScript apps.

Skills
TypeScript, React, REST APIs, Amazon Web Services, CSS

Experience
Frontend Engineer, Bloom Labs, 2018 – Present
- Cut page load time 40% by rebuilding the React rendering pipeline
- Led a team of 4 building REST APIs integrations for 12 products
- Shipped a TypeScript design system used by 40 engineers
- Mentored 3 junior engineers

Education
B.S. Computer Science, State University, 2017
${'Additional detail about projects and impact. '.repeat(30)}`;

const WEAK = `Sam Lee
Barista, Bean There, 2021 - 2024
Made coffee and trained new staff.`;

test('a strong, well-formatted resume scores high with grade A or B', () => {
  const r = atsScore(JOB, GOOD);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.ok(['A', 'B'].includes(r.grade), r.grade);
  assert.equal(r.skillsMatch, 'Strong');
  assert.equal(r.knockouts.length, 0);
  assert.equal(r.components.parseability, 100);
  assert.equal(r.components.jobTitle, 100);
});

test('a weak resume scores low, grade D, and lists knockouts and tips', () => {
  const r = atsScore(JOB, WEAK);
  assert.ok(r.score < 40, `score ${r.score}`);
  assert.equal(r.grade, 'D');
  assert.ok(r.knockouts.some((k) => k.startsWith('React')));
  assert.ok(r.tips.some((t) => /Required skill not found/.test(t)));
  assert.ok(r.tips.some((t) => /email/.test(t)));
});

test('strict (literal) keyword rate is lower than the synonym-aware rate when wording differs', () => {
  const r = atsScore(JOB, GOOD.replace('Amazon Web Services', 'AWS').replace(/REST APIs/g, 'RESTful services API'));
  assert.ok(r.strictKeywordRate < r.normalizedKeywordRate, `${r.strictKeywordRate} vs ${r.normalizedKeywordRate}`);
  assert.ok(r.wordingTerms.includes('amazon web services'));
});

test('benefits / EEO boilerplate and the company name are not treated as keywords', () => {
  const r = atsScore(JOB, GOOD);
  for (const w of ['insurance', 'health', 'employer', 'acme', 'opportunity']) assert.ok(!r.missingKeywords.includes(w), w);
});

test('education and years are basic qualifications', () => {
  assert.equal(degreeLevel("Master's in Design"), 3);
  assert.equal(degreeLevel('B.S. Computer Science'), 2);
  const noDegree = atsScore(JOB, GOOD.replace('B.S. Computer Science', 'Coursework in Computer Science'));
  assert.ok(noDegree.components.education < 100);
  const junior = atsScore(JOB, GOOD.replace('2018 – Present', '2024 – Present'));
  assert.ok(junior.knockouts.some((k) => /years/.test(k)));
});

test('grades follow the HiredScore A–D rules', () => {
  assert.equal(hiredScoreStyleGrade({ basicMet: 5, basicTotal: 5, preferredMet: 2, preferredTotal: 3, score: 80 }), 'A');
  assert.equal(hiredScoreStyleGrade({ basicMet: 5, basicTotal: 5, preferredMet: 0, preferredTotal: 3, score: 80 }), 'B');
  assert.equal(hiredScoreStyleGrade({ basicMet: 3, basicTotal: 5, preferredMet: 3, preferredTotal: 3, score: 90 }), 'C');
  assert.equal(hiredScoreStyleGrade({ basicMet: 1, basicTotal: 5, preferredMet: 0, preferredTotal: 3, score: 20 }), 'D');
  const q = (type, status) => ({ requirement: 'x', type, status, evidence: '' });
  assert.equal(gradeFromQualifications([q('basic', 'met'), q('preferred', 'met')], 85), 'A');
  assert.equal(gradeFromQualifications([q('basic', 'met'), q('basic', 'partial')], 85), 'C');
  assert.equal(gradeFromQualifications([], 85), null);
  assert.equal(skillsMatchLabel(0.65), 'Good');
});

test('library score uses the best resume, or the whole library without format checks', () => {
  const docs = [
    { name: 'old.pdf', kind: 'resume', text: WEAK },
    { name: 'new.pdf', kind: 'resume', text: GOOD },
    { name: 'notes', kind: 'other', text: 'misc' },
  ];
  assert.equal(libraryAtsScore(JOB, docs).basis, 'new.pdf');
  const noResume = libraryAtsScore(JOB, [{ name: 'notes', kind: 'other', text: GOOD }]);
  assert.equal(noResume.components.parseability, null);
  assert.equal(libraryAtsScore(JOB, []), null);
});

test('our rendered resume template parses cleanly', () => {
  const html = renderResumeHtml({
    name: 'Jordan Rivera',
    headline: 'Senior Frontend Engineer',
    contact: ['jordan@example.com', '(555) 123-4567'],
    summary: 'Engineer.',
    skills: [{ category: 'Frontend', items: ['React', 'TypeScript'] }],
    experience: [{ title: 'Engineer', organization: 'Bloom', location: '', dates: '2018 – Present', bullets: ['Cut load time 40%', 'Led 4 people', 'Saved $20k'] }],
    projects: [],
    education: [{ degree: 'B.S.', school: 'State', dates: '2017', details: '' }],
    certifications: [],
    tailoring_notes: [],
  });
  const text = htmlToText(html);
  assert.match(text, /^Experience$/m);
  assert.match(text, /^- Cut load time 40%$/m);
  const r = atsScore(JOB, text);
  const failed = r.formatChecks.filter((c) => !c.ok).map((c) => c.id);
  assert.deepEqual(failed, ['length'], 'only the (deliberately short) length check should fail');
});

test('resume generation passes ATS guidance to Claude', async () => {
  const requests = [];
  const client = { beta: { messages: { parse: async (p) => (requests.push(p), { stop_reason: 'end_turn', parsed_output: {} }) } } };
  const ats = atsScore(JOB, WEAK);
  await claude.generateResume(client, { job: JOB, documents: [{ name: 'r', kind: 'resume', text: WEAK }], profile: {}, analysis: null, ats });
  const prompt = requests[0].messages[0].content;
  assert.match(prompt, /Applicant tracking systems/);
  assert.match(prompt, /typescript/);
  assert.match(prompt, /"Senior Frontend Engineer"/);
});
