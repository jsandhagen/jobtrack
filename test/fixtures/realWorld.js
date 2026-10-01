// Postings rebuilt from real, current job descriptions. Live job sites are not
// reachable from the test environment, so each posting was rebuilt from what
// web search returned about the real one: its stated requirements, years,
// degree, screening items (travel, clearance, sponsorship) and wording, in
// the layout those employers use (overview, duties, required and preferred
// qualifications, pay and EEO text). Company names are changed; the source
// each is modelled on is noted beside it. Technology strategy consulting
// first, then general roles.
//
// Labels (BANDS, ORDER) were set before any of these was scored.

const P = {};

const DELOITTE_TAIL = `The wage range for this role takes into account the wide range of factors that are considered in making compensation decisions including but not limited to skill sets; experience and training; licensure and certifications; and other business and organizational needs. The disclosed range estimate has not been adjusted for the applicable geographic differential associated with where the position may be filled. A reasonable estimate of the current range is $96,000 to $178,000.

All qualified applicants will receive consideration for employment without regard to race, color, religion, sex, sexual orientation, gender identity, national origin, age, disability or protected veteran status, or any other legally protected basis, in accordance with applicable law.`;

// Modelled on Deloitte "Technology Strategy Consultant" (apply.deloitte.com JobDetail 320976 / 355406).
P.tsConsultantBig4 = {
  title: 'Technology Strategy Consultant',
  company: 'Larkspur & Reed',
  location: 'Philadelphia, PA',
  text: `Are you an experienced, passionate pioneer in technology who wants to work in a collaborative environment? As an experienced Technology Strategy Consultant you will have the ability to share new ideas and collaborate on projects as a consultant without the extensive demands of travel.

The Team
Our Technology Strategy & Transformation offering helps CIOs and business leaders shape their technology agenda, align technology investments with business strategy and build the operating models to deliver them.

Work you'll do
- Develop technology strategies and multi-year roadmaps that support clients' business goals
- Assess IT operating models, capabilities and spend, and recommend improvements
- Build business cases and investment prioritization for technology initiatives
- Facilitate workshops with client executives and prepare client-ready deliverables

Qualifications
Required:
- 2+ years of management consulting experience in technology strategy, strategic planning, growth strategy, or business transformation
- 2+ years of experience developing or implementing corporate, business, or product strategies
- 2+ years of experience creating client-ready materials such as roadmaps and business plans
- 2+ years of experience using analytical methods to develop recommendations
- Participated in one or more projects involving process frameworks: IT Infrastructure Library (ITIL), ISO 20000, COBIT and related service strategy and management processes
- Bachelor's degree from an accredited university
- Ability to travel up to 50%, on average, based on the work you do and the clients and industries/sectors you serve
- Limited immigration sponsorship may be available

Preferred:
- Ability to work independently and manage multiple task assignments
- Experience working with cloud (IaaS/PaaS/SaaS/BPaaS), digital, and analytics solutions
- An advanced degree in the area of specialization (MBA preferred)

${DELOITTE_TAIL}`,
};

// Modelled on Deloitte "Technology Strategy Senior Consultant" (JobDetail 354352 / 317237).
P.tsSeniorConsultantBig4 = {
  title: 'Technology Strategy Senior Consultant',
  company: 'Larkspur & Reed',
  location: 'Kansas City, MO',
  text: `Our Strategy offering architects bold strategies to achieve the extraordinary across the C-suite and board. As a Technology Strategy Senior Consultant, you will help design integrated business and technology strategies, operating models, platforms, ecosystems and capabilities.

Work you'll do
- Assist in developing technology strategies that drive profitability and growth
- Assess platforms and operating models for client scalability
- Lead workstreams: current-state assessments, future-state design, roadmaps and business cases
- Manage day-to-day client relationships and coach consultants

Required Qualifications
- 5+ years of consulting and/or industry experience in technology strategy, digital transformation or IT advisory
- 2+ years of experience creating roadmaps and PowerPoint presentations for executive audiences
- Bachelor's degree
- Ability to travel up to 50%, on average, based on the work you do and the clients and industries/sectors you serve
- Limited immigration sponsorship may be available

Preferred Qualifications
- Experience with cloud strategy, enterprise architecture or AI strategy
- MBA or other advanced degree

${DELOITTE_TAIL}`,
};

// Modelled on Accenture "Technology Strategy & Advisory Consultant" (accenture.com R00314025 / 13462795).
P.tsaConsultant = {
  title: 'Technology Strategy & Advisory Consultant',
  company: 'Meridian Partners Consulting',
  text: `Technology Strategy & Advisory
Join our team of Technology Strategy & Advisory professionals and help clients use technology to transform their business.

As a Consultant, you will:
- Shape technology strategies, IT operating models and transformation roadmaps for C-suite clients
- Analyze technology spend and identify cost optimization opportunities
- Support technology due diligence and integration planning in M&A
- Build compelling storylines and executive presentations

Here's what you need:
- Minimum 2 years of strategy consulting experience at a consulting firm
- Minimum 2 years of experience in digital strategy, transformation strategy, operating model strategy, technology in M&A, technology cost optimization or technology-driven revenue growth strategy
- Bachelor's degree in engineering, technology or a business-related discipline

Bonus points if you have:
- MBA from a top business school
- Experience with cloud, data and AI strategy

Compensation for roles at Meridian varies depending on a wide array of factors. The annual range is $70,000 to $160,000. We are an equal opportunity employer.`,
};

