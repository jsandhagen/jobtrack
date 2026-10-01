const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ResumeDoc = require('../src/shared/resumeDoc');
const { parseResume, mergeIntoBank, emptyBank, selectBullets, buildDoc, linkDocToBank } = require('../src/main/bullets');
const { htmlToText } = require('../src/main/resumeRender');
const { atsScore } = require('../src/main/atsScore');
const { POSTINGS } = require('./fixtures/fitCases');

const DOC = {
  header: { name: 'Alex Morgan', line1: '12 Example St, Springfield, IL | 555-010-0199', line2: 'alex@example.com' },
  summary: 'Analyst who <loves> data.',
  titles: {},
  roles: [
    { experienceId: 'e1', organization: 'Northwind', location: 'Springfield, IL', title: 'Senior Data Analyst', dates: 'March 2021 – Current', bullets: [{ bulletId: 'b1', text: 'Built a claims triage model in Python and SQL' }, { bulletId: null, text: '' }] },
    { experienceId: null, isProject: true, organization: '', location: '', title: 'Open data dashboard', dates: '2020', bullets: [{ bulletId: null, text: 'Published a Tableau dashboard' }] },
  ],
  skills: ['SQL', 'Python', '', 'Tableau'],
  education: [{ school: 'University of Illinois', location: 'Springfield, IL', degree: 'B.S. Economics, GPA: 3.6', dates: 'May 2018', lines: [{ label: 'Relevant Courses', text: 'Econometrics, Statistics.' }] }],
  certifications: [],
};

test('print template matches the classic layout (fonts, margins, sections, rows)', () => {
  const html = ResumeDoc.renderHtml(ResumeDoc.compact(DOC));
  assert.match(html, /@page \{ size: Letter; margin: 0\.5in 1in 0\.6in 1in; \}/);
  assert.match(html, /"Times New Roman"/);
  assert.match(html, /<div class="rs-name">Alex Morgan<\/div>/);
  assert.match(html, /<h2 class="rs-h">Relevant Work Experience<\/h2>/);
  assert.match(html, /<span class="rs-b">Northwind<\/span><span class="rs-b rs-right">Springfield, IL<\/span>/);
  assert.match(html, /<span class="rs-right">March 2021 – Current<\/span>/);
  assert.match(html, /<span class="rs-label">Relevant Courses:<\/span> Econometrics/);
  assert.match(html, /&lt;loves&gt;/, 'text is escaped');
  assert.doesNotMatch(html, /contenteditable/);
  assert.doesNotMatch(html, /<li><\/li>/, 'empty bullets and skills are dropped when printing');
});

test('ATS parsing of the template: standard headings, dates, bullets', () => {
  const text = htmlToText(ResumeDoc.renderHtml(ResumeDoc.compact(DOC)));
  assert.match(text, /^Relevant Work Experience$/m);
  assert.match(text, /^- Built a claims triage model in Python and SQL$/m);
  const r = atsScore({ title: 'Data Analyst', text: 'Requirements\n- SQL and Python\n- Tableau' }, text);
  const failed = r.formatChecks.filter((c) => !c.ok).map((c) => c.id);
  assert.ok(!failed.includes('experience-heading') && !failed.includes('skills-heading') && !failed.includes('dates'), failed.join(','));
});

test('editable mode marks every field with its path and keeps empty placeholders', () => {
  const html = ResumeDoc.renderBody(DOC, { editable: true });
  for (const p of ['header.name', 'summary', 'roles.0.organization', 'roles.0.bullets.1.text', 'skills.2', 'education.0.lines.0.text']) {
    assert.match(html, new RegExp(`data-path="${p.replace(/\./g, '\\.')}"`), p);
  }
  assert.match(html, /contenteditable="plaintext-only"/);
  assert.match(html, /data-add-bullet="0"/);
});

test('Claude-style resumes convert into the editor format', () => {
  const d = ResumeDoc.fromResume({
    name: 'Alex',
    contact: ['alex@example.com', '555-010-0199', 'Springfield, IL', 'linkedin.com/in/alex'],
    summary: 'S',
    skills: [{ category: 'A', items: ['SQL', 'Python'] }, { category: 'B', items: ['sql', 'Excel'] }],
    experience: [{ title: 'Analyst', organization: 'Northwind', location: '', dates: '2021 – Present', bullets: ['Did x'] }],
    projects: [{ name: 'P', description: 'D', bullets: ['Made y'] }],
    education: [{ degree: 'B.S.', school: 'U', dates: '2018', details: 'Relevant Courses: A, B. Honors: Dean\'s list.' }],
    certifications: [],
  });
  assert.equal(d.header.line1, '555-010-0199 | Springfield, IL');
  assert.equal(d.header.line2, 'alex@example.com | linkedin.com/in/alex');
  assert.deepEqual(d.skills, ['SQL', 'Python', 'Excel']);
  assert.equal(d.roles[1].isProject, true);
  assert.deepEqual(d.education[0].lines.map((l) => l.label), ['Relevant Courses', 'Honors']);
});

test('markdown export follows the same sections', () => {
  const md = ResumeDoc.toMarkdown(ResumeDoc.compact(DOC));
  assert.match(md, /^# Alex Morgan/);
  assert.match(md, /## RELEVANT WORK EXPERIENCE\n\n\*\*Northwind\*\* — Springfield, IL {2}\n\*\*Senior Data Analyst\*\* — March 2021 – Current/);
  assert.match(md, /\*\*Relevant Courses:\*\* Econometrics/);
});

test('a doc built from the bullet bank carries bullet ids, relevant skills first, and education lines', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'resumes', 'classic.txt'), 'utf8');
  const { bank } = mergeIntoBank(emptyBank(), parseResume(text), { name: 'classic' });
  const job = POSTINGS.dataAnalyst;
  const { doc } = buildDoc({ profile: { name: 'Alex Morgan', email: 'alex@example.com', phone: '555-010-0199' }, bank, job, roles: selectBullets(job, bank).roles });
  assert.equal(doc.header.name, 'Alex Morgan');
  assert.equal(doc.roles[0].organization, 'Northwind Insurance');
  assert.ok(doc.roles[0].bullets.every((b) => b.bulletId));
  const wanted = ['Data Analysis', 'SQL', 'Tableau', 'Statistics', 'Python', 'Communication'];
  assert.ok(doc.skills.slice(0, 3).every((s) => wanted.includes(s)), doc.skills.join(', '));
  assert.deepEqual(doc.education[0].lines, [{ label: 'Relevant Courses', text: 'Econometrics, Statistics, Data Visualization, Database Systems.' }]);
  // A Claude-written version of the same bullet links back to the bank.
  const claudeDoc = ResumeDoc.fromResume({ name: 'Alex', experience: [{ title: 'Senior Data Analyst', organization: 'Northwind Insurance', bullets: ['Built a Python and SQL claims triage model flagging high-severity claims, cutting handling time 18% for 40 adjusters'] }] });
  linkDocToBank(claudeDoc, bank);
  assert.ok(claudeDoc.roles[0].experienceId);
  assert.ok(claudeDoc.roles[0].bullets[0].bulletId);
});

test('headers default from the profile, or a saved resume header', () => {
  assert.deepEqual(ResumeDoc.headerFromProfile({ name: 'A', location: 'Fairfax, VA', phone: '555', email: 'a@x.com' }), { name: 'A', line1: 'Fairfax, VA | 555', line2: 'a@x.com' });
  assert.equal(ResumeDoc.headerFromProfile({ name: 'A', resumeHeader: { line1: '1 Main St | 555', line2: 'a@x.com' } }).line1, '1 Main St | 555');
});
