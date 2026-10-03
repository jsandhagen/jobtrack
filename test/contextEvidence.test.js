// "Ask if applicable" reads your other documents before asking: a passage in
// an impact statement or review that proves what a posting asks for, but
// isn't a bullet yet, comes back as a draft bullet under the right role. The
// candidate here is fictional; the document shapes are the ones found in a
// real walkthrough (a third-person impact statement with headed sections).
const test = require('node:test');
const assert = require('node:assert/strict');

const B = require('../src/main/bullets');
const { resumeEnhancements, asBullet, passagesOf, topicOf } = require('../src/main/resumeContext');
const { requirementUnits } = require('../src/main/localFit');
const haveIt = require('../src/main/haveIt');

const RESUME = `Jordan Reyes
jordan.reyes@example.com

PROFESSIONAL SUMMARY
Strategy consultant in the office of the CTO.

RELEVANT WORK EXPERIENCE
Northwind Software | B2B SaaS company                                   Reston, VA
Sr. Strategy Consultant - Office of the CTO                              Oct. 2022 – Current
● Led competitive intelligence for the CTO, tracking competitor strategies and product launches to produce battlecards and objection handling guides
● Built analytical reports and dashboards using SQL and Excel to track program performance for senior leadership
● Owned program management of 200+ customer and partner engagements, establishing operating cadences and reporting to leadership
Fabrikam Advisory                                                        Washington, D.C.
Consultant                                                               Aug. 2020 – Oct. 2022
● Designed financial reporting programs for Fortune 500 clients using SQL and Python

EDUCATION
State University
B.A. in Economics                                                        May 2020`;

const IMPACT = {
  name: 'Impact_Statement.pdf',
  kind: 'recommendation',
  text: `Overview
Over the last two years, Jordan has grown from supporting projects to leading initiatives at Northwind.
● Public Sector Strategy – Drawing on executive meetings and research on competitors, Jordan developed several pitches highlighting Northwind's key selling points. These materials have been used in public sector sales meetings, influencing deals with the Army, Navy and DARPA. The repository, comprising over 120 unique slides, has also served as a training resource for the federal sales team at the most recent SKO.
● Sales Plays – Jordan collaborated with banking leaders, conducted competitive intelligence research, and incorporated internal feedback to develop the messaging for a financial services sales play. These materials were featured in SKO training, reviewed by over 300 people at Northwind, and are now used with customers.
○ Providing insights to sales teams on competitor technologies (ex. SAP, ServiceNow, Microsoft).
○ Exploring over 60 corporate development opportunities.
● Executive Initiatives – Jordan has played a significantly larger role in supporting the CTO over the last year.`,
};

const GOV_JOB = {
  title: 'Senior Manager, Strategy & Operations - Government Cloud',
  company: 'Contoso',
  text: `This role sits in a high-growth government cloud business.

Required qualifications
- 5–7 years in strategy consulting or corporate strategy
- Experience supporting public sector or government sales teams
- Comfort working on problems without a clear roadmap
- Strong analytical and communication skills`,
};

function bank() {
  return B.mergeIntoBank(B.emptyBank(), B.parseResume(RESUME), { id: 'r', name: 'resume.pdf' }).bank;
}
const profile = { name: 'Jordan Reyes' };

test('a third-person passage reads as a bullet: from the person on, headings and praise left out', () => {
  const names = ['Jordan', 'Reyes'];
  assert.equal(asBullet("Public Sector Strategy – Drawing on executive meetings and research on competitors, Jordan developed several pitches highlighting Northwind's key selling points.", names), "Developed several pitches highlighting Northwind's key selling points");
  assert.equal(asBullet('Jordan has researched, launched, and managed technology partnerships with Contoso and Fabrikam.', names), 'Researched, launched, and managed technology partnerships with Contoso and Fabrikam');
  assert.equal(asBullet('Exploring over 60 corporate development opportunities.', names), 'Explored over 60 corporate development opportunities');
  assert.equal(asBullet('Jordan has played a significantly larger role in supporting the CTO over the last year.', names), null, 'a role described, not work done');
  assert.equal(asBullet('These materials have been used in public sector sales meetings.', names), null, 'not a sentence about what the person did');
  const items = passagesOf(IMPACT.text);
  assert.ok(items.some((p) => p.startsWith('Providing insights to sales teams on competitor technologies (ex. SAP, ServiceNow, Microsoft)')), 'list items are their own passages');
});