// Modelled on Accenture TS&A Manager (7-10 years of strategy consulting).
P.tsaManager = {
  title: 'Technology Strategy & Advisory Manager',
  company: 'Meridian Partners Consulting',
  text: `As a Manager in Technology Strategy & Advisory you will lead engagements that define clients' technology strategy, IT operating model and transformation roadmap.

Key responsibilities
- Lead project teams of 4-8 consultants and own delivery quality
- Shape and sell new engagements; contribute to proposals and offering development
- Advise CIOs and CTOs on technology investment, cloud and AI strategy
- Develop practice talent

Qualifications
- 7-10 years of strategy consulting experience, including technology strategy and IT operating model work
- Experience leading teams and managing client relationships
- Track record of business development
- Bachelor's degree; MBA preferred`,
};

// Modelled on EY "Senior Consultant - Technology Strategy & Transformation" (careers.ey.com 1419489233).
P.tstSeniorConsultant = {
  title: 'Senior Consultant - Technology Strategy & Transformation',
  company: 'Ashby Young LLP',
  text: `The opportunity
Our Technology Consulting team helps organizations transform how they use technology. As a Senior Consultant you will work on technology strategy and transformation engagements across industries.

Your key responsibilities
- Deliver technology strategy and transformation projects such as operating model design, service delivery transformation, tech-enabled business transformation, strategic technology planning and enterprise cost reduction enabled by technology
- Analyze client needs and develop tailored technology strategies
- Manage stakeholders and contribute to proposals

Skills and attributes for success
- 3-6 years of experience in consulting or transformation projects
- Strong stakeholder management skills
- Experience with project delivery lifecycle tools such as JIRA and Microsoft Project

Ideally, you'll also have
- Experience at a Big 4 consultancy, strategy house or similar
- A post graduate degree or relevant professional designation; MBA or MSc preferred
- Certifications such as PMP, PRINCE2, ITIL or SAFe

We offer a competitive remuneration package. EY is committed to being an inclusive employer.`,
};

// Modelled on KPMG "Technology Strategy Manager, CIO Advisory".
P.cioAdvisoryManager = {
  title: 'Manager, CIO Advisory - Technology Strategy',
  company: 'Kessler Marsh',
  text: `About the role
Our CIO Advisory team shapes clients' vision on digital and IT strategy and transformation.

What you will do
- Shape vision on digital and IT strategy and transformation
- Evaluate and design digital and IT operating models
- Create roadmaps for transformation journeys
- Assess architecture landscapes and cloud migration strategies, and provide forward-looking recommendations
- Lead teams and client relationships

What you will bring
- 6-10 years of experience in consulting firms or in companies focused on technological innovation
- Experience in IT strategy, IT governance, IT sourcing or ITSM
- Experience defining cloud migration strategies
- Degree in computer engineering, management engineering or a related field
- Advanced use of Excel, PowerPoint and Power BI
- Excellent communication and interpersonal skills`,
};

// Modelled on PwC "Digital & AI Strategy Senior Associate" (jobs.us.pwc.com 88875117408).
P.digitalAIStrategySA = {
  title: 'Digital & AI Strategy Senior Associate',
  company: 'Whitcombe Partners',
  location: 'New York, NY',
  text: `At Whitcombe, our people in strategy and technology help clients use technology to solve their most complex business problems. As a Senior Associate you will help clients define AI and digital strategies and the roadmaps to get there.

Responsibilities
- Assess clients' digital and AI maturity and identify high-value use cases
- Build business cases and roadmaps for AI and data initiatives
- Design operating models and governance for AI adoption
- Develop client-ready presentations and coach associates

Minimum Degree Required
Bachelor's Degree

Minimum Year(s) of Experience
3 year(s) of experience using technology to solve complex corporate technology strategy problems

Preferred Knowledge/Skills
- Experience with generative AI and machine learning use cases
- Data strategy and data governance
- Cloud strategy and technology cost optimization
- Strong Excel and PowerPoint skills

Travel Requirements
Up to 80%

Whitcombe does not intend to hire experienced or entry level job seekers who will need, now or in the future, sponsorship through the H-1B lottery.`,
};

// Modelled on Slalom "Strategy & Operations Consultant".
P.strategyOpsConsultant = {
  title: 'Strategy & Operations Consultant',
  company: 'Quarry Hill Consulting',
  text: `Who You'll Work With
Our Strategy & Operations team helps clients define what's next and how to get there.

What You'll Do
- Conduct current state assessments, evaluate results and present findings
- Define future state visions and prioritize opportunity areas
- Perform gap analyses and identify realistic and executable strategies focused on roadmaps, communication plans, governance structures and investment prioritization
- Deliver high-quality engagement tasks in a team environment and build deep client relationships

What You'll Bring
- Experience in customer strategy, digital strategy, product strategy or business strategy
- Experience providing strategic technology advisory services to clients
- Knowledge of business cases and ROI calculations, IT strategy development, strategic roadmaps, business architecture and operating models, change management, and sourcing and vendor strategy
- Experience in project delivery
- Excellent communication skills and the ability to build strong client relationships

Compensation: $86,732 - $151,782. Quarry Hill is an equal opportunity employer.`,
};

