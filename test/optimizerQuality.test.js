// What a walkthrough with a real strategy candidate's library turned up: the
// free optimizer repeating one accomplishment in two wordings, scoring below
// the untailored page, keeping PDF line-break debris and "Current" dates; and
// on the Claude path, internships put back that the prompt had left off and
// possessives ("Acme's") flagged as unknown names. The candidate here is
// fictional; the patterns are the ones found.
const test = require('node:test');
const assert = require('node:assert/strict');

const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const draft = require('../src/main/draft');
const G = require('../src/main/grounding');
const P = require('../src/main/prompts');
const { sameFact, repeatOf } = require('../src/shared/resumeCheck');
const { atsScore, postingPhrases } = require('../src/main/atsScore');
const { htmlToText } = require('../src/main/resumeRender');
const { strategySummary } = require('../src/main/strategyResume');
const { guessKind } = require('../src/main/documents');

const RESUME_A = `Jordan Reyes
Arlington, VA | 555-010-2000 | jordan.reyes@example.com

PROFESSIONAL SUMMARY
Senior  Strategy  Consultant driving technology partnerships and go-to-market execution. Thrives in fast-
moving environments that demand rapid learning.

RELEVANT WORK EXPERIENCE
Northwind Software | B2B SaaS company                                   Reston, VA
Sr. Strategy Consultant - Office of the CTO                              Oct. 2022 – Current
● Executed $9M in customer transactions via AWS Marketplace by collaborating with marketing, sales, and product teams to develop enablement materials
● Led operations for seven key technology partnerships (AWS, SAP, Red Hat), owning KPI/OKR tracking and securing $3M+ in partner sponsorship funding
● Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), forecasting partnership-driven revenue and driving $9M+ in customer transactions
● Led competitive intelligence for the CTO, tracking competitor launches and pricing to produce battlecards, positioning briefs, and objection handling guides used by sales
● Built analytical reports and dashboards using SQL and Excel to track program performance and deliver recommendations to senior leadership
● Translated technical concepts into executive-ready insights through business review presentations and Excel- and SQL-driven dashboards for senior leadership
Fabrikam Advisory                                                        Washington, D.C.
Consultant                                                               Aug. 2020 – Oct. 2022
● Designed financial reporting programs for Fortune 500 clients using SQL, Power BI, and Python, translating complex datasets into forecasting models
● Built and maintained client databases from raw datasets and delivered ad-hoc reports to client cadences

EDUCATION
State University                                                         Richmond, VA
B.A. in Economics                                                        May 2020`;

const RESUME_B = `Jordan Reyes
jordan.reyes@example.com

PROFESSIONAL SUMMARY
Competitive intelligence lead who builds battlecards, win/loss analysis and sales enablement for B2B SaaS sales teams.

RELEVANT WORK EXPERIENCE
Northwind Software                                                       Reston, VA
Sr. Strategy Consultant - Office of the CTO                              Oct. 2022 – Current
● Advised product and GTM leaders by identifying patterns across win/loss trends and deal data for 200+ customer and analyst engagements`;

const CI_JOB = {
  title: 'Competitive Intelligence Manager',
  company: 'Contoso',
  text: `What you'll do
- Run the competitive intelligence program and sales enablement for field teams
- Build battlecards, competitive decks and objection handling guides
- Run win/loss interviews with sales and feed competitive signals into product decisions

What we're looking for
- 4+ years in competitive intelligence or product marketing in B2B SaaS
- Strong research skills: win/loss interviews, analyst reports, pricing pages
- Cross-functional work with sales, product and marketing`,
};

const PARTNER_JOB = {
  title: 'Partner Strategy Manager, AWS',
  company: 'Contoso',
  text: `Responsibilities
- Develop and execute an AWS partner strategy aligned to revenue goals
- Run joint business planning and quarterly business reviews with AWS
- Grow AWS Marketplace transactions and co-sell pipeline

Requirements
- 3+ years in partnerships or business development with AWS
- Experience with AWS Marketplace and partner programs
- Strong cross-functional collaboration with sales and marketing`,
};

function libraryBank() {
  let bank = B.emptyBank();
  bank = B.mergeIntoBank(bank, B.parseResume(RESUME_A), { id: 'a', name: 'a.pdf' }).bank;
  bank = B.mergeIntoBank(bank, B.parseResume(RESUME_B), { id: 'b', name: 'b.pdf' }).bank;
  return bank;
}
const pageText = (doc) => htmlToText(R.renderHtml(R.compact(doc)));
const profile = { name: 'Jordan Reyes', email: 'jordan.reyes@example.com' };

