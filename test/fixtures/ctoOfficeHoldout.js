// Held out for the CTO-office persona (ctoOfficePersona.js): postings found
// by web search after the first round of fixes, rebuilt from what search
// returned about the real ones (noted beside each), and the same person's
// resume in two other formats people actually send (a LinkedIn "Save to PDF"
// export and a two-line-header layout with "•" bullets). Companies are renamed.
//
// Labels (BANDS, ORDER, FORMAT) were written before any of these was scored.

const P = {};

// Modelled on Cyera "Strategy & Operations Manager, Office of the CTO" (June 2026).
P.soOctoSecurity = {
  title: 'Strategy & Operations Manager, Office of the CTO',
  company: 'Veridian Security',
  location: 'New York, NY or Remote (US)',
  text: `About the role
The Office of the CTO drives Veridian's most important cross-company technology initiatives. You'll sit at the intersection of executive strategy and hands-on execution.

What you'll do
- Partner with the CTO to define priorities and turn them into plans, owners and milestones
- Run strategic initiatives across Product, Engineering and Go-to-Market
- Build the operating rhythm for the CTO's organization: planning, OKRs, business reviews
- Synthesize complex information in business and technical contexts into crisp recommendations
- Prepare executive and board materials

What you bring
- 5+ years of experience in Strategy & Operations, Account Management, Solutions Engineering, Program Management, Consulting, Chief of Staff, or similar roles
- Experience working closely with Product and Engineering teams
- Strong operational instincts and attention to detail
- Comfort operating at the intersection of executive strategy and hands-on execution
- Excellent written communication

Nice to have
- Experience at a cybersecurity or data company`,
};

// Modelled on CVS Health "Senior Manager, Technology Strategy and Operations".
P.techStratOpsHealth = {
  title: 'Senior Manager, Technology Strategy and Operations',
  company: 'Harbor Health',
  location: 'Hartford, CT (Hybrid)',
  text: `Position Summary
Lead strategy and operations for the Infrastructure and Cybersecurity technology organization.

Responsibilities
- Develop the multi-year strategy and roadmap for infrastructure and cybersecurity
- Run portfolio planning, OKRs and executive reporting for the CIO's leadership team
- Drive organizational change programs
- Prepare communications for senior leadership and the Board of Directors

Required Qualifications
- 7+ years of experience in Strategy, Business Operations or Management Consulting, and/or Product Management
- 3+ years supporting Infrastructure or Cybersecurity Technology Strategy
- 3+ years driving organizational change
- 3+ years in a role with highly visible written and verbal communication across all levels of enterprise leadership up to the Board of Directors

Education
- Bachelor's degree required

Pay Range: $123,000 - $246,000`,
};

// Modelled on Pluralsight "Chief of Staff, Office of the CTO".
P.cosOctoSenior = {
  title: 'Chief of Staff, Office of the CTO',
  company: 'Learnwell',
  location: 'Remote (US)',
  text: `Responsibilities
- Act as a strategic partner to the CTO across product, engineering and data
- Lead technology strategy development and annual planning
- Run the executive operating cadence and drive cross-functional initiatives to completion
- Represent the CTO in leadership forums

Qualifications
- 10+ years of experience in technology strategy, operations, or consulting
- Experience partnering with executive leaders in a technology organization
- Exceptional communication and executive presence
- Bachelor's degree; MBA preferred`,
};

// Modelled on Korn Ferry "AI Strategy Manager (IT Transformation)" (contract, July 2026).
P.aiStrategyITTransformation = {
  title: 'AI Strategy Manager (IT Transformation)',
  company: 'Summit Interim',
  location: 'Santa Clara, CA',
  text: `Our client, a global technology company, is looking for an AI Strategy Manager to shape how its IT organization adopts AI.

Responsibilities
- Develop the AI strategy and roadmap for the IT organization
- Identify and prioritize AI use cases and build business cases quantifying value and ROI
- Define the operating model for scaling AI across IT
- Present recommendations to the CIO and IT leadership

Required
- Prior experience as an IT Strategy Consultant
- Proven track record of developing and executing AI strategies for large, enterprise-scale organizations
- Excellent executive communication

Preferred
- Experience quantifying AI value and ROI
- Experience with enterprise IT operating models
- Background on strategy consulting teams

Compensation: $170 - $200 per hour`,
};

// Modelled on Gap Inc. "Senior Strategy Manager - AI & Employee Enablement".
P.aiEnablementStrategy = {
  title: 'Senior Strategy Manager - AI & Employee Enablement',
  company: 'Lumen Apparel Group',
  location: 'San Francisco, CA',
  text: `About the role
Lead the strategy for how 80,000 employees use AI and enterprise platforms.

What you'll do
- Define the strategy and roadmap for AI-powered employee tools and enterprise platforms
- Prioritize use cases with business leaders and build business cases
- Lead vendor evaluations and partner with technology teams on delivery
- Measure adoption and value

Who you are
- 8-12+ years of experience in technology strategy, enterprise platforms, digital or employee enablement, or related fields
- Experience with generative AI tools and enterprise SaaS platforms
- Strong executive communication and storytelling
- Bachelor's degree`,
};