// Modelled on Guidehouse "IT Strategy & Transformation, Senior Consultant" (LinkedIn 3342254087).
P.itStrategyTransformationFederal = {
  title: 'IT Strategy & Transformation, Senior Consultant',
  company: 'Capstone Federal Advisors',
  location: 'Washington, DC',
  text: `Job Family: Strategy & Transformation Consulting
Travel Required: Up to 25%
Clearance Required: Ability to Obtain Secret

What You Will Do
IT Strategy & Transformation consultants help federal clients improve business value by optimizing the efficiency and effectiveness of their IT capabilities.
- Understand and document existing business processes, systems and technology
- Formulate business and technical solutions and IT modernization roadmaps
- Develop architecture diagrams, process flows and business cases
- Support IT governance and portfolio management for agency CIOs

What You Will Need
- Minimum 4+ years of experience working on enterprise business and IT strategy and modernization projects
- Bachelor's degree
- Must be able to obtain a Secret clearance
- US citizenship is required

What Would Be Nice To Have
- Master's degree
- Experience with federal IT policy (FITARA, Cloud Smart) and FedRAMP`,
};

// Modelled on Gartner "Sr Consultant - IT Strategy Consulting - AI" (jobs.gartner.com 112999).
P.itStrategyAIConsultant = {
  title: 'Sr Consultant - IT Strategy Consulting - AI',
  company: 'Northline Research',
  text: `About the role
Our IT Strategy Consulting practice helps CIOs and their teams build IT and AI strategies, prioritize investments and modernize their IT organizations.

What you'll do
- Deliver IT strategy and AI strategy engagements for public and private sector clients
- Assess AI readiness, data platforms and IT operating models
- Build roadmaps and investment cases and present them to CIOs

What you'll need
- 4-7 years of experience in management consulting, technology strategy, data/analytics or enterprise transformation, with meaningful recent exposure to AI and data
- Technical literacy to engage credibly with technical teams while communicating clearly to business audiences
- Strong Excel and PowerPoint
- Bachelor's degree`,
};

// Modelled on West Monroe "Technology Consulting Director".
P.techConsultingDirector = {
  title: 'Director, Technology Consulting',
  company: 'Calloway Monroe',
  text: `As a Director you will lead our technology consulting work with clients in financial services.

Responsibilities
- Sell and deliver multimillion-dollar business and technology transformation engagements
- Lead client relationships with CIOs and business executives
- Build and lead delivery teams and grow the practice

Qualifications
- 12+ years of experience serving financial services clients
- 8+ years of consulting experience leading business and technology transformation initiatives
- Demonstrated ability to lead C-level conversations
- Bachelor's degree`,
};

// Modelled on Booz Allen "Digital Transformation Consultant, Senior" (careers.boozallen.com 106268).
P.digitalTransformationSeniorFederal = {
  title: 'Digital Transformation Consultant, Senior',
  company: 'Halloway Hamilton',
  location: 'McLean, VA',
  text: `Key Role:
Help federal clients plan and lead digital transformation: assess current operations, design future-state processes and technology, and guide adoption.

Basic Qualifications:
- 7+ years of experience in a professional work environment
- Experience working directly with clients and stakeholders
- Ability to collaborate with cross-functional team members on implementation and design
- Ability to obtain a security clearance
- Bachelor's degree

Additional Qualifications:
- Secret clearance
- Master's degree

Clearance:
Applicants selected will be subject to a security investigation and may need to meet eligibility requirements for access to classified information.`,
};

// Modelled on BCG Platinion "Senior IT Consultant".
P.seniorITConsultantPlatinion = {
  title: 'Senior IT Consultant',
  company: 'Brightwater Platinum',
  text: `What you'll do
- Shape IT strategy, target architecture and transformation programs for large clients
- Lead workstreams and project teams of more than three people
- Bridge business and technology: translate strategy into implementation plans

What you'll bring
- Degree in computer science, business informatics or a related discipline
- At least 4 years of relevant experience in IT consulting, including transformation projects in both strategy and implementation
- Experience leading project teams
- Knowledge of enterprise architecture and cloud`,
};

// Modelled on KPMG "Advisory Associate, Strategy & Technology" (entry level).
P.advisoryAssociateEntry = {
  title: 'Advisory Associate, Strategy & Technology',
  company: 'Kessler Marsh',
  text: `What you will do
- Support technology strategy and transformation engagements
- Research technology trends, vendors and benchmarks
- Build Excel analyses and PowerPoint deliverables
- Document current-state processes and support client workshops

What you will need
- Bachelor's degree in information systems, business, economics, engineering or a related field
- 0-2 years of professional experience; internships count
- Proficiency in Excel and PowerPoint
- Ability to travel up to 80%`,
};

