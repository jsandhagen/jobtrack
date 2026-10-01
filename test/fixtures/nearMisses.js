// Near-miss postings across fields: each shares a candidate's vocabulary
// (the tools, the setting, the title words) but is a different job. A
// sensible recruiter wouldn't call any of these more than a stretch.

const P = {};

// ---------- for a frontend engineer ----------

P.frontendSales = {
  title: 'Account Executive, Developer Tools',
  company: 'Pixelforge',
  text: `About the role
Sell Pixelforge, the React component platform, to engineering leaders at mid-market companies.

Responsibilities
- Prospect and build pipeline with frontend engineering teams and VPs of Engineering
- Run discovery calls and product demos of our React and TypeScript tooling
- Negotiate and close new business; hit a quarterly quota
- Forecast accurately in Salesforce

Requirements
- 3+ years of SaaS sales experience, ideally selling developer tools
- Track record of exceeding quota
- Familiarity with JavaScript, React and how frontend teams work
- Strong negotiation and closing skills`,
};

P.frontendInstructor = {
  title: 'Web Development Bootcamp Instructor',
  company: 'CodeRise Academy',
  text: `About the job
Teach our 16-week full-time web development bootcamp.

Responsibilities
- Deliver daily lectures on JavaScript, React, HTML and CSS to cohorts of 25 adult learners
- Grade projects and give written feedback
- Hold office hours and mentor students through career changes
- Improve curriculum and lesson plans with the curriculum team

Requirements
- 2+ years of professional web development experience
- 2+ years of teaching, tutoring or training experience
- Experience designing curriculum and lesson plans
- Excellent public speaking`,
};

P.uxResearcher = {
  title: 'UX Researcher',
  company: 'Fernleaf Health',
  text: `Responsibilities
- Plan and run usability studies, interviews and surveys for patient-facing apps
- Synthesize findings into personas, journey maps and insights for product teams
- Partner with designers in Figma and engineers on accessibility improvements
- Build a research repository

Requirements
- 4+ years of UX research experience
- Mastery of qualitative and quantitative research methods
- Experience with usability testing tools such as UserTesting or Maze
- Survey design and statistical analysis
- A research portfolio`,
};

// ---------- for a registered nurse ----------

P.nurseRecruiter = {
  title: 'Nurse Recruiter',
  company: 'St. Agnes Health',
  text: `About the job
Hire registered nurses for our 4 hospitals.

Responsibilities
- Manage full-cycle recruiting for RN, LPN and CNA roles across telemetry, ICU and med-surg units
- Source candidates through job boards, nursing schools and career fairs
- Screen applicants, schedule interviews with nurse managers and extend offers
- Track candidates in Workday Recruiting and report on time-to-fill

Requirements
- 2+ years of healthcare recruiting experience
- Experience with applicant tracking systems
- Knowledge of nursing roles and licensure requirements
- Bachelor's degree in human resources or related field`,
};

P.medicalDeviceSales = {
  title: 'Clinical Sales Representative, Cardiac Monitoring',
  company: 'Vitalwave Medical',
  text: `About the role
Sell Vitalwave's cardiac monitoring systems to hospitals in the Southeast territory.

Responsibilities
- Build relationships with nurse managers, cardiologists and hospital purchasing
- Demonstrate telemetry and cardiac monitoring products and train clinical staff
- Grow territory revenue and meet quarterly sales quota
- Manage pipeline in Salesforce

Requirements
- 3+ years of medical device sales with a record of exceeding quota
- Clinical background (RN) a plus
- Willingness to travel 60% within the territory
- Bachelor's degree`,
};

P.nursingInformatics = {
  title: 'Epic Clinical Applications Analyst',
  company: 'Riverbend Health',
  text: `Responsibilities
- Build and maintain Epic ClinDoc and Orders content: flowsheets, order sets and navigators
- Gather requirements from nursing and physician users and translate them into build
- Test upgrades and troubleshoot tickets for the inpatient clinical teams
- Write SQL queries against Clarity for reporting

Requirements
- Epic ClinDoc or Orders certification (or ability to obtain within 6 months of hire)
- 3+ years of Epic build experience
- Experience with SQL and Clarity reporting
- Clinical experience as a nurse is preferred`,
};

// ---------- for an accountant ----------

P.accountingSoftwareSales = {
  title: 'Account Executive, Accounting Software',
  company: 'Ledgerly',
  text: `About the role
Sell Ledgerly's close automation software to CFOs and controllers.

Responsibilities
- Prospect into finance teams at mid-market companies
- Run demos of month-end close, reconciliation and reporting workflows
- Close new business and hit an annual quota of $900K ARR
- Manage deals in Salesforce

Requirements
- 3+ years of B2B SaaS sales with quota attainment
- Understanding of accounting and the month-end close process
- Excellent negotiation skills`,
};

