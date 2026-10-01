// One person's search, end to end: a technology strategy consultant in the
// Office of the CTO at a low-code software vendor (modelled on Appian's
// "Technology Strategy" roles: emerging-technology research, prototypes,
// partnerships, acquisitions, roadmap input, executive analyses), with two
// years of Big 4 technology strategy before that. The postings are the jobs
// that person would look at next, rebuilt from real postings found by web
// search (noted beside each), plus near misses that share the vocabulary
// (Appian and Pega developers, pre-sales, product marketing, sales).
// Companies and people are made up.
//
// Labels (BANDS, ORDER) were written before any of these was scored.

const P = {};

// Modelled on Red Ventures "Manager, Strategy & Operations, Office of the CTO" and WSO2 "TPM, CTO Office".
P.octoStrategyOps = {
  title: 'Manager, Strategy & Operations, Office of the CTO',
  company: 'Brightpath Media',
  location: 'Charlotte, NC (Hybrid)',
  text: `About the role
The Office of the CTO sets direction for Brightpath's 1,200-person technology organization. As Manager, Strategy & Operations, you'll drive strategic business planning and operational excellence for the CTO and the technology leadership team.

What you'll do
- Provide insights and recommendations to the CTO and technology leadership on strategic priorities
- Drive cross-functional workstreams from problem definition through execution, partnering with engineering, product and data teams
- Run the annual technology planning process and quarterly business reviews; track OKRs
- Prepare executive presentations, board materials and leadership communications
- Evaluate emerging technologies and vendors and build business cases for investment
- Lead special projects for the CTO, such as AI adoption across engineering

What you'll bring
- 5+ years of experience in strategy, management consulting, or technology strategy roles
- Exceptional written and verbal communication skills, including crafting executive presentations
- Proven program management experience across multiple high-visibility initiatives
- Strong analytical and problem-solving skills; comfort with ambiguity
- Comfort engaging with senior executives and engineering leaders
- Bachelor's degree required

Nice to have
- Experience in a software or technology company
- Familiarity with AI and machine learning technologies

Pay range: $135,000 - $165,000 per year.`,
};

// Modelled on Pega "Corporate Strategy Manager" (pega.com/about/careers/375).
P.corpStrategyVendor = {
  title: 'Corporate Strategy Manager',
  company: 'Caliber Workflow Software',
  location: 'Cambridge, MA',
  text: `Caliber's Corporate Strategy team manages the strategic planning process, develops strategies for market expansion, and provides the execution muscle needed to achieve important strategic initiatives. The team is made up of alumni from top management consulting firms with a deep passion for information technology.

What you'll do
- Work closely with senior management to formulate strategy and drive strategic investment decisions
- Develop a deep understanding of industry trends and the competitive landscape in enterprise software, low-code and AI
- Perform quantitative and qualitative analysis on core strategic issues
- Structure complex business problems, complete detailed analyses and financial models, synthesize data and deliver recommendations
- Support M&A and partnership evaluations
- Collaborate in a cross-functional team environment daily

Qualifications
- Undergraduate degree, preferably in business, finance or computer science
- 2+ years of experience at a top-tier management consulting firm
- Strong financial modeling and Excel skills
- Excellent written and verbal communication; strong PowerPoint skills
- Ability to work independently and drive projects to completion

Preferred
- MBA
- Experience in enterprise software or SaaS`,
};

// Modelled on ServiceNow "Director, AI Strategy and Program Management".
P.aiStrategyDirector = {
  title: 'Director, AI Strategy and Program Management',
  company: 'Northwind Platforms',
  location: 'San Diego, CA',
  text: `Northwind is putting AI at the center of its platform. The Director, AI Strategy and Program Management will shape and run the company's AI strategy across product, engineering and go-to-market.

What you'll do
- Define the multi-year AI strategy and roadmap with the CTO and product leaders
- Lead the AI program portfolio: governance, prioritization, OKRs and executive reporting
- Build and lead a team of strategy and program managers
- Drive enterprise transformation programs to adopt agentic AI internally
- Brief the executive leadership team and board on progress

Qualifications
- 12-15 years of experience in strategy and operations, enterprise transformation, AI, management consulting, product operations, or program leadership
- 5+ years of people management experience
- Experience leading large-scale, cross-functional programs at an enterprise software company
- Deep understanding of AI/ML technologies, including generative AI and agents
- Exceptional executive communication skills
- Bachelor's degree; MBA or advanced degree preferred

Pay range: $212,000 - $371,000.`,
};