// ---------- general roles ----------

// Modelled on B2B SaaS "Senior Product Manager" postings (Mixmax and others).
P.seniorPMSaaS = {
  title: 'Senior Product Manager',
  company: 'Tidewell Software',
  text: `About Tidewell
Tidewell builds workflow software for finance teams.

What you'll do
- Own the roadmap for our approvals product end to end
- Conduct market and competitive analysis to identify opportunities
- Write product requirements, user stories and acceptance criteria
- Work closely with design and engineering to ship and measure features

Required qualifications
- 5-7 years of experience in product management in a SaaS or enterprise technology environment
- Proven end-to-end product ownership of B2B SaaS products
- Experience using product analytics and research to inform decisions
- Deep understanding of agile development practices
- Bachelor's degree in business, engineering or a related field

Preferred qualifications
- MBA or advanced degree
- Experience with AI-enabled product features`,
};

// Modelled on medical-surgical RN postings.
P.medSurgRN = {
  title: 'Registered Nurse - Medical/Surgical',
  company: 'Riverbend Regional Medical Center',
  location: 'Fresno, CA',
  text: `Position Summary
Provide direct patient care for adult medical-surgical patients on a 32-bed unit. 12-hour shifts, nights and every third weekend. On-site.

Responsibilities
- Assess, plan, implement and evaluate patient care
- Administer medications and IV therapy
- Educate patients and families
- Participate in rapid response teams

Requirements
- Graduate of an accredited school of nursing
- Active California RN license
- Current BLS certification
- ACLS within 6 months of hire
- 1+ year of medical-surgical experience

Preferred
- BSN
- CMSRN certification`,
};

P.dataAnalystHealth = {
  title: 'Data Analyst',
  company: 'Sutter Lane Health',
  text: `About the job
Join our analytics team supporting clinical operations.

Responsibilities
- Build dashboards in Tableau or Power BI for operations leaders
- Write SQL to extract and clean data from the warehouse
- Analyze trends and present findings

Qualifications
- 2+ years of experience in data analysis
- Strong SQL
- Tableau or Power BI
- Advanced Excel
- Bachelor's degree in a quantitative field

Preferred
- Healthcare data experience
- Python or R`,
};

P.backendEngineer = {
  title: 'Senior Backend Engineer',
  company: 'Ferrous Labs',
  text: `What you'll do
- Design and build distributed services in Java or Go
- Own reliability and performance of our payments APIs
- Mentor engineers and lead design reviews

What we're looking for
- 5+ years of backend software engineering experience
- Strong Java or Go
- Experience with distributed systems, Kafka and AWS
- Kubernetes and CI/CD
- Bachelor's degree in computer science or equivalent experience`,
};

P.accountExecutiveSaaS = {
  title: 'Account Executive, Mid-Market',
  company: 'Strata Cloud',
  text: `About the role
Own the full sales cycle for mid-market accounts in the Central territory.

What you'll do
- Prospect and build pipeline with SDR support
- Run discovery and demos, and close new business
- Meet or exceed quarterly quota
- Forecast accurately in Salesforce

What you'll need
- 3+ years of closing experience in B2B SaaS sales
- Track record of exceeding quota
- Experience with Salesforce and a structured sales methodology (MEDDICC or similar)
- Bachelor's degree preferred

OTE $160,000 - $190,000`,
};

P.itProjectManager = {
  title: 'IT Project Manager',
  company: 'Granite Health',
  text: `Responsibilities
- Manage IT infrastructure and application projects from initiation to closure
- Build project plans, budgets and RAID logs; report status to the PMO
- Coordinate vendors and internal teams
- Run agile and waterfall projects

Requirements
- 5+ years of IT project management experience
- PMP certification
- Experience with MS Project or Jira
- Bachelor's degree`,
};

P.businessAnalystBank = {
  title: 'Business Analyst',
  company: 'Harbor Point Bank',
  text: `Responsibilities
- Gather and document business requirements and user stories
- Map current and future-state processes
- Support UAT and work with agile delivery teams
- Write SQL to validate data

Requirements
- 3+ years of business analysis experience
- Requirements gathering and process mapping
- SQL
- Experience in agile teams
- Bachelor's degree

Preferred
- Banking or financial services experience`,
};

P.customerSuccessManager = {
  title: 'Customer Success Manager',
  company: 'Tidewell Software',
  text: `Responsibilities
- Own a book of 40 mid-market customers after onboarding
- Drive adoption, renewals and expansion
- Run quarterly business reviews and track NPS and health scores

Requirements
- 3+ years in customer success or account management for SaaS
- Experience with renewals and expansion targets
- Gainsight or Salesforce
- Excellent communication skills`,
};

P.seniorAccountant = {
  title: 'Senior Accountant',
  company: 'Juniper Home',
  text: `Responsibilities
- Lead month-end close and journal entries
- Prepare account reconciliations and GAAP financial statements
- Support the annual audit

Requirements
- 4+ years of accounting experience
- CPA preferred
- Strong knowledge of GAAP
- NetSuite or similar ERP
- Advanced Excel
- Bachelor's degree in accounting`,
};

