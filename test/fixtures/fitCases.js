// A small benchmark for the offline fit score: three candidates in different
// fields, and postings ranging from great fits to clear mismatches. Each case
// says which band a sensible recruiter would put it in.
//   strong  >= 65     possible  40-72     weak  < 45     dealbreaker = capped

const FRONTEND = {
  profile: { targetRoles: 'Frontend engineer, UI engineer', workModes: 'remote, hybrid', minSalary: '120000', avoidKeywords: 'security clearance' },
  documents: [
    {
      kind: 'resume',
      text: `Jordan Rivera
Senior Frontend Engineer
jordan@example.com · (555) 123-4567 · Portland, OR

Experience
Senior Frontend Engineer, Bloom Labs, 2019 – Present
- Built a React and TypeScript design system used by 40 engineers across 6 teams
- Designed REST API and GraphQL integrations with the backend team
- Cut page load time 35% with code splitting and caching
- Mentored 4 junior engineers; led accessibility audits (WCAG 2.1)
Web Developer, Pine Studio, 2016 – 2019
- Shipped JavaScript, HTML and CSS sites for 30+ clients
- Set up Jest unit tests and GitHub Actions CI

Education
B.S. Computer Science, Oregon State University, 2016

Skills
JavaScript, TypeScript, React, Next.js, GraphQL, Node.js, CSS, Figma, Jest, Git, Storybook, accessibility`,
    },
    { kind: 'project', text: 'Petal design system: Storybook, React, Figma tokens, accessibility audits, cross-functional adoption with product designers.' },
  ],
};

const NURSE = {
  profile: { targetRoles: 'Registered nurse, RN', workModes: 'onsite', avoidKeywords: '' },
  documents: [
    {
      kind: 'resume',
      text: `Maria Chen, RN, BSN
maria.chen@example.com · (555) 222-1111

Experience
Registered Nurse, Telemetry Unit, St. Mary's Hospital, 2018 – Present
- Provide patient care for 5-6 telemetry patients per shift, cardiac monitoring and rhythm interpretation
- Document care in Epic EHR; administer medications and IV therapy
- Precept new graduate nurses; charge nurse 2 shifts per week
Staff Nurse, Medical-Surgical, County General, 2015 – 2018
- Post-operative care, wound care, patient education

Education
Bachelor of Science in Nursing (BSN), State University, 2015

Licenses & Certifications
Registered Nurse (RN) license, BLS, ACLS, PCCN`,
    },
  ],
};

const ACCOUNTANT = {
  profile: { targetRoles: 'Staff accountant, senior accountant', workModes: 'hybrid, remote', avoidKeywords: '' },
  documents: [
    {
      kind: 'resume',
      text: `Priya Nair, CPA
priya@example.com · (555) 333-4444

Experience
Senior Accountant, Northwind Traders, 2020 – Present
- Own month-end close, journal entries and account reconciliation for 3 entities
- Prepare GAAP financial statements and support the annual audit
- Automated accruals in Excel and NetSuite, saving 10 hours a month
Staff Accountant, Contoso CPA, 2017 – 2020
- Accounts payable and receivable, bank reconciliations, sales tax filings

Education
B.S. Accounting, State University, 2017

Skills
GAAP, NetSuite, QuickBooks, Excel (pivot tables, VLOOKUP), month-end close, reconciliation, audit support`,
    },
  ],
};

