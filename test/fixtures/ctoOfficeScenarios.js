// Real technology strategy jobs for the CTO-office persona (ctoOfficePersona.js),
// found by web search in October 2026 and rebuilt from what search returned
// about each real posting (noted beside it; company names kept where the role
// is the company's own, as it reads in a real search). Some come in the way
// people actually paste them: a Workday careers page or a LinkedIn job page,
// chrome and all. The person has real constraints in Profile: a U.S. citizen
// with no clearance, in Washington, DC, who will travel up to 30%.
// The resume also comes as a PDF's text, wrapped mid-sentence.
//
// Labels (BANDS, SCREENS, ORDER) were written before any of these was scored.

const P = {};

// Modelled on Accenture "Technology Strategy Manager" (Technology Strategy & Advisory), Workday page.
P.accentureTSAManager = {
  title: 'Technology Strategy Manager',
  company: 'Accenture',
  location: 'Washington, DC',
  text: `Skip to main content
Accenture Careers
Search for Jobs
Technology Strategy Manager
Apply
locations
Washington, DC
Arlington, VA
time type
Full time
posted on
Posted 5 Days Ago
job requisition id
R00325113
Technology Strategy & Advisory helps clients shape their technology agenda and turn it into business value.

What you'll do
- Shape technology strategies, operating models and modern architecture roadmaps for C-suite clients
- Build business cases that quantify the value of technology investments
- Lead small teams through analysis, workshops and recommendations
- Contribute to proposals and the growth of the practice

Here's what you need
- Minimum 1 year of advisory experience at a consulting firm
- Minimum 5 years of experience in at least one offering: Cloud Transformation, Industry & New Technology, Technology ROI / Cost Take Out, Operating Model, Modern Architecture or Data-Driven Enterprise
- Minimum 5 years of experience writing business cases (quantitative and qualitative) to support strategic business initiatives
- Minimum 2 years of experience leading or managing small teams, including planning analytical work, facilitating workshops and developing technology strategy recommendations
- Bachelor's degree

Bonus points if you have
- An MBA or equivalent graduate degree
- Broad experience with major technologies, from legacy to emerging

Travel: up to 80%, as client work requires.

Accenture is an equal opportunity employer.
Similar Jobs
Technology Strategy Consultant
Arlington, VA
Posted 30+ Days Ago
© 2026 Workday, Inc. All rights reserved.`,
};

// Modelled on KPMG "Manager, IT M&A - Due Diligence, Integration, and Separation".
P.kpmgITMAManager = {
  title: 'Manager, IT M&A - Due Diligence, Integration, and Separation',
  company: 'KPMG',
  location: 'McLean, VA',
  text: `Our Technology M&A team helps clients plan and deliver the technology side of acquisitions, mergers and divestitures.

Responsibilities
- Lead IT due diligence: assess targets' technology, architecture, cost and risk
- Plan and run IT integration and separation programs, including Day 1 readiness and TSAs
- Build IT cost and synergy models
- Manage consultants and client relationships

Qualifications
- Minimum five years of recent experience in technology/business consulting, or a combination of consulting and technology roles
- Demonstrated involvement in IT transformation projects supporting IT-focused M&A, such as system integration/separation, platform migration, IT architecture modernization or outsourcing of IT operations
- Bachelor's degree in information systems, computer science, finance, or a related field
- Ability to travel up to 50%`,
};

// Modelled on West Monroe "Senior Manager, Mergers & Acquisitions (high tech & software)".
P.westMonroeSrMgrMA = {
  title: 'Senior Manager, Mergers & Acquisitions (High Tech & Software)',
  company: 'West Monroe',
  location: 'Remote (US)',
  text: `Lead M&A engagements for software and high-tech clients and their investors.

Responsibilities
- Lead technology and operational due diligence, integration and carve-out engagements
- Own client relationships with private equity sponsors and corporate development teams
- Grow the practice through proposals and thought leadership

Qualifications
- 10+ years of experience in M&A advisory, management consulting, or operational roles within the software and high-tech industries
- Proven track record of leading M&A engagements, including due diligence, integration, and carve-out initiatives
- Bachelor's degree; MBA preferred
- Travel up to 25%`,
};