// Modelled on ServiceNow "GVP, Product and Technology Strategy".
P.productTechStrategyGVP = {
  title: 'Group Vice President, Product and Technology Strategy',
  company: 'Northwind Platforms',
  location: 'Santa Clara, CA',
  text: `Lead the team that shapes Northwind's product and technology strategy.

Responsibilities
- Set the long-range product and technology strategy with the Chief Product Officer and CTO
- Synthesize complex market and technology signals into clear strategic recommendations
- Lead build/buy/partner decisions, including acquisition theses
- Lead and develop a team of 15 strategists

Qualifications
- 12+ years of experience in product strategy, corporate strategy, or management consulting within SaaS, AI, or enterprise technology
- 8+ years leading teams
- Deep understanding of SaaS business models, AI/ML technologies, and workflow automation markets
- Demonstrated ability to synthesize complex market and technology signals into clear strategic recommendations
- Bachelor's degree required; MBA preferred`,
};

// Modelled on several "Chief of Staff to the CTO" postings (Coursera, Validity and others via Glassdoor / Indeed).
P.chiefOfStaffCTO = {
  title: 'Chief of Staff to the CTO',
  company: 'Lumen Learning Co',
  location: 'Remote (US)',
  text: `About the role
The Chief of Staff increases the CTO's leverage. You will be the information hub for engineering leadership and help align engineering execution with business and customer priorities.

Responsibilities
- Run the operating cadence of the engineering organization: staff meetings, quarterly planning, OKRs and business reviews
- Coordinate complex work across multiple engineering teams and surface tradeoffs and constraints to support executive decisions
- Drive strategic projects for the CTO end to end, from analysis to rollout
- Prepare the CTO's board and executive materials and internal communications
- Partner with finance on headcount and budget planning

Qualifications
- 5+ years of experience in technical program management, engineering, product operations, strategy or consulting
- Bachelor's degree in an engineering or technical discipline
- Systems thinking: the ability to reason about dependencies and tradeoffs
- High judgment, discretion and the ability to drive alignment without formal authority
- Excellent written communication

Compensation: $155,000 - $236,000 base.`,
};

// Modelled on Big 4 "Technology Strategy Manager" postings.
P.techStrategyManagerBig4 = {
  title: 'Manager, Technology Strategy & Transformation',
  company: 'Larkspur & Reed',
  location: 'McLean, VA',
  text: `Our Technology Strategy & Transformation practice helps CIOs and CTOs shape their technology agenda.

Work you'll do
- Lead engagement teams developing technology strategies, roadmaps and operating models
- Own client relationships with CIO and CTO stakeholders
- Develop proposals and contribute to eminence and practice development
- Manage, coach and develop consultants and senior consultants

Required
- 6+ years of experience in technology strategy, IT strategy or management consulting
- 2+ years leading project teams
- Experience developing technology roadmaps, business cases and operating models
- Bachelor's degree
- Ability to travel up to 50%

Preferred
- MBA
- Experience with emerging technologies such as AI, automation and low-code platforms

The wage range for this role is $129,000 to $238,000.`,
};