P.marketingManager = {
  title: 'Marketing Manager, Demand Generation',
  company: 'Tidewell Software',
  text: `Responsibilities
- Plan and run multi-channel campaigns that generate pipeline
- Manage HubSpot workflows and lead scoring
- Report on campaign performance

Requirements
- 5+ years of B2B marketing experience
- HubSpot or Marketo
- SEO and paid media
- Bachelor's degree in marketing or business`,
};

// Modelled on JPMorgan "Quantitative Research - Rates - Associate".
P.quantResearchRatesAssociate = {
  title: 'Quantitative Research - Rates - Associate',
  company: 'Calder Securities',
  text: `Job summary
Our Quantitative Research group partners with the Rates trading business to build pricing models, risk analytics and trading tools.

Job responsibilities
- Develop and maintain pricing models for interest rate derivatives
- Build risk and P&L analytics used by traders
- Implement models in C++ and Python

Required qualifications, capabilities, and skills
- Advanced degree (Master's or PhD) in mathematics, physics, engineering, computer science or another quantitative field
- Mastery of probability theory, stochastic calculus, partial differential equations and numerical analysis
- Strong software development skills in C++ or Python
- Ability to explain complicated technical concepts to non-technical audiences

Preferred qualifications, capabilities, and skills
- Knowledge of options pricing theory
- Experience with R, MATLAB or SQL`,
};

// ---------- candidates not in the other fixtures ----------

const R = {};

R.productManager = `Alicia Gomez
alicia.gomez@example.com · Austin, TX

Experience
Senior Product Manager, Ledgerline, Mar 2021 – Present
- Own the roadmap for a B2B SaaS invoicing product used by 3,000 companies
- Wrote PRDs and user stories; ran discovery interviews and usability tests
- Used product analytics (Amplitude, SQL) and A/B tests to prioritize; grew activation 18%
- Worked in agile squads with design and engineering
Product Manager, Ledgerline, Jun 2019 – Feb 2021
- Shipped the first AI-assisted invoice matching feature

Education
MBA, UT Austin, 2019
B.S. Computer Science, Texas A&M, 2015

Skills
Product management, roadmaps, user stories, agile, SQL, Amplitude, A/B testing`;

R.accountExecutive = `Derek Holt
derek.holt@example.com · Chicago, IL

Experience
Account Executive, Mid-Market, Pinecone Software, Feb 2021 – Present
- Closed $2.4M in new ARR in 2025, 124% of quota; President's Club 2023 and 2025
- Ran full-cycle sales from prospecting to close using MEDDICC
- Managed pipeline and forecasts in Salesforce
Sales Development Representative, Pinecone Software, Jul 2019 – Jan 2021
- Booked 40+ meetings a quarter through outbound prospecting

Education
B.A. Communications, University of Iowa, 2019

Skills
B2B SaaS sales, Salesforce, MEDDICC, prospecting, negotiation`;

R.federalITConsultant = `Marcus Reed
marcus.reed@example.com · Arlington, VA · Active Secret clearance

Experience
Senior Consultant, IT Modernization, Capitol Advisory Group, Jan 2019 – Present
- Developed IT modernization roadmaps and business cases for two federal agency CIOs
- Documented current-state business processes and systems; produced architecture diagrams and process flows
- Supported IT governance, portfolio management and FITARA reporting
- Planned a FedRAMP cloud migration for 45 applications
Consultant, Federal Technology, Capitol Advisory Group, Jun 2016 – Dec 2018
- Gathered requirements and supported IT strategy assessments

Education
B.S. Information Systems, George Mason University, 2016

Skills
IT strategy, IT modernization, enterprise architecture, cloud migration, FedRAMP, business cases, Visio, PowerPoint`;

