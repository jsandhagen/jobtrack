// Pasted pages from the big job sites carry buttons, AI prompts, the viewer's
// own profile, application forms and other jobs. After cleaning, each should
// score like the bare posting and yield its title, company and location.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cleanPosting, repairLinkedInTitle } = require('../src/main/posting');
const { localFitScore } = require('../src/main/localFit');
const { atsScore } = require('../src/main/atsScore');
const { classifyLines } = require('../src/main/fitScore');

const DIR = path.join(__dirname, 'fixtures/pastes');
const BODY = fs.readFileSync(path.join(DIR, 'body.txt'), 'utf8');
const paste = (site) => fs.readFileSync(path.join(DIR, `${site}.txt`), 'utf8').replace('{{BODY}}', BODY);
const SITES = ['linkedin', 'indeed', 'greenhouse', 'workday', 'lever'];

const RESUME = `Alex Kim
alex@example.com (555) 222-3333
Experience
Data Analyst, Northwind Clinics, Jan 2022 – Present
- Built Tableau dashboards used by 40 managers
- Wrote SQL against Snowflake to clean claims data
Education
B.S. Statistics, State University
Skills
SQL, Tableau, Excel, Python`;
const DOCS = [{ kind: 'resume', text: RESUME }];
const CLEAN = { title: 'Data Analyst', company: 'Brightline Health', location: 'Denver, CO', text: BODY };

test('a LinkedIn paste uses the active header for a title without a role noun', () => {
  const text = `Brightline Health logo\nBrightline Health\nShare\nShow more options\nBusiness Operations\nDenver, CO · 3 days ago · Over 100 applicants\nHybrid\nFull-time\nEasy Apply\nSave\nMeet the hiring team\nSam Ortiz\nDirector of Analytics\nAbout the job\n${BODY}`;
  const job = cleanPosting({ text });
  assert.equal(job.title, 'Business Operations');
  assert.equal(job.company, 'Brightline Health');
});

test('a LinkedIn header without a logo or applicant count still supplies the title', () => {
  for (const header of ['Brightline Health\nBusiness Operations', 'Business Operations\nBrightline Health']) {
    const job = cleanPosting({ text: `${header}\nDenver, CO · Reposted 1 day ago\nEasy Apply\nAbout the job\nBrightline Health is hiring for our growing team.\n${BODY}` });
    assert.equal(job.title, 'Business Operations');
    assert.equal(job.company, 'Brightline Health');
  }
});

test('a corrected LinkedIn title repairs a bad cached header only for the same listing', () => {
  const fresh = { title: 'Business Operations', company: 'Brightline Health', text: BODY, url: 'https://www.linkedin.com/jobs/view/123/?trackingId=new' };
  const rec = { job: { ...fresh, title: 'Brightline Health', url: 'https://www.linkedin.com/jobs/view/123/?trackingId=old' } };
  assert.equal(repairLinkedInTitle(rec,fresh).title,'Business Operations');
  assert.equal(repairLinkedInTitle({...rec,jobTitleEdited:true},fresh),null);
  assert.equal(repairLinkedInTitle({...rec,job:{...rec.job,title:'Operations Lead'}},fresh),null);
  assert.equal(repairLinkedInTitle(rec,{...fresh,url:'https://www.linkedin.com/jobs/view/456/'}),null);
  assert.equal(repairLinkedInTitle(rec,{...fresh,title:'About the job'}),null);
});

test('title, company and location come out of every site paste', () => {
  for (const site of SITES) {
    const job = cleanPosting({ text: paste(site) });
    assert.deepEqual([job.title, job.company, job.location], ['Data Analyst', 'Brightline Health', 'Denver, CO'], site);
    assert.equal(job.warnings, undefined, site);
  }
});

