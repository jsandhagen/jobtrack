// Controlled resume variants for the same posting, where the right order is
// not in doubt. Each judgment says the first variant should score higher than
// the second. Built around what production matchers and recruiter research
// agree on:
//  - must-haves dominate: missing one hurts more than all nice-to-haves help
//    (recruiters screen conjunctively; HiredScore grades on basic quals first)
//  - a related skill (Power BI for Tableau) is partial credit, not zero
//    (LinkedIn's skill ontology; Textkernel normalises related skills)
//  - evidence in recent work beats a skills-list mention or an old role
//    (Textkernel's recency and cross-field boosting)
//  - having held the role's title matters (Textkernel/Sovren JobTitles)

const header = (title) => `Alex Kim\nalex@example.com · (555) 222-3333 · Denver, CO\n${title}\n`;

function resume({ title = 'Data Analyst', bullets, older = null, skills = '', years = [2019, 'Present'], degree = 'B.S. Statistics, State University, 2019' }) {
  return `${header(title)}
Experience
${title}, Northwind Clinics, Jan ${years[0]} – ${years[1]}
${bullets.map((b) => `- ${b}`).join('\n')}
${older ? `${older.title}, Contoso, Jan ${older.from} – Dec ${older.to}\n${older.bullets.map((b) => `- ${b}`).join('\n')}\n` : ''}
Education
${degree}

Skills
${skills}`;
}

const ANALYST_POSTING = {
  title: 'Data Analyst',
  company: 'Brightline Health',
  location: 'Denver, CO',
  text: `We're looking for a Data Analyst to join our analytics team.

What you'll do
- Build and maintain dashboards in Tableau
- Write SQL to pull and clean claims data from our warehouse
- Present findings to finance and operations stakeholders

Requirements
- 3+ years of experience in data analysis
- Strong SQL skills
- Experience building dashboards in Tableau
- Experience with Excel
- Bachelor's degree in a quantitative field

Nice to have
- Python
- Healthcare or claims data experience
- Snowflake`,
};

const base = ['Built Tableau dashboards for 40 clinic managers', 'Wrote SQL to clean claims data in Snowflake', 'Automated Excel reporting for the finance team', 'Presented findings to operations stakeholders'];
const A = {
  all: resume({ bullets: [...base, 'Built Python scripts to flag duplicate healthcare claims'], skills: 'SQL, Tableau, Excel, Python, Snowflake' }),
  required: resume({
    bullets: ['Built Tableau dashboards for 40 store managers', 'Wrote SQL to clean sales data in Postgres', 'Automated Excel reporting for the finance team', 'Presented findings to operations stakeholders'],
    skills: 'SQL, Tableau, Excel',
  }),
  related: resume({
    bullets: ['Built Power BI dashboards for 40 store managers', 'Wrote SQL to clean sales data in Postgres', 'Automated Excel reporting for the finance team', 'Presented findings to operations stakeholders'],
    skills: 'SQL, Power BI, Excel',
  }),
  skillsOnly: resume({
    bullets: ['Wrote SQL to clean sales data in Postgres', 'Automated Excel reporting for the finance team', 'Presented findings to operations stakeholders'],
    skills: 'SQL, Tableau, Excel',
  }),
  oldEvidence: resume({
    bullets: ['Wrote SQL to clean sales data in Postgres', 'Automated Excel reporting for the finance team', 'Presented findings to operations stakeholders'],
    older: { title: 'Reporting Analyst', from: 2012, to: 2014, bullets: ['Built Tableau dashboards for regional managers'] },
    skills: 'SQL, Excel',
  }),
  missingOneReq: resume({
    bullets: ['Wrote SQL to clean claims data in Snowflake', 'Automated Excel reporting for the finance team', 'Built Python scripts to flag duplicate healthcare claims', 'Presented findings to operations stakeholders'],
    skills: 'SQL, Excel, Python, Snowflake',
  }),
  missingTwoReq: resume({
    bullets: ['Wrote SQL to clean claims data in Snowflake', 'Built Python scripts to flag duplicate healthcare claims', 'Presented findings to operations stakeholders'],
    skills: 'SQL, Python, Snowflake',
  }),
  otherTitle: resume({
    title: 'Marketing Coordinator',
    bullets: ['Built Tableau dashboards for campaign results', 'Wrote SQL to pull campaign data', 'Automated Excel reporting for the marketing team', 'Presented findings to stakeholders'],
    skills: 'SQL, Tableau, Excel',
  }),
  junior: resume({ years: [2025, 'Present'], bullets: base.slice(0, 3), skills: 'SQL, Tableau, Excel' }),
  noDegree: resume({ bullets: base, skills: 'SQL, Tableau, Excel', degree: 'Coursework in Statistics, Denver Community College' }),
};