// Modelled on AI product strategy postings (HCLTech AI Product Manager, Intuitive AI Platform, Jobgether).
P.productStrategyAI = {
  title: 'Senior Manager, Product Strategy',
  company: 'Fathom Automation',
  location: 'New York, NY',
  text: `Fathom's process automation platform runs mission-critical workflows for 900 enterprises. The Product Strategy team decides where the platform goes next.

What you'll do
- Develop the product strategy for AI agents and agentic workflow on the Fathom platform
- Continuously evaluate competitors, analyzing product capabilities, pricing, roadmaps and AI innovations, and develop competitive positioning
- Monitor market trends, customer feedback, competitive intelligence and emerging AI technologies to refine the product roadmap
- Size markets and build business cases for new products
- Partner with product management, engineering and marketing to bring new capabilities to market

Requirements
- 6+ years of experience in product strategy, technology strategy, product management or consulting
- Strong understanding of AI technologies, including large language models and AI agents
- Experience in enterprise software
- Excellent communication with executives
- Bachelor's degree

Nice to have
- Experience with process automation, BPM, RPA or low-code platforms
- MBA`,
};

// Modelled on bank "Emerging Technology" / innovation strategy postings.
P.emergingTechStrategist = {
  title: 'Senior Emerging Technology Strategist',
  company: 'Keystone Financial',
  location: 'Charlotte, NC',
  text: `The Emerging Technology team in Keystone's Office of the CTO scouts, evaluates and incubates technologies that matter to the bank.

Responsibilities
- Track emerging technology trends such as generative AI, agentic AI and process automation, and assess their relevance to the bank
- Run proofs of concept and build prototypes with engineering partners
- Evaluate startups and vendors and recommend technology partnerships
- Write research and point-of-view papers and present them to technology executives
- Shape the bank's technology roadmap with architecture and business leaders

Qualifications
- 5+ years of experience in technology strategy, emerging technology, innovation or consulting
- Hands-on experience building prototypes (Python, JavaScript or similar)
- Ability to prepare data-driven analyses and executive summaries
- Excellent presentation skills
- Bachelor's degree in computer science, engineering or a related field

Preferred
- Financial services experience`,
};

// Modelled on software-company corporate development (M&A) postings.
P.corpDevManager = {
  title: 'Corporate Development Manager',
  company: 'Caliber Workflow Software',
  location: 'Boston, MA',
  text: `Join the Corporate Development team that sources and executes Caliber's acquisitions and strategic investments.

Responsibilities
- Source and evaluate acquisition and investment targets
- Build valuation models (DCF, comparable companies, precedent transactions) and accretion/dilution analyses
- Lead due diligence workstreams and coordinate with legal, finance and product
- Support post-merger integration planning

Qualifications
- 4+ years of experience in investment banking, corporate development, private equity or M&A
- Expert financial modeling and valuation skills
- Experience executing M&A transactions end to end
- Bachelor's degree in finance, economics or a related field
- Knowledge of enterprise software preferred`,
};

// Modelled on Field CTO postings (CTO Academy, Strive, builtin).
P.fieldCTO = {
  title: 'Field CTO',
  company: 'Fathom Automation',
  location: 'Remote (US)',
  text: `Our Field CTO is the senior technical voice of Fathom with the largest customers.

Responsibilities
- Act as a trusted advisor to customer CIOs and CTOs on automation and AI strategy
- Present Fathom's technology vision at executive briefings, conferences and analyst meetings
- Bring customer insight back to product and engineering
- Support strategic deals with sales leadership

Qualifications
- 10-15+ years of experience in enterprise software
- 5+ years in a customer-facing technical leadership role such as Field CTO, Principal Solutions Architect or Enterprise Architect
- Deep expertise in enterprise architecture, integration and cloud
- Exceptional public speaking skills
- Bachelor's degree in computer science or a related field`,
};

// Modelled on enterprise software competitive intelligence postings.
P.competitiveIntel = {
  title: 'Senior Manager, Competitive Intelligence',
  company: 'Northwind Platforms',
  location: 'Remote (US)',
  text: `Own how Northwind understands and wins against its competitors.

What you'll do
- Build and run the competitive intelligence program for our workflow and AI products
- Analyze competitors' products, pricing, strategy and roadmaps; maintain battlecards
- Brief executives, product leaders and sales on the competitive landscape
- Work with analyst relations on Gartner and Forrester evaluations
- Run win/loss analysis

Qualifications
- 6+ years of experience in competitive intelligence, product marketing, strategy or consulting
- Experience in enterprise software or SaaS
- Excellent analytical and executive communication skills
- Bachelor's degree`,
};