// [resume, posting, min, max, why]. Resumes come from techPostings,
// techStrategyDeep, quantPostings, quantHoldout, fitCases (nurse,
// accountant, frontend) and this file.
const BANDS = [
  // Technology Strategy Consultant (2+ years)
  ['techStrategyConsultant', 'tsConsultantBig4', 70, 95, 'does this work, a level above it'],
  ['bigFourTechConsultant', 'tsConsultantBig4', 70, 95, 'does this work, a level above it'],
  ['juniorAnalyst', 'tsConsultantBig4', 45, 80, 'the right work, at the minimum years'],
  ['techStrategyManager', 'tsConsultantBig4', 35, 64, 'overqualified: a manager for a consultant role'],
  ['managementConsultant', 'tsConsultantBig4', 40, 70, 'strategy consulting, not technology'],
  ['businessAnalyst', 'tsConsultantBig4', 25, 55, 'adjacent: IT business analysis, no consulting'],
  ['softwareEngineer', 'tsConsultantBig4', 0, 35, 'a different job'],
  ['accountExecutive', 'tsConsultantBig4', 0, 30, 'a different job'],
  ['productManager', 'tsConsultantBig4', 20, 50, 'product strategy and roadmaps, not consulting'],
  // Technology Strategy Senior Consultant (5+ years)
  ['techStrategyConsultant', 'tsSeniorConsultantBig4', 75, 100, 'the role they do today'],
  ['bigFourTechConsultant', 'tsSeniorConsultantBig4', 75, 100, 'the role they do today'],
  ['federalITConsultant', 'tsSeniorConsultantBig4', 55, 85, 'technology strategy for federal clients'],
  ['juniorAnalyst', 'tsSeniorConsultantBig4', 20, 50, 'right field, well short of 5 years'],
  ['managementConsultant', 'tsSeniorConsultantBig4', 40, 70, 'consulting, lighter on technology'],
  ['techStrategyManager', 'tsSeniorConsultantBig4', 55, 90, 'a level below, same work'],
  ['softwareEngineer', 'tsSeniorConsultantBig4', 0, 35, 'a different job'],
  // Accenture-style consultant
  ['techStrategyConsultant', 'tsaConsultant', 70, 100, 'their work'],
  ['bigFourTechConsultant', 'tsaConsultant', 70, 100, 'their work'],
  ['juniorAnalyst', 'tsaConsultant', 45, 80, 'consulting firm, at the minimum years'],
  ['managementConsultant', 'tsaConsultant', 50, 80, 'strategy consulting, operating models; less technology'],
  ['businessAnalyst', 'tsaConsultant', 20, 50, 'no consulting firm experience'],
  ['projectManager', 'tsaConsultant', 15, 45, 'delivery, not strategy consulting'],
  ['softwareEngineer', 'tsaConsultant', 0, 30, 'a different job'],
  ['quantCareerChanger', 'tsaConsultant', 15, 45, 'transferable, no consulting'],
  // Accenture-style manager (7-10 years)
  ['techStrategyManager', 'tsaManager', 75, 100, 'the role they do today'],
  ['techStrategyConsultant', 'tsaManager', 30, 64, 'one level and a year short'],
  ['bigFourTechConsultant', 'tsaManager', 30, 64, 'one level and a year short'],
  ['juniorAnalyst', 'tsaManager', 0, 30, 'far too junior'],
  // EY-style senior consultant
  ['techStrategyConsultant', 'tstSeniorConsultant', 75, 100, 'the role they do today'],
  ['bigFourTechConsultant', 'tstSeniorConsultant', 70, 100, 'Big 4 technology consulting'],
  ['juniorAnalyst', 'tstSeniorConsultant', 30, 64, 'right field, short of 3 years'],
  ['projectManager', 'tstSeniorConsultant', 30, 65, 'transformation delivery, PMP, Jira; not strategy'],
  ['businessAnalyst', 'tstSeniorConsultant', 30, 65, 'transformation projects, not consulting'],
  ['softwareEngineer', 'tstSeniorConsultant', 0, 35, 'a different job'],
  // KPMG-style CIO advisory manager
  ['techStrategyManager', 'cioAdvisoryManager', 75, 100, 'the role they do today'],
  ['techStrategyConsultant', 'cioAdvisoryManager', 55, 79, 'the work, a step up'],
  ['bigFourTechConsultant', 'cioAdvisoryManager', 50, 79, 'the work, a step up'],
  ['projectManager', 'cioAdvisoryManager', 25, 55, 'IT delivery, not advisory'],
  ['softwareEngineer', 'cioAdvisoryManager', 10, 40, 'cloud, but not strategy'],
  ['juniorAnalyst', 'cioAdvisoryManager', 0, 35, 'far too junior'],
  // PwC-style digital & AI strategy
  ['techStrategyConsultant', 'digitalAIStrategySA', 65, 95, 'technology strategy; AI is a plus'],
  ['bigFourTechConsultant', 'digitalAIStrategySA', 60, 95, 'technology strategy; AI is a plus'],
  ['quantCareerChanger', 'digitalAIStrategySA', 30, 65, 'ML and data quality, no strategy consulting'],
  ['dataScientist', 'digitalAIStrategySA', 25, 60, 'AI hands-on, not strategy'],
  ['softwareEngineer', 'digitalAIStrategySA', 10, 40, 'a different job'],
  // Slalom-style strategy & operations
  ['techStrategyConsultant', 'strategyOpsConsultant', 65, 95, 'their work'],
  ['managementConsultant', 'strategyOpsConsultant', 65, 95, 'their work'],
  ['bigFourTechConsultant', 'strategyOpsConsultant', 60, 95, 'their work'],
  ['businessAnalyst', 'strategyOpsConsultant', 35, 70, 'project delivery and process work'],
  ['productManager', 'strategyOpsConsultant', 30, 65, 'product strategy and roadmaps'],
  ['softwareEngineer', 'strategyOpsConsultant', 0, 35, 'a different job'],
  // Guidehouse-style federal IT strategy
  ['federalITConsultant', 'itStrategyTransformationFederal', 80, 100, 'the role they do today'],
  ['techStrategyConsultant', 'itStrategyTransformationFederal', 60, 95, 'IT strategy and modernization, some federal'],
  ['businessAnalyst', 'itStrategyTransformationFederal', 30, 65, 'process documentation, not strategy'],
  ['softwareEngineer', 'itStrategyTransformationFederal', 10, 40, 'modernization hands-on, not strategy'],
  // Gartner-style IT strategy + AI
  ['techStrategyConsultant', 'itStrategyAIConsultant', 60, 90, 'IT strategy; light on AI'],
  ['bigFourTechConsultant', 'itStrategyAIConsultant', 55, 90, 'IT strategy; light on AI'],
  ['quantCareerChanger', 'itStrategyAIConsultant', 30, 65, 'data and ML, no consulting'],
  ['managementConsultant', 'itStrategyAIConsultant', 35, 70, 'consulting, not technology'],
  // Director (12+ years)
  ['techStrategyManager', 'techConsultingDirector', 50, 84, 'a step up; financial services clients'],
  ['techStrategyConsultant', 'techConsultingDirector', 0, 44, 'two levels up and half the years'],
  ['juniorAnalyst', 'techConsultingDirector', 0, 25, 'far too junior'],
  // Booz-style federal digital transformation senior (7+ years)
  ['federalITConsultant', 'digitalTransformationSeniorFederal', 65, 100, 'federal transformation consulting, 10 years'],
  ['techStrategyConsultant', 'digitalTransformationSeniorFederal', 45, 80, 'transformation work; a year short'],
  ['projectManager', 'digitalTransformationSeniorFederal', 45, 80, 'client-facing delivery, 10 years'],
  // Platinion-style senior IT consultant
  ['techStrategyConsultant', 'seniorITConsultantPlatinion', 60, 90, 'IT strategy and transformation consulting'],
  ['bigFourTechConsultant', 'seniorITConsultantPlatinion', 60, 90, 'IT strategy and transformation consulting'],
  ['softwareEngineer', 'seniorITConsultantPlatinion', 20, 55, 'architecture and cloud, no consulting'],
  // Entry-level associate
  ['juniorAnalyst', 'advisoryAssociateEntry', 70, 100, 'what they do today'],
  ['techStrategyConsultant', 'advisoryAssociateEntry', 35, 64, 'overqualified'],
  ['techStrategyManager', 'advisoryAssociateEntry', 0, 50, 'far overqualified'],
  // General roles
  ['productManager', 'seniorPMSaaS', 75, 100, 'the role they do today'],
  ['businessAnalyst', 'seniorPMSaaS', 20, 55, 'user stories and agile, not product ownership'],
  ['techStrategyConsultant', 'seniorPMSaaS', 10, 45, 'roadmaps, but not product management'],
  ['softwareEngineer', 'seniorPMSaaS', 10, 45, 'engineering, not product'],
  ['nurse', 'medSurgRN', 70, 100, 'an RN with med-surg and ACLS'],
  ['accountant', 'medSurgRN', 0, 15, 'a different job'],
  ['techStrategyConsultant', 'medSurgRN', 0, 15, 'a different job'],
  ['dataScientist', 'dataAnalystHealth', 50, 85, 'all of it, at a lower level'],
  ['businessAnalyst', 'dataAnalystHealth', 45, 75, 'SQL, Power BI and Excel'],
  ['quantCareerChanger', 'dataAnalystHealth', 50, 80, 'SQL, Python and analysis'],
  ['fpaAnalyst', 'dataAnalystHealth', 25, 55, 'Excel analysis; little SQL, no BI'],
  ['techStrategyConsultant', 'dataAnalystHealth', 15, 45, 'Power BI and Excel, not analysis work'],
  ['softwareEngineer', 'backendEngineer', 75, 100, 'the role they do today'],
  ['frontend', 'backendEngineer', 20, 55, 'engineering, the other end of the stack'],
  ['techStrategyConsultant', 'backendEngineer', 0, 25, 'a different job'],
  ['accountExecutive', 'accountExecutiveSaaS', 75, 100, 'the role they do today'],
  ['techStrategyConsultant', 'accountExecutiveSaaS', 0, 35, 'a sales job'],
  ['productManager', 'accountExecutiveSaaS', 0, 35, 'a sales job'],
  ['projectManager', 'itProjectManager', 75, 100, 'the role they do today'],
  ['techStrategyConsultant', 'itProjectManager', 35, 70, 'ran a PMO; no PMP'],
  ['businessAnalyst', 'itProjectManager', 30, 65, 'agile delivery, not project management'],
  ['businessAnalyst', 'businessAnalystBank', 75, 100, 'the role they do today'],
  ['juniorAnalyst', 'businessAnalystBank', 35, 70, 'process mapping and SQL, short on years'],
  ['techStrategyConsultant', 'businessAnalystBank', 35, 70, 'adjacent'],
  ['accountExecutive', 'customerSuccessManager', 35, 70, 'SaaS accounts and Salesforce'],
  ['techStrategyConsultant', 'customerSuccessManager', 10, 45, 'a different job'],
  ['accountant', 'seniorAccountant', 70, 100, 'the role they do today'],
  ['fpaAnalyst', 'seniorAccountant', 25, 60, 'finance, not accounting'],
  ['techStrategyConsultant', 'seniorAccountant', 0, 25, 'a different job'],
  ['techStrategyConsultant', 'marketingManager', 0, 25, 'a different job'],
  ['productManager', 'marketingManager', 15, 45, 'adjacent'],
  ['quantResearcherPhD', 'quantResearchRatesAssociate', 40, 70, 'quant and C++, but not derivatives pricing'],
  ['mfeNewGrad', 'quantResearchRatesAssociate', 50, 80, 'the training this role asks for'],
  ['techStrategyConsultant', 'quantResearchRatesAssociate', 0, 15, 'a different job'],
];