test('one accomplishment told twice is recognised: the same figure for the same thing, or one deliverable with the same tools', () => {
  const [marketplace, partners, qbr, ci, dashboards, insights] = B.parseResume(RESUME_A).experiences[0].bullets.map((b) => b.text);
  assert.ok(sameFact(marketplace, qbr), '$9M and $9M+ in customer transactions');
  assert.ok(sameFact(partners, qbr), 'seven partnerships, twice');
  assert.ok(sameFact(dashboards, insights), 'SQL and Excel dashboards, twice');
  assert.ok(!sameFact(marketplace, partners), '$9M in transactions and $3M+ in funding are two facts');
  assert.ok(!sameFact(ci, dashboards));
  assert.ok(!sameFact('Grew revenue 20% in 2023', 'Cut churn 20% in 2024 with onboarding emails'), 'the same number about different things');
  assert.ok(repeatOf(qbr, marketplace));
});

test('PDF line-break debris is cleaned on import, and every resume keeps its summary', () => {
  assert.equal(B.tidyText('Thrives in fast- moving  teams with Excel- and SQL-driven dashboards'), 'Thrives in fast-moving teams with Excel- and SQL-driven dashboards');
  const bank = libraryBank();
  assert.match(bank.summary, /^Senior Strategy Consultant .* fast-moving environments/);
  assert.equal(bank.summaries.length, 2);
});

test('the optimized page never repeats an accomplishment, says "Present", and reads at least as well as the untailored page', () => {
  const bank = libraryBank();
  for (const job of [CI_JOB, PARTNER_JOB]) {
    const opt = B.optimizeResume({ profile, bank, job });
    const bullets = opt.doc.roles.flatMap((r) => r.bullets.map((b) => b.text));
    for (let i = 0; i < bullets.length; i++) for (let j = i + 1; j < bullets.length; j++) assert.ok(!repeatOf(bullets[i], bullets[j]), `${job.title}: "${bullets[i].slice(0, 40)}" and "${bullets[j].slice(0, 40)}"`);
    assert.equal(opt.doc.roles[0].dates, 'Oct. 2022 – Present');
    assert.doesNotMatch(opt.doc.summary, /fast- moving|\s{2}/);
    const tuned = atsScore(job, pageText(opt.doc), { profile }).score;
    const baseline = atsScore(job, pageText(B.baselineDoc({ profile, bank, job })), { profile }).score;
    assert.ok(tuned >= baseline, `${job.title}: optimized ${tuned} vs untailored ${baseline}`);
  }
  // The competitive-intelligence page leads with that work, win/loss included.
  const ci = B.optimizeResume({ profile, bank, job: CI_JOB }).doc.roles[0].bullets.map((b) => b.text).join('\n');
  assert.match(ci, /battlecards/);
  assert.match(ci, /win\/loss/);
});

test('the generated summary names the title and team plainly and the kinds of work the page shows', () => {
  const doc = {
    roles: [{ experienceId: 'e1', title: 'Sr. Strategy Consultant - Office of the CTO', organization: 'Northwind', dates: 'Oct 2021 – Present', bullets: [
      { bulletId: 'b1', text: 'Led competitive intelligence for the CTO, producing battlecards and positioning briefs for sales' },
      { bulletId: 'b2', text: 'Built dashboards and analytics in SQL to track partnership revenue and pipeline for sales leadership across Sales, Marketing, and Product' },
    ] }],
  };
  const ranked = [{ id: 'b1', score: 10, strategy: [{ key: 'competition' }] }, { id: 'b2', score: 5, strategy: [{ key: 'analytics' }] }];
  const s = strategySummary({ title: 'Senior Manager, Competitive Strategy & Operations', text: 'Own competitive analysis, pipeline and revenue reporting, dashboards and go-to-market planning.' }, doc, ranked);
  assert.match(s, /^Sr\. Strategy Consultant in the Office of the CTO at Northwind with \d years of experience, working across /);
  assert.doesNotMatch(s, / and [a-z ]+ and [a-z ]+ and /, 'one "and" in the list');
  assert.doesNotMatch(s, /across Sales\.$/, '", Marketing" is a list item, not a clause to cut at');
});

test('posting phrases keep "win/loss" whole and drop instructions and qualities', () => {
  const phrases = postingPhrases(`Requirements
- Strong research: win/loss interviews, analyst reports, and pricing pages
- Comfortable maintaining structured frameworks like battlecards and producing content that sales actually use
- Activate co-sell motions and help products execute optimally
- Familiarity with ACE/Marketplace programs
- Sound judgment and business sense`, 'Contoso');
  assert.ok(phrases.includes('win/loss interviews'), phrases.join(' | '));
  for (const junk of ['loss interviews', 'maintaining structured frameworks', 'producing content', 'activate co-sell motions', 'products execute optimally', 'sound judgment', 'business sense', 'ace/marketplace programs']) assert.ok(!phrases.includes(junk), `${junk}: ${phrases.join(' | ')}`);
  assert.ok(phrases.includes('co-sell motions'));
});