// Modelled on technology partnerships / strategic alliances postings at software companies.
P.techPartnerships = {
  title: 'Senior Manager, Technology Partnerships',
  company: 'Fathom Automation',
  location: 'New York, NY',
  text: `Build the partnerships that extend the Fathom platform.

Responsibilities
- Identify, evaluate and sign technology partners (AI model providers, data platforms, hyperscalers)
- Own partner strategy and joint roadmaps; define integration requirements with product and engineering
- Build business cases and negotiate commercial terms
- Track partner performance and report to executives

Qualifications
- 5+ years of experience in technology partnerships, business development, strategy or consulting in enterprise software
- Experience negotiating partnership agreements
- Strong technical understanding of cloud and AI platforms
- Excellent communication and relationship skills
- Bachelor's degree`,
};

// Modelled on enterprise SaaS Senior PM postings.
P.seniorPMAutomation = {
  title: 'Senior Product Manager, Workflow Automation',
  company: 'Fathom Automation',
  location: 'New York, NY',
  text: `Own a core area of the Fathom workflow automation platform.

What you'll do
- Own the roadmap for workflow design and orchestration features
- Write PRDs and user stories; run discovery with customers
- Work in agile teams with engineering and design to ship features
- Define and track product metrics

Qualifications
- 5+ years of product management experience in B2B SaaS
- Experience shipping features with agile engineering teams
- Experience writing product requirements and user stories
- Data-driven: comfortable with SQL and product analytics
- Bachelor's degree in computer science or a related field preferred`,
};

// Modelled on hospital / health system IT strategy director postings.
P.itStrategyDirectorHealth = {
  title: 'Director, IT Strategy & Planning',
  company: 'Riverbend Health',
  location: 'Richmond, VA',
  text: `Lead strategy and planning for Riverbend's IT organization.

Responsibilities
- Develop and maintain the multi-year IT strategic plan and roadmap
- Run IT portfolio and investment governance; build business cases
- Lead the IT strategy team and report to the CIO
- Partner with clinical and business leaders on digital priorities

Qualifications
- 10+ years of IT experience, including 5+ years in IT strategy, planning or consulting
- 3+ years of people leadership
- Healthcare experience strongly preferred; knowledge of Epic a plus
- Bachelor's degree; master's preferred`,
};

// ---------- near misses ----------

// Modelled on Appian developer postings (Appian partners, federal integrators).
P.appianDeveloper = {
  title: 'Senior Appian Developer',
  company: 'Meridian Federal',
  location: 'Reston, VA',
  text: `Build Appian applications for federal clients.

Responsibilities
- Design and develop Appian applications: SAIL interfaces, process models, records, integrations and expression rules
- Lead sprint delivery in an agile team
- Perform code reviews and follow Appian best practices

Requirements
- 5+ years of Appian development experience
- Appian Certified Senior Developer
- Experience with SQL, web services (REST/SOAP) and Java
- Bachelor's degree
- Active Secret clearance`,
};

P.pegaArchitect = {
  title: 'Pega Senior System Architect',
  company: 'Meridian Federal',
  location: 'Reston, VA',
  text: `Responsibilities
- Design and build Pega applications: case types, flows, data pages and integrations
- Configure decisioning and UI
- Participate in agile ceremonies

Requirements
- 4+ years of Pega development experience
- Pega CSSA certification required
- Experience with Java, SQL and REST
- Bachelor's degree`,
};