// Modelled on Intuit "Principal, Platform Strategy".
P.principalPlatformStrategy = {
  title: 'Principal, Platform Strategy',
  company: 'Ledgerwise',
  location: 'San Diego, CA',
  text: `Shape the strategy for Ledgerwise's AI-driven platform.

Responsibilities
- Define platform strategy, build/buy/partner decisions and investment cases
- Lead cross-functional strategic initiatives with product and engineering leaders
- Synthesize market and competitive insights into recommendations for executives

Qualifications
- 8+ years of total work experience, including 4+ in a data-driven role at a top-tier strategy consulting firm or in a respected company's strategy function
- Experience owning projects and relationships with senior stakeholders in an ambiguous environment
- Strong financial modeling skills
- MBA preferred`,
};

// Modelled on a Cloudera "Manager, Applied AI Strategy and Operations" listing in Washington, DC.
P.appliedAIStrategyOps = {
  title: 'Manager, Applied AI Strategy and Operations',
  company: 'Clearwater Data',
  location: 'Washington, DC',
  text: `Lead strategy and operations for how Clearwater applies AI across the company.

Responsibilities
- Identify and prioritize applied AI opportunities with business and technology leaders
- Evaluate AI vendors and models; run proofs of concept and build prototypes
- Build business cases and track value delivered
- Run the program cadence for AI initiatives and report to executives

Qualifications
- 5+ years of experience in strategy, consulting, operations or technology roles
- Hands-on familiarity with generative AI and large language models
- Experience at an enterprise software or data company
- Excellent communication skills
- Bachelor's degree

Salary: $144,000 - $180,000`,
};

// Modelled on Accenture "Software & Platforms Strategy Principal Director".
P.swPlatformsPrincipalDirector = {
  title: 'Software & Platforms Strategy Principal Director',
  company: 'Arbor Consulting',
  location: 'New York, NY',
  text: `Lead strategy engagements for software and platform companies.

Qualifications
- Minimum of 10 years of professional experience consulting for or working at a Software or Platform company, or a start-up
- MBA or equivalent graduate degree required
- Proven ability to influence and inspire senior executives and to sell and lead large engagements
- Hands-on experience applying generative AI, machine learning, or AI-powered platforms to solve real business problems
- Travel up to 80%`,
};

// Modelled on Pure Storage "Principal Technology Strategist".
P.principalTechStrategistStorage = {
  title: 'Principal Technology Strategist',
  company: 'Granite Storage',
  location: 'Columbus, OH',
  text: `Be the senior technical advisor to our largest commercial customers in the Central region.

Responsibilities
- Engage with Fortune 500 enterprises to influence technical decision-making
- Partner with account teams on strategic opportunities
- Present Granite's technology vision at executive briefings

Qualifications
- 10+ years of experience in enterprise infrastructure, including storage, virtualization and cloud
- Deep expertise in cloud computing, AI/ML, cybersecurity or data architecture
- Strong knowledge of enterprise storage solutions
- Proven track record of engaging with Fortune 500 enterprises
- Travel 40%`,
};

// Modelled on Staples "Manager, Sales Intelligence & AI Strategy" (Sept 2026).
P.salesIntelAIStrategy = {
  title: 'Manager, Sales Intelligence & AI Strategy',
  company: 'Office Depot Supply',
  location: 'Remote (US)',
  text: `Responsibilities
- Lead a team of analysts building sales dashboards and forecasting models
- Define how AI is applied to sales planning and account targeting
- Partner with sales leadership on performance insights

Qualifications
- 7+ years of experience in analytics, business intelligence, data science or related fields
- 3+ years leading people or cross-functional initiatives
- Expert SQL and Tableau or Power BI
- Bachelor's degree in a quantitative field

Pay range: $118,000 - $162,000`,
};

// Modelled on Amtrak "Director, AI and Analytics Platform Services".
P.aiPlatformDirector = {
  title: 'Director, AI and Analytics Platform Services',
  company: 'Capital Rail',
  location: 'Washington, DC',
  text: `Lead the engineering and delivery of enterprise platforms that support AI, agentic systems, automation and data self-service.

Responsibilities
- Lead platform engineering teams (40+ people) and vendors
- Own platform reliability, security and cost
- Set the platform roadmap

Qualifications
- 12+ years of experience in data and analytics engineering, including 5+ years leading engineering teams
- Expertise in Databricks, Snowflake or similar data platforms; cloud (AWS or Azure)
- Bachelor's degree in computer science or engineering`,
};