test('a cleaned paste scores like the bare posting, with no requirements from page chrome', () => {
  const base = localFitScore(CLEAN, DOCS);
  const baseAts = atsScore(CLEAN, RESUME);
  for (const site of SITES) {
    const job = cleanPosting({ text: paste(site) });
    const fit = localFitScore(job, DOCS);
    const ats = atsScore(job, RESUME);
    assert.ok(Math.abs(fit.score - base.score) <= 2, `${site}: fit ${fit.score} vs ${base.score}`);
    assert.ok(Math.abs(ats.score - baseAts.score) <= 2, `${site}: ats ${ats.score} vs ${baseAts.score}`);
    assert.deepEqual(fit.missingSkills, base.missingSkills, site);
    assert.deepEqual(ats.knockouts, baseAts.knockouts, site);
  }
});

test("Indeed's profile insights (the viewer's skills) don't become requirements", () => {
  const job = cleanPosting({ text: paste('indeed') });
  assert.ok(!/Kubernetes|Certified Public Accountant|Do you have/.test(job.text));
  assert.ok(/\$75,000 - \$90,000/.test(job.text), 'pay stays for the salary dealbreaker');
});

test('application forms, self-identification text and other jobs are cut', () => {
  assert.ok(!/OMB Control Number|First Name|Disfigurement/.test(cleanPosting({ text: paste('greenhouse') }).text));
  assert.ok(!/Senior Software Engineer|followers|Premium/.test(cleanPosting({ text: paste('linkedin') }).text));
  assert.ok(!/requisition|Workday, Inc|Similar Jobs/.test(cleanPosting({ text: paste('workday') }).text));
});

test('fields the caller already knows win over guesses', () => {
  const job = cleanPosting({ text: paste('linkedin'), title: 'Data Analyst II', company: 'Brightline' });
  assert.equal(job.title, 'Data Analyst II');
  assert.equal(job.company, 'Brightline');
  assert.equal(cleanPosting({ text: paste('linkedin'), title: 'About the job' }).title, 'Data Analyst');
});

test('warns about cut-off descriptions and lists of jobs', () => {
  const cut = cleanPosting({ text: `About the job\n${BODY.slice(0, 300)}…\n… see more` });
  assert.ok(cut.warnings.some((w) => /cut off/.test(w)));
  const list = ['Data Analyst', 'Acme', 'Denver, CO · 2 days ago', 'Easy Apply', 'Senior Analyst', 'Beta', 'Austin, TX · 1 week ago', 'Easy Apply', 'BI Developer', 'Gamma', 'Remote · 3 days ago', 'Easy Apply', 'Analyst II', 'Delta', 'Boston, MA · 5 days ago', 'Easy Apply'].join('\n');
  assert.ok(cleanPosting({ text: list }).warnings.some((w) => /list of several jobs/.test(w)));
  // ...and they reach the fit score's notes.
  assert.ok(localFitScore(cut, DOCS).concerns.some((c) => /cut off/.test(c)));
});

test('company from the text when the header has none', () => {
  assert.equal(cleanPosting({ text: 'About the job\nAt Freddie Mac, our mission is big.\nFreddie Mac’s Investments Division is currently seeking a Quantitative Analytics Senior to build models.' }).company, 'Freddie Mac');
  assert.equal(cleanPosting({ text: 'Acme Robotics is hiring a Controls Engineer to design systems for our factory floor robots.' }).company, 'Acme Robotics');
});

test('markdown and alternative section headings are classified', () => {
  const kind = (heading) => classifyLines(`${heading}\n- SQL`)[1].kind;
  for (const h of ['**Requirements**', '## Qualifications', '### What you’ll need', 'Your Profile', 'The Ideal Candidate']) assert.equal(kind(h), 'required', h);
  for (const h of ['__Preferred Qualifications__', 'Additional Qualifications', 'Nice-to-Haves']) assert.equal(kind(h), 'preferred', h);
  assert.equal(kind('Key Responsibilities'), 'neutral');
  // What a benefits section lists is pay and perks: left out, not a requirement or a phrase.
  assert.equal(classifyLines('**Benefits**\n- SQL').length, 1);
});