// Modelled on Pega / Appian "Solutions Consulting" postings.
P.solutionsConsultant = {
  title: 'Senior Solutions Consultant',
  company: 'Caliber Workflow Software',
  location: 'Remote (US)',
  text: `Partner with account executives to win new business.

Responsibilities
- Run discovery with prospects and design solutions on the Caliber platform
- Build and deliver tailored demos and proofs of concept
- Respond to RFPs and security questionnaires
- Support the sales team to achieve quarterly bookings targets

Qualifications
- 5+ years of pre-sales or solutions engineering experience in enterprise software
- Hands-on experience with low-code, BPM or workflow platforms
- Excellent presentation and demo skills
- Ability to travel 30%
- Bachelor's degree`,
};

P.productMarketing = {
  title: 'Senior Product Marketing Manager',
  company: 'Northwind Platforms',
  location: 'Remote (US)',
  text: `Responsibilities
- Develop positioning and messaging for our AI workflow products
- Lead product launches and go-to-market plans
- Create sales enablement content and website copy
- Work with demand generation on campaigns

Qualifications
- 5+ years of product marketing experience in B2B SaaS
- Experience leading product launches
- Excellent writing skills
- Bachelor's degree in marketing or a related field`,
};

P.enterpriseAE = {
  title: 'Enterprise Account Executive',
  company: 'Caliber Workflow Software',
  location: 'Washington, DC',
  text: `Responsibilities
- Own a territory of Fortune 500 accounts and close new business
- Build pipeline through prospecting and partners
- Forecast accurately in Salesforce

Qualifications
- 7+ years of enterprise software sales experience with a track record of exceeding quota
- Experience selling to C-level executives
- Bachelor's degree
- On-target earnings: $300,000 (50/50 split)`,
};

P.backendEngineer = {
  title: 'Senior Software Engineer, Backend',
  company: 'Fathom Automation',
  location: 'New York, NY',
  text: `Responsibilities
- Design, build and operate backend services in Java and Kotlin
- Own services in production, including on-call
- Review code and mentor engineers

Qualifications
- 6+ years of professional software engineering experience
- Expertise in Java, distributed systems and Kubernetes
- Experience with PostgreSQL and Kafka
- Bachelor's degree in computer science`,
};

// ---------- the person ----------

const R = {};

R.ctoOfficeStrategist = `Jordan Avery
jordan.avery@example.com · Washington, DC · linkedin.com/in/jordanavery

Experience
Technology Strategy Consultant, Office of the CTO, Appian, Jul 2022 – Present
- Research emerging technologies (generative AI, AI agents, process mining) and write analyses and executive summaries for the CTO and executive team
- Built the competitive analysis of Pega, ServiceNow, Microsoft Power Platform and UiPath used in product planning and for Gartner and Forrester evaluations
- Led technical due diligence on 3 acquisition targets, including one that closed, and drafted the integration plan
- Evaluated 20+ AI and data vendors and set up 4 technology partnerships, defining integration requirements with product and engineering
- Built prototypes of AI agent features in Python and TypeScript that shaped two items on the product roadmap
- Prepared board and executive presentations on AI strategy; presented to customers at Appian World
- Ran the annual technology planning cycle for the CTO organization, tracking OKRs across 6 teams
Technology Strategy Engineer, Office of the CTO, Appian, Jul 2021 – Jun 2022
- Prototyped integrations with cloud AI services and wrote market and company research for the CTO
Analyst, Technology Strategy & Transformation, Deloitte Consulting, Aug 2019 – Jun 2021
- Developed IT strategies, technology roadmaps and business cases for CIO clients in financial services and the public sector
- Assessed IT operating models and built cost models in Excel; prepared client-ready PowerPoint deliverables
- Facilitated workshops with client executives

Education
B.S. Systems Engineering, University of Virginia, 2019

Skills
Technology strategy, emerging technology research, competitive analysis, AI strategy, generative AI, low-code, business process management, technical due diligence, technology partnerships, business cases, financial modeling, Python, TypeScript, SQL, Excel, PowerPoint`;

const PROFILE = {
  targetRoles: 'Technology Strategy Manager, Strategy & Operations Manager, Chief of Staff, Corporate Strategy Manager, Product Strategy',
  location: 'Washington, DC',
  workModes: 'remote, hybrid',
};