// Modelled on Microsoft "Senior Account Technology Strategist", LinkedIn page.
P.msftSeniorATS = {
  title: 'Senior Account Technology Strategist',
  company: 'Microsoft',
  location: 'Reston, VA',
  text: `Microsoft logo
Microsoft
Share
Show more options
Senior Account Technology Strategist
Reston, VA · 1 week ago · Over 100 applicants
Hybrid
Full-time
Easy Apply
Save
Save Senior Account Technology Strategist at Microsoft
Meet the hiring team
Dana Kim
Director, Technology Strategy
Message
About the job
As a Senior Account Technology Strategist, you are the trusted technology advisor to a set of enterprise customers, shaping their technology strategy and the role Microsoft's cloud and AI play in it.

Responsibilities
- Build relationships with customer CIOs, CTOs and their teams and understand their business priorities
- Develop the customer's technology strategy and architecture roadmap with Microsoft Azure, Microsoft 365 Copilot and Power Platform
- Lead envisioning sessions and executive briefings
- Partner with the account team to drive customer success, consumption and growth

Qualifications
Required:
- Bachelor's Degree in Computer Science, Information Technology, Engineering, Business, or related field AND 4+ years technical consulting, technical consultative selling, business consulting, practice building, or related technical/sales experience OR equivalent experience
Preferred:
- 5+ years of experience in digital transformation or using technology to drive customer business outcomes
- Technical breadth across Microsoft Azure, Microsoft 365 Copilot, Microsoft Security, Microsoft Fabric, Power Platform, GitHub, data and AI
Show more
Set alert for similar jobs
About the company
Microsoft
Software Development`,
};

// Modelled on Microsoft "Strategic Account Technology Strategist".
P.msftStrategicATS = {
  title: 'Strategic Account Technology Strategist',
  company: 'Microsoft',
  location: 'Reston, VA',
  text: `Responsibilities
- Act as the executive technology advisor to a strategic enterprise customer
- Own the customer's technology roadmap with Microsoft and align it to their business strategy
- Orchestrate Microsoft's technical teams and partners on the account
- Drive customer adoption, consumption and growth of Microsoft cloud and AI

Qualifications
Required:
- Bachelor's Degree in Computer Science, Information Technology, Engineering, Business or related field AND 7+ years technical consulting, technical consultative selling, practice building, or related technical/sales/industry experience OR equivalent experience
Preferred:
- 10+ years of technical consulting, technical consultative selling, business consulting or customer-facing experience
- 4+ years of experience in business consulting, consultative selling, or change management`,
};

// Modelled on AWS "Director, Enterprise Strategist".
P.awsEnterpriseStrategist = {
  title: 'Director, Enterprise Strategist',
  company: 'Amazon Web Services',
  location: 'Arlington, VA',
  text: `AWS Enterprise Strategists are former technology executives who help other executives transform with the cloud.

Basic Qualifications
- Bachelor's degree
- 10+ years in a leadership or executive position
- Executive role leading a large in-house digital, product, technology, or data-analytics organization (e.g. CDO, CPO, CAO, CIO, CTO)
- Excellent written and verbal communication skills, including executive presentations
- Estimated 40-60% travel requirement

Preferred Qualifications
- Masters or MBA degree
- Recognition from speaking engagements and technology publications`,
};

// Modelled on ServiceNow "Sr Inspire Value Consultant".
P.serviceNowInspireValue = {
  title: 'Sr Inspire Value Consultant',
  company: 'ServiceNow',
  location: 'Remote (US)',
  text: `Inspire Value Consultants help customers' executives see the business value of their digital transformation with ServiceNow.

What you get to do
- Build business cases and value models for customers' digital transformation programs
- Lead value discovery workshops with customer executives
- Benchmark customers' processes and quantify ROI
- Partner with account teams on strategic opportunities

Qualifications
- 7+ years of relevant experience as a management consultant with exposure to cloud technologies, or as a customer-facing strategy manager with a technology vendor
- Experience building business cases and financial models
- Excellent executive communication and storytelling
- Executive or leadership experience on digital transformation projects or enterprise software deployments preferred

Base pay: $126,375 - $208,425, plus equity and incentive compensation.`,
};

