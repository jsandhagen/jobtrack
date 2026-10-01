// Product, project and program managers: three people (a SaaS product manager,
// a PMP IT project manager, a technical program manager) and fourteen postings
// rebuilt from real 2026 postings found by web search. Labels written before scoring.
const P = {};
P.seniorPMSaaS = { title: 'Senior Product Manager', company: 'Mixwell', location: 'Remote (US)', text: `About the role
Own a core area of our B2B SaaS sales engagement platform.

What you'll do
- Own the product roadmap and strategy for email and calendar workflows
- Run customer discovery, write PRDs and partner with design and engineering to ship
- Define success metrics and run experiments; analyze usage with SQL and Amplitude
- Work with sales, marketing and customer success on launches

What you'll bring
- 8+ years of product management experience, especially for a B2B or SaaS product
- Track record of shipping products customers love and measurably moving metrics
- Strong analytical skills; comfortable with SQL and product analytics tools
- Excellent communication with engineers and executives
- Bachelor's degree

Nice to have
- Experience with AI/LLM features
- Experience building technical cloud products

Pay: $146,000 - $211,000` };
P.productManagerMid = { title: 'Product Manager', company: 'Harborline', location: 'Austin, TX (Hybrid)', text: `Responsibilities
- Gather requirements from customers and stakeholders and turn them into user stories
- Prioritize the backlog and plan releases with an agile engineering team
- Track adoption and feedback after launch

Requirements
- 3-5 years of experience in product management, ideally in a SaaS or digital platform environment
- Experience with agile and Jira
- Strong written communication
- Bachelor's degree` };
P.productOwner = { title: 'Product Owner', company: 'Keystone Insurance', location: 'Remote (US)', text: `Responsibilities
- Own the backlog for the claims portal team; write user stories with acceptance criteria
- Run sprint planning, reviews and refinement with the scrum team
- Work with business stakeholders to prioritize features

Qualifications
- 2-4 years of experience as a Product Owner, Product Manager, Systems Analyst or Business Analyst
- Experience with agile methodology and Jira
- Working knowledge of UX principles
- Bachelor's degree in business, computer science or a related field
- CSPO or SAFe POPM certification preferred` };
P.groupPM = { title: 'Group Product Manager', company: 'Mixwell', location: 'Remote (US)', text: `Lead a team of product managers for our core platform.

Responsibilities
- Set the vision and strategy for the platform product area
- Hire, coach and develop a team of 4 product managers
- Own outcomes and roadmap with engineering and design leaders

Qualifications
- 8+ years of product management experience in B2B SaaS
- 2+ years of experience managing product managers
- MBA preferred` };
P.apm = { title: 'Associate Product Manager', company: 'Brightpath', location: 'New York, NY', text: `Our APM program is for recent graduates starting their product career.

Responsibilities
- Support a product manager on discovery, specs and launches
- Analyze product data and customer feedback

Qualifications
- Bachelor's degree, recent graduates welcome
- 0-2 years of experience
- Curiosity about how products are built and launched` };
P.itProjectManager = { title: 'IT Project Manager', company: 'Commonwealth Health', location: 'Richmond, VA', text: `Responsibilities
- Lead IT projects from initiation to closure using Agile, Waterfall and hybrid methods
- Build project plans, schedules and budgets in MS Project; manage RAID logs
- Run status meetings and report to steering committees
- Manage vendors and change requests

Qualifications
- 8+ years of progressive experience managing IT projects
- Active PMP certification required
- Experience delivering projects using Waterfall, Agile/Scrum and hybrid methodologies
- Experience managing budgets over $1M
- Bachelor's degree

Pay: $107,000 - $127,000` };
P.tpmCloud = { title: 'Technical Program Manager, Cloud', company: 'Northgate Cloud Services', location: 'Remote (US)', text: `Responsibilities
- Drive cloud migration programs for enterprise customers across engineering teams
- Own program plans, dependencies, risks and launch readiness
- Communicate status to engineering leaders and customers

Qualifications
- 5-7+ years of experience in a Technical Program or Project Management role within a professional services or cloud technology environment
- Hands-on knowledge of AWS, GCP or Azure
- Experience with Agile and Jira
- Bachelor's degree in computer science or engineering` };
P.tpmPlatform = { title: 'Technical Program Manager, Platform', company: 'Scalewise AI', location: 'San Francisco, CA', text: `Responsibilities
- Run programs for core engineering infrastructure: compute, storage and developer platforms
- Drive cross-team execution and remove blockers

Qualifications
- 5+ years as a Technical Program Manager, Product Manager, or Software Engineer
- 3+ years managing programs focused on core engineering infrastructure or cloud-native ecosystems (AWS/GCP)
- Experience with Kubernetes
- Bachelor's degree in computer science` };
P.businessProgramManager = { title: 'Business Program Manager', company: 'Contoso', location: 'Redmond, WA', text: `Responsibilities
- Run business programs and operating rhythm for a sales operations organization
- Coordinate cross-functional programs and deadline-driven projects
- Improve processes and track program metrics

Qualifications
- Bachelor's Degree in Business, Operations, Finance, or related field AND 2+ years experience in program management, process management, or process improvement
- Experience coordinating cross-functional programs, sales operations or business operations preferred` };
P.pmoDirector = { title: 'Director, Project Management Office', company: 'Commonwealth Health', location: 'Richmond, VA', text: `Responsibilities
- Lead the enterprise PMO and a team of 12 project managers
- Own portfolio governance and reporting to the CIO

Qualifications
- 12+ years of IT project and program management, including 5+ years leading project managers
- PMP or PgMP required
- Bachelor's degree; master's preferred` };
P.projectCoordinator = { title: 'Project Coordinator', company: 'Commonwealth Health', location: 'Richmond, VA', text: `Responsibilities
- Schedule meetings, take notes and track action items for project managers
- Maintain project documentation in SharePoint

Qualifications
- 0-2 years of experience in an administrative or project support role
- Proficiency with Microsoft Office
- Associate's or bachelor's degree` };
P.productMarketing = { title: 'Senior Product Marketing Manager', company: 'Mixwell', location: 'Remote (US)', text: `Responsibilities
- Develop positioning and messaging, lead launches and create sales enablement
- Run competitive analysis and win/loss interviews

Qualifications
- 5+ years of product marketing experience in B2B SaaS
- Excellent writing skills
- Bachelor's degree in marketing or a related field` };
P.scrumMaster = { title: 'Scrum Master', company: 'Keystone Insurance', location: 'Remote (US)', text: `Responsibilities
- Facilitate scrum ceremonies for two teams and remove impediments
- Coach teams on agile practices and track velocity

Qualifications
- 3+ years as a Scrum Master
- Certified ScrumMaster (CSM) or PSM required
- Experience with Jira` };
P.constructionPM = { title: 'Construction Project Manager', company: 'Ridge Builders', location: 'Richmond, VA', text: `Responsibilities
- Manage commercial construction projects from preconstruction to closeout
- Manage subcontractors, schedules, RFIs and submittals; run site meetings

Qualifications
- 5+ years of commercial construction project management experience
- Knowledge of Procore and construction contracts
- Bachelor's degree in construction management or engineering
- OSHA 30 preferred` };