test('what your documents show but your bank does not comes back as a draft bullet, with its source and role', () => {
  const b = bank();
  const asks = resumeEnhancements({ job: GOV_JOB, bank: b, profile, documents: [{ name: 'resume.pdf', kind: 'resume', text: RESUME }, IMPACT] });
  const fromDocs = asks.filter((a) => a.draft);
  assert.ok(fromDocs.length, asks.map((a) => a.text).join('\n'));
  const pitches = fromDocs.find((a) => /pitches/.test(a.draft));
  assert.ok(pitches, fromDocs.map((a) => a.draft).join('\n'));
  // What came of it is kept: the deals or the SKO repository, not just "developed pitches".
  assert.match(pitches.draft, /Army|SKO/);
  assert.equal(pitches.experienceId, b.experiences.find((e) => e.organization === 'Northwind Software').id, 'filed under the employer the document names');
  assert.equal(pitches.source.name, 'Impact Statement');
  assert.match(pitches.source.passage, /DARPA/);
  // Nothing already in the bank, and no praise.
  for (const a of fromDocs) {
    assert.ok(!/battlecards/.test(a.draft));
    assert.ok(!/larger role/.test(a.draft));
  }
  // "Without a clear roadmap" is a working style: never asked about.
  assert.ok(!asks.some((a) => /roadmap/i.test(a.topic)), asks.map((a) => a.topic).join(', '));
});

test('a working style ("without a clear roadmap") is not a requirement', () => {
  const labels = requirementUnits(GOV_JOB).units.map((u) => u.label);
  assert.ok(!labels.some((l) => /roadmap/i.test(l)), labels.join(', '));
});

test('questions leave out what you already show, and stay specific', () => {
  assert.equal(topicOf('several of AWS, ACE, CPPO, PPO…', 'executed $9m via aws marketplace'), 'ACE, CPPO or PPO');
  assert.equal(topicOf('one of Tableau, Power BI', ''), 'Tableau or Power BI');
  // "Do you have it?" asks the same way.
  assert.equal(haveIt.question('several of AWS, ACE, CPPO, PPO…', (o) => o === 'AWS'), 'ACE, CPPO or PPO');
  assert.deepEqual(haveIt.optionsOf('several of AWS, ACE, CPPO, PPO…'), ['AWS', 'ACE', 'CPPO', 'PPO']);
  // An industry your documents state isn't a question about your experience.
  const saasJob = { title: 'Partner Manager', company: 'Contoso', text: 'Requirements\n- Strong understanding of B2B SaaS in security\n- 3+ years in partnerships with AWS' };
  const asks = resumeEnhancements({ job: saasJob, bank: bank(), profile, documents: [{ name: 'resume.pdf', kind: 'resume', text: RESUME }] });
  assert.ok(!asks.some((a) => /enterprise software|saas/i.test(a.topic)), asks.map((a) => a.topic).join(', '));
});

test('a posting phrase covered in other words is asked about, but not a look-alike or a different audience', () => {
  const job = {
    title: 'Competitive Intelligence Manager',
    company: 'Contoso',
    text: `Requirements
- Strong research skills: secondary research, analyst reports, and pricing pages
- Track competitor launches and feed them to sales`,
  };
  const asks = resumeEnhancements({ job, bank: bank(), profile, documents: [] });
  const wording = asks.filter((a) => /^The posting says/.test(a.text));
  assert.ok(!wording.some((a) => /analytical reports|executive reports/.test(a.text)), wording.map((a) => a.text).join('\n'));
  assert.ok(wording.some((a) => /competitor launches/.test(a.text) && /product launches/.test(a.text)), wording.map((a) => a.text).join('\n'));
});

test('passages from your documents are offered for jobs you fit, not for stretch roles or on soft skills alone', () => {
  const b = bank();
  const docs = [{ name: 'resume.pdf', kind: 'resume', text: RESUME }, IMPACT];
  const offered = (job, fit) => resumeEnhancements({ job, bank: b, profile, documents: docs, fit }).filter((a) => a.draft);
  assert.ok(offered(GOV_JOB, 85).length, 'a good fit gets them');
  assert.equal(offered(GOV_JOB, 40).length, 0, 'a stretch role does not');
  // Communication alone isn't "strong evidence": a teaching job asks for it too.
  const teacher = { title: 'Elementary School Teacher', company: 'Contoso Schools', text: 'Responsibilities\n- Plan and deliver lessons for a class of 25 students\n- Communicate with parents and colleagues\n- Excellent communication and collaboration skills' };
  assert.ok(!offered(teacher, 70).some((a) => /strong evidence/.test(a.text)), offered(teacher, 70).map((a) => a.text).join('\n'));
});