// [posting, better, worse, why]
const ORDER = [
  ['tsConsultantBig4', 'techStrategyConsultant', 'managementConsultant', 'technology strategy beats general strategy'],
  ['tsConsultantBig4', 'juniorAnalyst', 'softwareEngineer', 'a consulting analyst beats an engineer'],
  ['tsConsultantBig4', 'managementConsultant', 'businessAnalyst', 'consulting beats in-house analysis'],
  ['tsSeniorConsultantBig4', 'techStrategyConsultant', 'juniorAnalyst', 'seniority'],
  ['tsSeniorConsultantBig4', 'federalITConsultant', 'softwareEngineer', 'strategy beats engineering'],
  ['tsaConsultant', 'bigFourTechConsultant', 'businessAnalyst', 'consulting firm experience'],
  ['tsaManager', 'techStrategyManager', 'techStrategyConsultant', 'the manager fits the manager role'],
  ['tstSeniorConsultant', 'techStrategyConsultant', 'projectManager', 'strategy beats delivery'],
  ['cioAdvisoryManager', 'techStrategyManager', 'bigFourTechConsultant', 'already a manager'],
  ['digitalAIStrategySA', 'techStrategyConsultant', 'dataScientist', 'strategy role'],
  ['strategyOpsConsultant', 'managementConsultant', 'softwareEngineer', 'consulting'],
  ['itStrategyTransformationFederal', 'federalITConsultant', 'businessAnalyst', 'federal IT strategy'],
  ['itStrategyTransformationFederal', 'federalITConsultant', 'techStrategyConsultant', 'federal modernization work'],
  ['techConsultingDirector', 'techStrategyManager', 'techStrategyConsultant', 'seniority'],
  ['advisoryAssociateEntry', 'juniorAnalyst', 'techStrategyManager', 'the entry role fits the junior analyst'],
  ['seniorPMSaaS', 'productManager', 'businessAnalyst', 'product management'],
  ['dataAnalystHealth', 'businessAnalyst', 'techStrategyConsultant', 'SQL and BI'],
  ['backendEngineer', 'softwareEngineer', 'frontend', 'backend experience'],
  ['accountExecutiveSaaS', 'accountExecutive', 'techStrategyManager', 'the AE fits the AE role'],
  ['itProjectManager', 'projectManager', 'techStrategyConsultant', 'PMP project manager'],
  ['businessAnalystBank', 'businessAnalyst', 'juniorAnalyst', 'years of BA work'],
  ['customerSuccessManager', 'accountExecutive', 'techStrategyConsultant', 'SaaS accounts'],
  ['seniorAccountant', 'accountant', 'fpaAnalyst', 'accounting'],
  ['quantResearchRatesAssociate', 'mfeNewGrad', 'quantResearcherPhD', 'derivatives pricing training'],
];