const R = {};
R.productManager = `Maya Chen
maya.chen@example.com · Austin, TX

Experience
Senior Product Manager, Ledgerline, Mar 2022 – Present
- Own the roadmap for a B2B SaaS invoicing product used by 3,000 companies; grew activation 18%
- Run customer discovery interviews, write PRDs and user stories, and prioritize the backlog with engineering and design
- Defined success metrics and ran A/B tests; analyze usage with SQL and Amplitude
- Launched an AI invoice-matching feature built on LLMs with sales and marketing
Product Manager, Ledgerline, Jun 2020 – Feb 2022
- Shipped the first self-serve onboarding flow in an agile team using Jira
Associate Product Manager, Fieldnote, Jul 2018 – May 2020
- Analyzed product usage data and customer feedback to inform the roadmap

Education
B.S. Economics, University of Texas at Austin, 2018

Skills
Product management, product strategy, roadmaps, discovery, PRDs, user stories, agile, Jira, SQL, Amplitude, A/B testing`;

R.projectManager = `Daniel Ortiz, PMP
daniel.ortiz@example.com · Richmond, VA

Experience
IT Project Manager, Commonwealth Bank, Jan 2019 – Present
- Led 12 IT projects (ERP upgrade, data center migration, core banking integrations) with budgets up to $5M, using Waterfall, Agile and hybrid methods
- Built project plans and schedules in MS Project; managed RAID logs and change requests
- Ran status meetings and reported to the steering committee; managed three vendors
Project Coordinator, Commonwealth Bank, Jun 2016 – Dec 2018
- Tracked schedules and action items for a portfolio of infrastructure projects

Education
B.S. Information Systems, Virginia Commonwealth University, 2016

Licenses & Certifications
Project Management Professional (PMP), PMI, 2019
Certified ScrumMaster (CSM), 2021

Skills
Project management, Waterfall, Agile, Scrum, MS Project, Jira, budgeting, vendor management, risk management, stakeholder management`;