const P = {
  seniorFrontend: {
    title: 'Senior Frontend Engineer',
    company: 'Acme',
    text: `Senior Frontend Engineer (Remote)
About the role
Build delightful product experiences with our design team.
Requirements
- 5+ years of professional experience building web applications
- Expert in React and TypeScript
- Experience with GraphQL and REST APIs
- Experience with design systems and Storybook
Nice to have
- Next.js
- Accessibility expertise
Salary range: $150,000 - $185,000. Benefits: health, 401k.`,
  },
  fullstack: {
    title: 'Full Stack Engineer',
    company: 'Globex',
    text: `Full Stack Engineer — Hybrid
Requirements
- 4+ years building web applications
- JavaScript/TypeScript, React on the frontend
- Node.js and PostgreSQL on the backend
- Experience with AWS and Docker
Nice to have
- Kubernetes
- Terraform`,
  },
  javaBackend: {
    title: 'Senior Backend Engineer (Java)',
    company: 'Initech',
    text: `Senior Backend Engineer — remote
Requirements
- 6+ years of backend development in Java and Spring Boot
- Kafka, microservices and distributed systems
- Experience with Kubernetes, Terraform and AWS
- Strong SQL and PostgreSQL knowledge
Preferred
- Experience with Go`,
  },
  dataAnalyst: {
    title: 'Data Analyst',
    company: 'Umbrella',
    text: `Data Analyst (Hybrid)
Requirements
- 3+ years of experience in data analysis
- Advanced SQL; Tableau or Power BI dashboards
- Statistics, A/B testing and Python (pandas)
- Excellent communication skills
Nice to have
- dbt, Snowflake`,
  },
  staffFrontend: {
    title: 'Principal Frontend Architect',
    company: 'Hooli',
    text: `Principal Frontend Architect (Remote)
Requirements
- 15+ years of software engineering experience, 5+ in a technical leadership role
- Set frontend architecture across 20+ teams
- Deep expertise in React, TypeScript and web performance
- Experience leading organisation-wide migrations`,
  },
  clearance: {
    title: 'Frontend Engineer',
    company: 'Defense Co',
    text: `Frontend Engineer — On-site
Requirements
- Active TS/SCI security clearance required
- 3+ years with React and TypeScript
- Experience with REST APIs`,
  },
  lowPay: {
    title: 'Frontend Developer',
    company: 'Tiny Startup',
    text: `Frontend Developer (Remote)
Requirements
- 2+ years with React and JavaScript
- CSS and HTML
Pay: $60,000 - $75,000 per year`,
  },
  telemetryRN: {
    title: 'Registered Nurse - Telemetry',
    company: 'Providence Health',
    text: `Registered Nurse — Telemetry Unit (on-site)
Requirements
- Current RN license
- BLS and ACLS certification required
- 2+ years of acute care experience, telemetry preferred
- Experience with Epic EHR
Preferred
- BSN
- PCCN certification`,
  },
  icuRN: {
    title: 'ICU Registered Nurse',
    company: 'City Hospital',
    text: `ICU Registered Nurse (on-site)
Requirements
- Current RN license
- BLS, ACLS required
- 2+ years of ICU or critical care experience
- CCRN certification
- Experience with ventilator management and CRRT
Preferred
- BSN`,
  },
  seniorAccountant: {
    title: 'Senior Accountant',
    company: 'Fabrikam',
    text: `Senior Accountant (Hybrid)
Requirements
- CPA required
- 4+ years of accounting experience
- Month-end close, account reconciliation, journal entries
- Strong knowledge of GAAP
- Experience with NetSuite
Nice to have
- Big 4 audit experience`,
  },
};

const CASES = [
  // [candidate, posting, expected band]
  ['frontend', 'seniorFrontend', 'strong'],
  ['frontend', 'fullstack', 'possible'],
  ['frontend', 'javaBackend', 'weak'],
  ['frontend', 'dataAnalyst', 'weak'],
  ['frontend', 'staffFrontend', 'possible'],
  ['frontend', 'clearance', 'dealbreaker'],
  ['frontend', 'lowPay', 'dealbreaker'],
  ['frontend', 'telemetryRN', 'weak'],
  ['frontend', 'seniorAccountant', 'weak'],
  ['nurse', 'telemetryRN', 'strong'],
  ['nurse', 'icuRN', 'possible'],
  ['nurse', 'seniorFrontend', 'weak'],
  ['nurse', 'seniorAccountant', 'weak'],
  ['accountant', 'seniorAccountant', 'strong'],
  ['accountant', 'dataAnalyst', 'weak'],
  ['accountant', 'telemetryRN', 'weak'],
];

// Pairs where the first must score higher than the second.
const ORDERINGS = [
  ['frontend', 'seniorFrontend', 'fullstack'],
  ['frontend', 'fullstack', 'javaBackend'],
  ['frontend', 'seniorFrontend', 'staffFrontend'],
  ['nurse', 'telemetryRN', 'icuRN'],
  ['nurse', 'icuRN', 'seniorFrontend'],
  ['accountant', 'seniorAccountant', 'dataAnalyst'],
];

module.exports = { CANDIDATES: { frontend: FRONTEND, nurse: NURSE, accountant: ACCOUNTANT }, POSTINGS: P, CASES, ORDERINGS };