test("Claude's draft keeps the roles it was given, and a possessive name is the name", () => {
  const bank = {
    experiences: [
      { id: 'e1', title: 'Sr. Strategy Consultant', organization: 'Northwind', dates: 'Oct 2022 – Current' },
      { id: 'e2', title: 'Consultant', organization: 'Fabrikam', dates: 'Aug 2020 – Oct 2022' },
      { id: 'e3', title: 'Finance Intern', organization: 'Tailspin', dates: 'Jun 2019 – Aug 2019' },
    ],
    bullets: [
      { id: 'b1', experienceId: 'e1', text: "Authored keynote presentations for Northwind's global events" },
      { id: 'b2', experienceId: 'e2', text: 'Designed financial reporting programs for Fortune 500 clients' },
      { id: 'b3', experienceId: 'e3', text: 'Produced reports on customer engagement trends' },
    ],
    education: [],
  };
  // The internship was left out of the prompt on purpose (resumeExperiences).
  const ids = draft.promptIds(bank, [], bank.experiences.slice(0, 2));
  const out = {
    summary: "Sr. Strategy Consultant in Northwind's CTO office who writes executive keynotes.",
    experience: [{ role_id: 'R1', bullets: [{ text: "Authored keynote presentations for Northwind's global events", from_bullet: 'B1', source_quote: '' }] }],
    skills: [],
    notes: [],
  };
  const library = bank.bullets.map((b) => b.text).join('\n');
  const { doc, checks } = draft.draftToDoc(out, { bank, profile: {}, library, posting: '', ids });
  assert.deepEqual(doc.roles.map((r) => r.organization), ['Northwind', 'Fabrikam'], 'Fabrikam put back, the internship not');
  assert.equal(doc.roles[0].dates, 'Oct 2022 – Present');
  assert.ok(!checks.some((c) => /northwind/i.test(c)), checks.join(' | '));
  assert.deepEqual(G.checkNewText("Led Contoso's launch", library), [`mentions "contoso", which isn't in your documents`], 'an unknown name is still caught');
});

test('the resume prompt names the required terms the page already has, so a rewrite keeps them', () => {
  const ats = atsScore(CI_JOB, RESUME_A, {});
  assert.ok(ats.matchedRequired.length, 'some required terms are on the page');
  const block = P.atsBlock ? P.atsBlock(CI_JOB, ats) : null;
  if (block) assert.match(block, /Required terms it already uses[^.]*sales/);
});

test('an impact statement or self-assessment is filed as what others say about your work, not as a resume', () => {
  assert.equal(guessKind('Impact_Statement_-_Third_Person_Perspective_1.pdf', 'Experience ... Skills ...'), 'recommendation');
  assert.equal(guessKind('Self-Assessment 2025.docx', 'experience and skills'), 'recommendation');
  assert.equal(guessKind('Jordan_Reyes_Resume.pdf', ''), 'resume');
});

test('"without a clear roadmap" is a working style, not a roadmap requirement', () => {
  const { classifyJobSkills } = require('../src/main/fitScore');
  const skills = classifyJobSkills(`Required qualifications
- 5–7 years in strategy consulting or corporate strategy
- High tolerance for ambiguity and comfort working on problems without a clear roadmap`);
  assert.ok(!skills.has('Roadmapping'), [...skills.keys()].join(', '));
  assert.ok(classifyJobSkills('Requirements\n- Build and maintain a quarterly roadmap with engineering').has('Roadmapping'));
});

test('a short posting\'s keywords skip the company pitch and the adjectives', () => {
  const job = {
    title: 'Senior Manager, Strategy & Operations',
    company: 'Contoso',
    text: `This role is an apprenticeship in executive problem-solving, with the full range of challenges and the chance to build judgment.

Required qualifications
- 5–7 years in strategy consulting, investment banking, or corporate strategy
- Excellent analytical and communication skills; minimum of internally and externally facing work`,
  };
  const missing = atsScore(job, 'Nothing relevant here.', {}).missingKeywords;
  for (const junk of ['apprenticeship', 'chance', 'full', 'range', 'challenges', 'excellent', 'minimum', 'internally', 'externally']) assert.ok(!missing.includes(junk), `${junk}: ${missing.join(', ')}`);
});

test('a name joined by "&" is one requirement: "MITRE ATT&CK", not "ATT" and "CK"', () => {
  const { requirementUnits } = require('../src/main/localFit');
  const job = { title: 'SOC Analyst', company: 'Contoso', text: 'Requirements\n- Knowledge of networking, Windows and Linux logs, and the MITRE ATT&CK framework' };
  const labels = requirementUnits(job).units.map((u) => u.label);
  const items = labels.flatMap((l) => l.replace(/^(?:one|several) of /, '').replace(/…$/, '').split(/,\s*/));
  assert.ok(items.includes('MITRE ATT&CK'), labels.join(' | '));
  assert.ok(!items.includes('ATT') && !items.includes('CK'), labels.join(' | '));
});