P.financialAdvisor = {
  title: 'Financial Advisor',
  company: 'Summit Wealth',
  text: `About the job
Help individuals and families plan for retirement.

Responsibilities
- Build a book of clients through networking and referrals
- Create financial plans covering retirement, insurance and estate planning
- Recommend investment portfolios and rebalance accounts
- Meet monthly asset-gathering goals

Requirements
- Series 7 and Series 66 licenses (or obtain within 90 days)
- 2+ years of client-facing financial services experience
- Strong sales and relationship-building skills
- CFP certification a plus`,
};

// ---------- for a backend software engineer ----------

P.solutionsEngineerSales = {
  title: 'Sales Engineer',
  company: 'Kafkaesque Cloud',
  text: `About the role
Partner with account executives to win enterprise customers for our managed Kafka platform.

Responsibilities
- Run technical discovery and product demos for prospects
- Build proofs of concept with Java and Kafka
- Answer RFPs and security questionnaires
- Help close deals and support quota attainment for your region
- Travel up to 40% to customer sites

Requirements
- 3+ years in a customer-facing technical role such as sales engineering or solutions consulting
- Working knowledge of Kafka, Java and AWS
- Excellent presentation and communication skills`,
};

P.technicalWriter = {
  title: 'Technical Writer, APIs',
  company: 'Fernwood Labs',
  text: `Responsibilities
- Write and maintain API reference docs, tutorials and guides for our REST and Kafka APIs
- Work with backend engineers to understand Java services and document them
- Own the docs-as-code pipeline in Git and Markdown
- Edit release notes and style guides

Requirements
- 3+ years of technical writing experience for developer audiences
- A portfolio of published developer documentation
- Ability to read Java or Python code samples
- Experience with docs-as-code tools such as Docusaurus or MkDocs`,
};

P.itRecruiterEngineering = {
  title: 'Technical Recruiter, Engineering',
  company: 'Quarry Logistics',
  text: `About the job
Hire backend and platform engineers for our Java, Kafka and Kubernetes teams.

Responsibilities
- Partner with engineering managers to define hiring plans for backend engineers
- Source candidates with Java, Kotlin, AWS and Kubernetes experience on LinkedIn and GitHub
- Run phone screens and coordinate technical interviews
- Close candidates and negotiate offers

Requirements
- 3+ years of technical recruiting experience
- Understanding of backend engineering skills and tech stacks
- Experience with Greenhouse or a similar ATS
- Strong sourcing skills, including Boolean search`,
};

// ---------- for a project manager ----------

P.constructionPM = {
  title: 'Construction Project Manager',
  company: 'Ironside Builders',
  text: `Responsibilities
- Manage commercial construction projects from preconstruction through closeout, up to $25M
- Manage subcontractors, RFIs, submittals and change orders
- Build and track project schedules in Primavera P6 and budgets
- Run owner-architect-contractor meetings and site safety

Requirements
- 5+ years of commercial construction project management
- Experience with Procore and Primavera P6
- Knowledge of building codes and construction methods
- Degree in construction management or civil engineering
- OSHA 30 certification`,
};

// [candidate, posting, min, max, why]
const BANDS = [
  ['frontend', 'frontendSales', 0, 44, 'a sales job that sells to frontend teams'],
  ['frontend', 'frontendInstructor', 0, 55, 'they could teach it, but teaching experience is required'],
  ['frontend', 'uxResearcher', 0, 44, 'research, not engineering'],
  ['nurse', 'nurseRecruiter', 0, 40, 'recruiting nurses, not nursing'],
  ['nurse', 'medicalDeviceSales', 0, 44, 'a sales job that sells to nurses'],
  ['nurse', 'nursingInformatics', 0, 50, 'Epic build, not patient care; nursing only preferred'],
  ['accountant', 'accountingSoftwareSales', 0, 44, 'a sales job that sells to accountants'],
  ['accountant', 'financialAdvisor', 0, 44, 'licensed sales of investments, not accounting'],
  ['softwareEngineer', 'solutionsEngineerSales', 0, 55, 'a sales role; the technical skills carry over'],
  ['softwareEngineer', 'technicalWriter', 0, 44, 'writing, not engineering'],
  ['softwareEngineer', 'itRecruiterEngineering', 0, 35, 'recruiting engineers, not engineering'],
  ['projectManager', 'constructionPM', 0, 44, 'construction, not IT'],
];

module.exports = { POSTINGS: P, BANDS };