// Modelled on ServiceNow "AI Product Strategy & Operation Senior Manager" (SmartRecruiters).
P.serviceNowAIProductSO = {
  title: 'AI Product Strategy & Operation Senior Manager',
  company: 'ServiceNow',
  location: 'Remote (US)',
  text: `The AI Product Strategy & Operations team supports ServiceNow's AI product organization.

What you get to do
- Review business initiatives by tracking key metrics such as revenue, customers, costs and industry trends
- Run operational processes such as Quarterly Product Reviews and Annual Planning, aligning product groups and executives
- Conduct market assessments with senior staff and Product Management: market sizing, buy/build/partner assessments and strategy
- Oversee AI initiatives that drive growth and operational efficiency across the portfolio
- Support high-stakes partnerships and ad-hoc product initiatives

Qualifications
- At least 8-10 years of experience at a top management consulting firm, private equity, investment bank, or strategy & operations at a technology company
- Expertise and/or strong interest in the enterprise software/SaaS industry, ideally in the AI space
- Experience using quantitative skills to inform product strategy and operational excellence
- Effective communication skills, verbal and written, comfortable in business and technical discussions
- A track record of owning cross-functional projects and influencing senior leaders`,
};

// Modelled on Microsoft "Chief of Staff" to the Chief Technology & AI Officer, LinkedIn page.
P.msftCoSCTAIO = {
  title: 'Chief of Staff',
  company: 'Microsoft',
  location: 'Redmond, WA',
  text: `Microsoft logo
Microsoft
Share
Chief of Staff
Redmond, WA · 2 days ago · 87 applicants
On-site
Full-time
Apply
Save
About the job
The Office of the Chief Technology & AI Officer is looking for a Chief of Staff to drive the rhythm of the business, strategic planning and the most important cross-company initiatives.

Responsibilities
- Run the operating rhythm of the organization: business reviews, planning and OKRs
- Drive strategic initiatives across engineering, research and product
- Prepare executive communications and board materials
- Manage budget and headcount planning with finance

Qualifications
Required:
- Bachelor's Degree in a relevant field (e.g. Business Administration, Management, Computer Science) AND 8+ years experience in financial management, business planning, operations management, strategy, project management or business-related roles OR equivalent experience
- Proven experience in Chief of Staff, program management, or strategic operations roles within technical or product organizations
- Proven understanding of engineering and product development processes
- Exceptional communication, collaboration and organizational skills
Show more
About the company
Microsoft`,
};

// Modelled on Capital One "Manager, Process Management (Tech Strategy & Operations)", McLean.
P.capOneTechStratOps = {
  title: 'Manager, Process Management (Tech Strategy & Operations)',
  company: 'Capital One',
  location: 'McLean, VA',
  text: `Tech Strategy & Operations works with Capital One's technology leaders on their biggest open-ended problems. As a technology strategy analyst on the team, you'll identify, structure, research and communicate those problems and influence senior leadership.

Responsibilities
- Structure open-ended technology problems and lead the analysis to solve them
- Research technology trends and the competitive landscape
- Build executive presentations and recommendations for senior technology leaders
- Drive programs to implement the recommendations, managing stakeholders across technology and the business

Basic Qualifications:
- Bachelor's Degree or military experience
- At least 5 years of experience in process management, program management, or consulting
- At least 3 years of experience in stakeholder management
- At least 2 years of experience in a Strategy and Operations or consulting role that involves change management and communications

Preferred Qualifications:
- Master's Degree in Business Management, Process Management, Project Management, Computer Science or Information Systems

McLean, VA: $158,600 - $181,000 for Manager, Process Management`,
};