const ENGINEER_POSTING = {
  title: 'Frontend Engineer',
  company: 'Acme',
  text: `Requirements
- 4+ years building web applications
- React and TypeScript
- Experience with REST APIs
- Unit testing with Jest

Nice to have
- GraphQL
- AWS
- Accessibility (WCAG)`,
};
const eng = (title, bullets, skills, from = 2018) => resume({ title, bullets, skills, years: [from, 'Present'], degree: 'B.S. Computer Science, State University, 2018' });
const E = {
  all: eng('Frontend Engineer', ['Built React and TypeScript apps used by 2M people', 'Designed REST API and GraphQL integrations', 'Wrote Jest unit tests for every component', 'Deployed on AWS', 'Led WCAG accessibility audits'], 'React, TypeScript, Jest, GraphQL, AWS'),
  required: eng('Frontend Engineer', ['Built React and TypeScript apps used by 2M people', 'Designed REST API integrations', 'Wrote Jest unit tests for every component'], 'React, TypeScript, Jest'),
  related: eng('Frontend Engineer', ['Built Vue and TypeScript apps used by 2M people', 'Designed REST API integrations', 'Wrote Jest unit tests for every component'], 'Vue, TypeScript, Jest'),
  missingOneReq: eng('Frontend Engineer', ['Built React and JavaScript apps used by 2M people', 'Designed REST API and GraphQL integrations', 'Deployed on AWS', 'Led WCAG accessibility audits'], 'React, JavaScript, GraphQL, AWS'),
  azure: eng('Frontend Engineer', ['Built React and TypeScript apps used by 2M people', 'Designed REST API integrations', 'Wrote Jest unit tests for every component', 'Deployed on Azure'], 'React, TypeScript, Jest, Azure'),
  backendTitle: eng('Backend Engineer', ['Built React and TypeScript admin tools', 'Designed REST API integrations', 'Wrote Jest unit tests'], 'React, TypeScript, Jest'),
};

// [posting, better, worse, why]
const JUDGMENTS = [
  [ANALYST_POSTING, A.all, A.required, 'nice-to-haves add on top of all must-haves'],
  [ANALYST_POSTING, A.required, A.missingOneReq, 'all must-haves beats a missing must-have plus every nice-to-have'],
  [ANALYST_POSTING, A.missingOneReq, A.missingTwoReq, 'each missing must-have costs more'],
  [ANALYST_POSTING, A.required, A.related, 'the exact tool beats a related one'],
  [ANALYST_POSTING, A.related, A.missingOneReq, 'a related tool (Power BI for Tableau) is partial credit'],
  [ANALYST_POSTING, A.required, A.skillsOnly, 'shown in work beats only listed in skills'],
  [ANALYST_POSTING, A.skillsOnly, A.missingOneReq, 'listed in skills still counts for something'],
  [ANALYST_POSTING, A.required, A.oldEvidence, 'recent evidence beats a role from a decade ago'],
  [ANALYST_POSTING, A.oldEvidence, A.missingOneReq, 'old evidence still counts for something'],
  [ANALYST_POSTING, A.required, A.otherTitle, 'having held the title matters'],
  [ANALYST_POSTING, A.required, A.junior, 'one year against three is a gap'],
  [ANALYST_POSTING, A.required, A.noDegree, 'a required degree counts'],
  [ENGINEER_POSTING, E.all, E.required, 'nice-to-haves add on top of all must-haves'],
  [ENGINEER_POSTING, E.required, E.missingOneReq, 'all must-haves beats a missing must-have plus nice-to-haves'],
  [ENGINEER_POSTING, E.required, E.related, 'the exact framework beats a related one'],
  [ENGINEER_POSTING, E.related, E.missingOneReq, 'Vue for React is partial credit'],
  [ENGINEER_POSTING, E.azure, E.required, 'Azure is partial credit for nice-to-have AWS'],
  [ENGINEER_POSTING, E.required, E.backendTitle, 'having held the title matters'],
];

// Absolute expectations: [posting, resume, min, max, why]
const BANDS = [
  [ANALYST_POSTING, A.all, 85, 100, 'meets everything'],
  [ANALYST_POSTING, A.required, 75, 95, 'meets every must-have'],
  [ANALYST_POSTING, A.missingTwoReq, 0, 64, 'missing two of five must-haves'],
  [ENGINEER_POSTING, E.all, 85, 100, 'meets everything'],
  [ENGINEER_POSTING, E.required, 75, 95, 'meets every must-have'],
];

module.exports = { JUDGMENTS, BANDS, ANALYST_POSTING, ENGINEER_POSTING, A, E };