// Modelled on SaaS "Business Operations Manager, Engineering" postings (BizOps Network example JD and Glassdoor listings).
P.bizOpsEngineering = {
  title: 'Business Operations Manager, Engineering',
  company: 'Tessellate',
  location: 'Remote (US)',
  text: `Partner with engineering leadership to run the business of a 500-person engineering organization.

What you'll do
- Partner with the CTO's leadership team to identify and solve critical problems
- Run annual and quarterly planning, OKR goal setting and headcount planning
- Build financial models and dashboards for engineering spend
- Lead strategic and operational initiatives across teams

What you bring
- 5+ years in management consulting, strategy and operations, BizOps or a Chief of Staff role, ideally in a high-growth software company
- Strong financial modeling skills (Excel or Google Sheets)
- Stakeholder management and leading through influence
- Bachelor's degree`,
};

// ---------- near misses ----------

P.appianSolutionsArchitect = {
  title: 'Appian Solutions Architect',
  company: 'Northline Partners',
  location: 'Washington, DC',
  text: `Responsibilities
- Lead the technical design of Appian solutions for public sector clients
- Design data models, process models, integrations and SAIL interfaces
- Guide developers through delivery and own code quality

Requirements
- 7+ years of software development, including 5+ years on the Appian platform
- Appian Certified Lead Developer
- Experience with Java, SQL and REST integrations
- Bachelor's degree
- Ability to obtain a Public Trust clearance`,
};

P.tpmAIPlatform = {
  title: 'Senior Technical Program Manager, AI Platform',
  company: 'Tessellate',
  location: 'Remote (US)',
  text: `Responsibilities
- Drive delivery of AI platform features across engineering teams
- Own program plans, dependencies, risks and launch readiness
- Run agile ceremonies and track work in Jira

Qualifications
- 6+ years of technical program management experience in software engineering organizations
- Experience shipping large-scale distributed systems or ML platforms
- Experience with Agile and Jira
- Bachelor's degree in computer science or engineering`,
};

P.healthcareStrategyConsultant = {
  title: 'Senior Consultant, Healthcare Strategy',
  company: 'Larkspur & Reed',
  location: 'Arlington, VA',
  text: `Work you'll do
- Develop growth strategies for health plans and providers
- Analyze payer markets, value-based care models and reimbursement
- Prepare client deliverables

Qualifications
- 3+ years of healthcare consulting or health plan strategy experience
- Knowledge of Medicare Advantage, Medicaid and value-based care
- Bachelor's degree
- Travel up to 50%`,
};

P.itBusinessAnalyst = {
  title: 'IT Business Analyst',
  company: 'Capital Rail',
  location: 'Washington, DC',
  text: `Responsibilities
- Gather and document business requirements and user stories
- Map current and future-state processes
- Support user acceptance testing

Qualifications
- 2-4 years of business analysis experience
- Experience with requirements gathering, process mapping and UAT
- Proficiency with Jira and Visio
- Bachelor's degree`,
};

// ---------- the same person, other formats ----------

const R = {};

// LinkedIn's "Save to PDF": company on its own line, then title, dates with
// a duration, and place; sections in LinkedIn's order.
R.ctoOfficeLinkedInPdf = `Jordan Avery
Technology Strategy | Office of the CTO at Appian
Washington, District of Columbia, United States

Contact
jordan.avery@example.com
www.linkedin.com/in/jordanavery

Top Skills
Technology Strategy
Competitive Analysis
Generative AI

Summary
Technology strategist in Appian's Office of the CTO. I research emerging technology, size up competitors and acquisition targets, and turn it into strategy and roadmap decisions for the CTO and executive team.

Experience
Appian
4 years 3 months
Technology Strategy Consultant, Office of the CTO
July 2022 - Present (3 years 3 months)
McLean, Virginia, United States
Research emerging technologies (generative AI, AI agents, process mining) and write analyses and executive summaries for the CTO and executive team. Built the competitive analysis of Pega, ServiceNow, Microsoft Power Platform and UiPath used in product planning and for Gartner and Forrester evaluations. Led technical due diligence on 3 acquisition targets. Set up 4 technology partnerships with AI and data vendors. Built prototypes of AI agent features in Python and TypeScript. Ran the annual technology planning cycle for the CTO organization, tracking OKRs across 6 teams.
Technology Strategy Engineer, Office of the CTO
July 2021 - June 2022 (1 year)
McLean, Virginia, United States
Prototyped integrations with cloud AI services and wrote market and company research for the CTO.

Deloitte
1 year 11 months
Analyst, Technology Strategy & Transformation
August 2019 - June 2021 (1 year 11 months)
Arlington, Virginia, United States
Developed IT strategies, technology roadmaps and business cases for CIO clients in financial services and the public sector. Assessed IT operating models and built cost models in Excel. Facilitated workshops with client executives.

Education
University of Virginia
Bachelor of Science - BS, Systems Engineering · (2015 - 2019)`;