// Modelled on bank "Director, Technology Strategy & Portfolio" postings (CIO office).
P.bankTechPortfolioDirector = {
  title: 'Director, Technology Strategy & Portfolio',
  company: 'Potomac National Bank',
  location: 'Washington, DC',
  text: `Responsibilities
- Oversee the bank's technology portfolio so that strategic, regulatory, risk and business initiatives are prioritized, governed and delivered effectively
- Lead the annual technology strategy and investment planning process for the CIO
- Lead a team of portfolio and strategy managers

Qualifications
- 10+ years of experience in technology delivery, portfolio management, program management or technology transformation
- Proven experience managing a complex portfolio of technology initiatives
- 5+ years of people leadership
- Experience in banking, financial services or another regulated industry is strongly preferred
- Bachelor's degree`,
};

// Modelled on Booz Allen "Digital Transformation Consultant, Senior" (McLean).
P.boozDigitalTransformation = {
  title: 'Digital Transformation Consultant, Senior',
  company: 'Booz Allen Hamilton',
  location: 'McLean, VA',
  text: `Help a federal agency modernize how it serves taxpayers.

Basic Qualifications
- 8+ years of experience with cross-functional teams delivering multi-phased digital enterprise solutions through process analysis, data transformation and pragmatic change management
- Experience with digital strategy, IT project management, enterprise architecture, SDLC, or transformation
- Ability to lead requirements meetings and workshops with business and IT stakeholders
- Ability to obtain an IRS Moderate Risk Background Investigation (MBI)
- Bachelor's degree

Clearance: applicants selected will be subject to a government investigation and may need to meet eligibility requirements; U.S. citizenship is required.`,
};

// Modelled on Booz Allen "Mission Strategy Consultant, Senior" (McLean).
P.boozMissionStrategy = {
  title: 'Mission Strategy Consultant, Senior',
  company: 'Booz Allen Hamilton',
  location: 'McLean, VA',
  text: `Help an intelligence community client shape its strategy and the technology to deliver it.

Basic Qualifications
- 6+ years of experience designing and implementing business or technology strategies
- Experience conducting research and analysis of industry best practices
- Experience with Microsoft Office, including PowerPoint and Excel
- Active TS/SCI clearance with polygraph
- Bachelor's degree`,
};

// A near miss: Capital One "Director, Technical Program Management".
P.capOneDirectorTPM = {
  title: 'Director, Technical Program Management',
  company: 'Capital One',
  location: 'McLean, VA',
  text: `Basic Qualifications:
- Bachelor's degree
- At least 7 years of experience in technical program management

Preferred Qualifications:
- 7+ years of experience designing and building data-intensive solutions using distributed computing
- 3+ years of experience building distributed systems and highly available services on AWS
- 3+ years of experience with Agile delivery
- Experience building systems in a highly regulated environment
- MBA or Master's Degree in a related technical field`,
};

// ---------- the resume as a PDF's text: wrapped lines, bullet glyphs, a two-column header ----------

const R = {};
R.ctoOfficePdfText = `JORDAN AVERY
Washington, DC · jordan.avery@example.com · linkedin.com/in/jordanavery
EXPERIENCE
Technology Strategy Consultant, Office of the CTO, Appian, Jul 2022 – Present
• Research emerging technologies (generative AI, AI agents, process mining) and write analyses and
executive summaries for the CTO and executive team
• Built the competitive analysis of Pega, ServiceNow, Microsoft Power Platform and UiPath used in product
planning and for Gartner and Forrester evaluations
• Led technical due diligence on 3 acquisition targets, including one that closed, and drafted the
integration plan
• Evaluated 20+ AI and data vendors and set up 4 technology partnerships, defining integration
requirements with product and engineering
• Built prototypes of AI agent features in Python and TypeScript that shaped two items on the product
roadmap
• Prepared board and executive presentations on AI strategy; presented to customers at Appian World
• Ran the annual technology planning cycle for the CTO organization, tracking OKRs across 6 teams
Technology Strategy Engineer, Office of the CTO, Appian, Jul 2021 – Jun 2022
• Prototyped integrations with cloud AI services and wrote market and company research for the CTO
Analyst, Technology Strategy & Transformation, Deloitte Consulting, Aug 2019 – Jun 2021
• Developed IT strategies, technology roadmaps and business cases for CIO clients in financial services
and the public sector
• Assessed IT operating models and built cost models in Excel; prepared client-ready PowerPoint
deliverables
• Facilitated workshops with client executives
EDUCATION
B.S. Systems Engineering, University of Virginia, 2019
SKILLS
Technology strategy, emerging technology research, competitive analysis, AI strategy, generative AI,
low-code, business process management, technical due diligence, technology partnerships, business cases,
financial modeling, Python, TypeScript, SQL, Excel, PowerPoint`;