// [resume, posting, min, max, why]
const BANDS = [
  ['ctoOfficeStrategist', 'octoStrategyOps', 70, 95, 'the same job at another company'],
  ['ctoOfficeStrategist', 'corpStrategyVendor', 65, 92, 'two years at Deloitte plus competitive strategy at a software vendor'],
  ['ctoOfficeStrategist', 'emergingTechStrategist', 70, 95, 'emerging tech research, prototypes and partnerships: the job they do today'],
  ['ctoOfficeStrategist', 'productStrategyAI', 60, 88, 'AI product strategy and competitive analysis at an automation vendor'],
  ['ctoOfficeStrategist', 'chiefOfStaffCTO', 60, 88, 'planning cadence, OKRs and executive materials for a CTO'],
  ['ctoOfficeStrategist', 'competitiveIntel', 55, 85, 'built the competitive analysis and supported analyst evaluations'],
  ['ctoOfficeStrategist', 'techPartnerships', 50, 80, 'set up partnerships, but never negotiated the commercial terms'],
  ['ctoOfficeStrategist', 'techStrategyManagerBig4', 45, 75, 'the right work; short of 6 years of consulting and team leading'],
  ['ctoOfficeStrategist', 'itStrategyDirectorHealth', 30, 60, 'a level up, no healthcare'],
  ['ctoOfficeStrategist', 'seniorPMAutomation', 30, 60, 'adjacent: shaped the roadmap, never a PM'],
  ['ctoOfficeStrategist', 'corpDevManager', 25, 55, 'diligence on deals, but no banking or valuation work'],
  ['ctoOfficeStrategist', 'aiStrategyDirector', 25, 55, 'the right work, half the years, no team'],
  ['ctoOfficeStrategist', 'productTechStrategyGVP', 10, 45, 'the right work, an executive role'],
  ['ctoOfficeStrategist', 'fieldCTO', 10, 45, 'the vision part, without 10+ years or customer-facing architecture'],
  ['ctoOfficeStrategist', 'solutionsConsultant', 15, 50, 'pre-sales, not strategy'],
  ['ctoOfficeStrategist', 'productMarketing', 10, 45, 'marketing, not strategy'],
  ['ctoOfficeStrategist', 'appianDeveloper', 0, 35, 'knows Appian, has never been an Appian developer'],
  ['ctoOfficeStrategist', 'pegaArchitect', 0, 25, 'knows Pega as a competitor, not as a developer'],
  ['ctoOfficeStrategist', 'enterpriseAE', 0, 25, 'a quota-carrying sales job'],
  ['ctoOfficeStrategist', 'backendEngineer', 0, 30, 'prototypes are not production engineering'],
];

// [resume, better posting, worse posting, why]: this person's list, best first.
const RANKS = [
  ['ctoOfficeStrategist', 'octoStrategyOps', 'techStrategyManagerBig4', 'in-house strategy for a CTO over a consulting manager role they are short for'],
  ['ctoOfficeStrategist', 'emergingTechStrategist', 'seniorPMAutomation', 'their job over an adjacent one'],
  ['ctoOfficeStrategist', 'productStrategyAI', 'productMarketing', 'strategy over marketing'],
  ['ctoOfficeStrategist', 'corpStrategyVendor', 'corpDevManager', 'strategy over M&A execution'],
  ['ctoOfficeStrategist', 'chiefOfStaffCTO', 'aiStrategyDirector', 'the level they are at'],
  ['ctoOfficeStrategist', 'competitiveIntel', 'solutionsConsultant', 'analysis over pre-sales'],
  ['ctoOfficeStrategist', 'techPartnerships', 'appianDeveloper', 'strategy over development'],
  ['ctoOfficeStrategist', 'seniorPMAutomation', 'backendEngineer', 'product over engineering'],
];

module.exports = { POSTINGS: P, RESUMES: R, PROFILE, BANDS, RANKS };