// Screening and dealbreakers with Profile answers: [resume, posting, profile, expect, why]
// expect: 'dealbreaker' (capped at 30 with a dealbreaker) or 'clear' (no dealbreaker).
const PROFILE_CASES = [
  ['techStrategyConsultant', 'tsConsultantBig4', { workAuth: 'citizen', maxTravel: '20' }, 'dealbreaker', 'travel up to 50% is over their 20% limit'],
  ['techStrategyConsultant', 'tsConsultantBig4', { workAuth: 'citizen', maxTravel: '60' }, 'clear', 'travel within their limit'],
  ['techStrategyConsultant', 'tsConsultantBig4', { workAuth: 'needs-sponsorship', maxTravel: '60' }, 'clear', '"limited immigration sponsorship may be available" is not a refusal'],
  ['techStrategyConsultant', 'digitalAIStrategySA', { workAuth: 'needs-sponsorship', maxTravel: '100' }, 'dealbreaker', 'will not hire people who need H-1B sponsorship'],
  ['federalITConsultant', 'itStrategyTransformationFederal', { workAuth: 'citizen', clearance: 'secret', maxTravel: '50' }, 'clear', 'holds a Secret clearance'],
  ['techStrategyConsultant', 'itStrategyTransformationFederal', { workAuth: 'needs-sponsorship', maxTravel: '50' }, 'dealbreaker', 'US citizenship required'],
  ['nurse', 'medSurgRN', { workModes: 'remote' }, 'dealbreaker', 'an on-site job for someone who wants remote'],
  ['techStrategyConsultant', 'tsConsultantBig4', { workAuth: 'citizen', maxTravel: '60', minSalary: '200000' }, 'dealbreaker', 'pay tops out at $178,000'],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER, PROFILE_CASES };