// The person's Profile: real constraints.
const PROFILE = {
  targetRoles: 'Technology Strategy Manager, Strategy & Operations Manager, Chief of Staff, Corporate Strategy Manager, Product Strategy',
  location: 'Washington, DC',
  workModes: 'remote, hybrid, onsite',
  workAuth: 'citizen',
  clearance: 'none',
  maxTravel: '30',
};

// [posting, min, max, why]: the fit score with that Profile.
const BANDS = [
  ['capOneTechStratOps', 65, 90, 'a technology strategy analyst for tech leaders, in McLean'],
  ['serviceNowAIProductSO', 55, 82, 'AI product strategy and operations at a software company; short of 8-10 years'],
  ['serviceNowInspireValue', 60, 85, 'business cases and value for executives, at a tech vendor'],
  ['msftCoSCTAIO', 50, 80, 'chief of staff to a CTO-type office; 7 of 8+ years'],
  ['msftSeniorATS', 45, 75, 'customer-facing technology strategy at a vendor, partly sales'],
  ['msftStrategicATS', 35, 65, 'the same, more senior'],
  ['kpmgITMAManager', 0, 30, 'IT M&A diligence they have done, but 50% travel is over their 30% limit'],
  ['accentureTSAManager', 0, 30, 'their kind of work, but up to 80% travel'],
  ['westMonroeSrMgrMA', 20, 45, '10+ years leading M&A engagements'],
  ['awsEnterpriseStrategist', 0, 30, 'an ex-CIO/CTO role, with 40-60% travel'],
  ['bankTechPortfolioDirector', 25, 50, 'a director role, 10+ years'],
  ['boozDigitalTransformation', 35, 65, 'digital strategy for a federal agency; 8+ years of delivery'],
  ['boozMissionStrategy', 0, 30, 'requires an active TS/SCI with polygraph they don\'t hold'],
  ['capOneDirectorTPM', 0, 35, 'technical program management of data-intensive systems'],
];

// [posting, expected]: what the Profile answers make of each.
// 'dealbreaker': capped with a stated reason; 'move': in person away from Washington, DC; 'near': in reach.
const SCREENS = [
  ['accentureTSAManager', 'dealbreaker'],
  ['kpmgITMAManager', 'dealbreaker'],
  ['awsEnterpriseStrategist', 'dealbreaker'],
  ['boozMissionStrategy', 'dealbreaker'],
  ['msftCoSCTAIO', 'move'],
  ['capOneTechStratOps', 'near'],
  ['msftSeniorATS', 'near'],
  ['boozDigitalTransformation', 'near'],
];

// [better, worse, why]
const ORDER = [
  ['capOneTechStratOps', 'capOneDirectorTPM', 'tech strategy beats engineering program management at the same company'],
  ['serviceNowInspireValue', 'westMonroeSrMgrMA', 'their level beats a senior M&A lead'],
  ['msftSeniorATS', 'msftStrategicATS', 'the level they are at'],
  ['serviceNowAIProductSO', 'bankTechPortfolioDirector', 'their level beats a director'],
];

module.exports = { POSTINGS: P, RESUMES: R, PROFILE, BANDS, SCREENS, ORDER };
