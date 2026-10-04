// A CI manager's reader wants the competitive work you've done: every bullet
// that shows it, not one CI bullet and the rest program management with
// bigger numbers (feedback, Oct 2026). A fictional candidate shaped like the
// case that showed it.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/main/bullets');
const { resumeStrength } = require('../src/main/resumeStrength');

const RESUME = `Riley Moreno
Arlington, VA | riley@example.com
PROFESSIONAL SUMMARY
Strategy consultant in a SaaS CTO office.
EXPERIENCE
Northwind Software McLean, VA
Senior Strategy Consultant, Office of the CTO Oct. 2022 – Sep. 2026
● Led competitive intelligence for the CTO by tracking competitor strategies, product launches and pricing to produce battlecards, positioning briefs and objection handling guides
● Owned end-to-end program management of 220+ enterprise customer and partner engagements, establishing operating cadences, tracking milestones and delivering structured reporting to Sales leadership
● Served as cross-functional program coordinator across 78 enterprise accounts, standardizing engagement processes and ensuring initiatives were executed on time
● Led operations and program management for seven key technology partnerships (AWS, SAP, Red Hat), owning KPI/OKR tracking, developing training materials, and securing and managing $3M+ in partner sponsorship funding
● Acted as project manager for complex, multi-departmental initiatives on behalf of the CTO across sales, marketing, customer success, operations, and finance teams
● Executed $9M in customer transactions via AWS Marketplace with marketing, sales and product teams
● Served as primary strategic liaison between the CTO and regional revenue teams across Sales, Marketing, and Customer Success, representing business priorities to senior leadership
● Built detailed analytical reports and dashboards using SQL and Excel to track program performance, surface risks, identify adoption trends, and deliver data-driven recommendations
● Translated complex data and technical concepts into executive-ready insights through business review presentations and Excel- and SQL-driven dashboards for senior leadership
● Drove cross-functional GTM initiatives from planning to execution by aligning Sales, Marketing, and Product on priorities, timelines, and success metrics across 12 launches
● Identified and implemented AI productivity tools and workflows across a 40-person team, cutting reporting time by 30%
● Conducted due diligence and financial analysis across strategic partnership opportunities worth $25M+, building models for executive investment decisions
● Used AI tooling daily to accelerate competitive research, draft asset first passes, summarize market signals, and prototype messaging, rebuilding core intelligence workflows to increase output and speed across the function
● Served as strategic advisor to senior leaders across Product, Strategy, and GTM by framing competitive questions, identifying patterns across win/loss trends and deal data, and preparing talking points for 200+ customer, partner, and analyst engagements (Gartner, Forrester)
Fabrikam Advisors Washington, D.C.
Consultant Aug. 2020 – Sep. 2022
● Designed financial reporting programs for Fortune 500 clients using SQL, Power BI and Python
● Built and maintained client databases from raw datasets and reporting frameworks
EDUCATION
University of Richmond
B.A. in Economics 2020`;

// Torq's posting, from the CI fixtures (test/fixtures/allianceOpportunities.js).
const A = require('./fixtures/allianceOpportunities');
const JOB = Object.values(A.POSTINGS || A.P || A).find((p) => p && p.company === 'Torq');

const CI = /competit|win\/loss/i;

test('the optimized page carries every bullet that shows the competitive work, not program bullets in their place', () => {
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(RESUME)).bank;
  const { doc } = B.optimizeResume({ bank, job: JOB, profile: { name: 'Riley Moreno' } });
  const page = doc.roles.flatMap((r) => r.bullets.map((b) => b.text));
  const onPage = page.filter((t) => CI.test(t)).length + (CI.test(doc.summary) && /win\/loss/i.test(doc.summary) ? 1 : 0);
  assert.equal(onPage, 3, page.join('\n'));
});

test('resume strength counts depth in the titled work', () => {
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(RESUME)).bank;
  const { ranked } = B.rankBullets(JOB, bank);
  const role = (texts) => ({ summary: '', roles: [{ experienceId: bank.experiences[0].id, title: 'Senior Strategy Consultant', bullets: texts.map((t) => ({ bulletId: (ranked.find((r) => r.text === t) || {}).id, text: t })) }] });
  const ci = ranked.filter((r) => CI.test(r.text)).map((r) => r.text);
  const other = ranked.filter((r) => !CI.test(r.text) && r.experienceId === bank.experiences[0].id).map((r) => r.text);
  const thin = resumeStrength(role([ci[0], ...other.slice(0, 4)]), JOB, { ranked });
  const deep = resumeStrength(role([...ci, ...other.slice(0, 2)]), JOB, { ranked });
  assert.ok(thin.parts.depth < 1 && deep.parts.depth === 1, JSON.stringify([thin.parts, deep.parts]));
});