R.tpm = `Priya Nair
priya.nair@example.com · Seattle, WA

Experience
Senior Technical Program Manager, Cloudlane, Apr 2021 – Present
- Run the program to migrate 300 services to Kubernetes on AWS across 14 engineering teams
- Own program plans, dependencies, risks and launch readiness; report to engineering leadership
- Drove cross-team execution for the developer platform; cut deploy time 40%
Software Engineer, Cloudlane, Jul 2017 – Mar 2021
- Built backend services in Go and Python on AWS

Education
B.S. Computer Science, University of Washington, 2017

Skills
Technical program management, AWS, GCP, Kubernetes, Agile, Jira, Python, Go`;

const PROFILES = {
  productManager: { targetRoles: 'Senior Product Manager, Product Manager', location: 'Austin, TX', workModes: 'remote, hybrid' },
  projectManager: { targetRoles: 'IT Project Manager, Project Manager, Program Manager', location: 'Richmond, VA', workModes: 'remote, hybrid, onsite' },
  tpm: { targetRoles: 'Technical Program Manager, Program Manager', location: 'Seattle, WA', workModes: 'remote, hybrid, onsite' },
};

// [resume, posting, min, max, why]
const BANDS = [
  ['productManager', 'seniorPMSaaS', 65, 92, 'the job they do, ~8 years of product work'],
  ['productManager', 'productManagerMid', 60, 85, 'a level below, same work'],
  ['productManager', 'productOwner', 55, 82, 'backlog and stories, a step down'],
  ['productManager', 'groupPM', 25, 50, 'manages PMs; they have not'],
  ['productManager', 'apm', 15, 45, 'an entry role; overqualified'],
  ['productManager', 'productMarketing', 15, 45, 'marketing, not product'],
  ['productManager', 'itProjectManager', 10, 40, 'project management with PMP required'],
  ['productManager', 'scrumMaster', 5, 35, 'requires CSM'],
  ['projectManager', 'itProjectManager', 75, 100, 'the job they do'],
  ['projectManager', 'pmoDirector', 25, 50, 'leading project managers, 12+ years'],
  ['projectManager', 'projectCoordinator', 20, 50, 'their old job; overqualified'],
  ['projectManager', 'constructionPM', 5, 40, 'construction, not IT'],
  ['projectManager', 'scrumMaster', 40, 70, 'holds CSM, scrum is part of the work'],
  ['projectManager', 'businessProgramManager', 50, 80, 'program management of business operations'],
  ['projectManager', 'tpmCloud', 35, 65, 'project management in tech, not cloud engineering programs'],
  ['projectManager', 'seniorPMSaaS', 10, 40, 'product, not project management'],
  ['tpm', 'tpmPlatform', 75, 100, 'the job they do'],
  ['tpm', 'tpmCloud', 70, 100, 'the job they do'],
  ['tpm', 'itProjectManager', 20, 50, 'no PMP, IT not engineering'],
  ['tpm', 'seniorPMSaaS', 15, 45, 'product, not program'],
  ['tpm', 'businessProgramManager', 35, 65, 'program management, business side'],
];
// [posting, better, worse]
const ORDER = [
  ['seniorPMSaaS', 'productManager', 'projectManager'],
  ['itProjectManager', 'projectManager', 'productManager'],
  ['tpmCloud', 'tpm', 'projectManager'],
  ['productOwner', 'productManager', 'tpm'],
  ['scrumMaster', 'projectManager', 'productManager'],
];
module.exports = { POSTINGS: P, RESUMES: R, PROFILES, BANDS, ORDER };