// Two-line headers (employer — place, then title | team with dates), "•" bullets.
R.ctoOfficeTwoLine = `JORDAN AVERY
Washington, DC | jordan.avery@example.com | linkedin.com/in/jordanavery

PROFESSIONAL EXPERIENCE

Appian Corporation — McLean, VA
Technology Strategy Consultant | Office of the CTO          2022 – Present
• Research emerging technologies (generative AI, AI agents, process mining) and write analyses and executive summaries for the CTO and executive team
• Built the competitive analysis of Pega, ServiceNow, Microsoft Power Platform and UiPath used in product planning and for Gartner and Forrester evaluations
• Led technical due diligence on 3 acquisition targets, including one that closed, and drafted the integration plan
• Evaluated 20+ AI and data vendors and set up 4 technology partnerships, defining integration requirements with product and engineering
• Built prototypes of AI agent features in Python and TypeScript that shaped two items on the product roadmap
• Prepared board and executive presentations on AI strategy
• Ran the annual technology planning cycle for the CTO organization, tracking OKRs across 6 teams
Technology Strategy Engineer | Office of the CTO          2021 – 2022
• Prototyped integrations with cloud AI services and wrote market and company research for the CTO

Deloitte Consulting LLP — Arlington, VA
Analyst | Technology Strategy & Transformation          2019 – 2021
• Developed IT strategies, technology roadmaps and business cases for CIO clients in financial services and the public sector
• Assessed IT operating models and built cost models in Excel; prepared client-ready PowerPoint deliverables

EDUCATION
University of Virginia — B.S. Systems Engineering, 2019

SKILLS
Technology strategy, competitive analysis, AI strategy, generative AI, low-code, technical due diligence, technology partnerships, business cases, financial modeling, Python, TypeScript, SQL, Excel, PowerPoint`;

// [posting, min, max, why] for the persona's main resume (ctoOfficePersona.js).
const BANDS = [
  ['soOctoSecurity', 70, 95, 'the same job at a security company'],
  ['techStratOpsHealth', 40, 70, 'the right work, but 3+ years of infrastructure or cyber strategy they lack'],
  ['cosOctoSenior', 35, 64, 'the right work, 7 of the 10+ years asked'],
  ['aiStrategyITTransformation', 65, 92, 'an ex-IT strategy consultant who does AI strategy'],
  ['aiEnablementStrategy', 50, 80, 'the right work, at the low end of 8-12 years'],
  ['principalPlatformStrategy', 45, 75, 'strategy function at a software company, short of 8 years'],
  ['appliedAIStrategyOps', 70, 95, 'applied AI, prototypes, vendors and business cases at a software company'],
  ['swPlatformsPrincipalDirector', 10, 45, '10+ years and an MBA required'],
  ['principalTechStrategistStorage', 10, 45, 'customer-facing infrastructure expert'],
  ['salesIntelAIStrategy', 15, 50, 'analytics and BI management, not strategy'],
  ['aiPlatformDirector', 0, 35, 'leading platform engineering'],
  ['bizOpsEngineering', 60, 88, 'planning, OKRs and initiatives for a CTO organization'],
  ['appianSolutionsArchitect', 0, 35, 'an Appian lead developer job'],
  ['tpmAIPlatform', 20, 50, 'engineering program delivery'],
  ['healthcareStrategyConsultant', 15, 45, 'healthcare strategy they have never done'],
  ['itBusinessAnalyst', 15, 50, 'a junior role in another function'],
];

// [better, worse, why]
const ORDER = [
  ['soOctoSecurity', 'cosOctoSenior', 'their level beats 10+ years'],
  ['appliedAIStrategyOps', 'salesIntelAIStrategy', 'AI strategy beats BI management'],
  ['aiStrategyITTransformation', 'swPlatformsPrincipalDirector', 'their level beats a principal director'],
  ['bizOpsEngineering', 'tpmAIPlatform', 'business operations beats program delivery'],
  ['principalPlatformStrategy', 'principalTechStrategistStorage', 'platform strategy beats a customer-facing infrastructure role'],
  ['techStratOpsHealth', 'itBusinessAnalyst', 'strategy beats business analysis'],
  ['soOctoSecurity', 'appianSolutionsArchitect', 'strategy beats Appian development'],
];

// The same person in another format scores about the same: [posting, tolerance].
const FORMAT = [
  ['soOctoSecurity', 8],
  ['appliedAIStrategyOps', 8],
  ['bizOpsEngineering', 8],
  ['aiStrategyITTransformation', 8],
  ['appianSolutionsArchitect', 8],
  ['healthcareStrategyConsultant', 8],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER, FORMAT };
