// Near-miss postings for a technology strategy consultant: jobs that share the
// vocabulary (technology, strategy, consultant, transformation, SAP,
// ServiceNow, cloud, roadmap, CIO) but are a different job. Written to check
// the fit score doesn't match on words alone.

const P = {};

P.presalesConsultant = {
  title: 'Technology Consultant, Enterprise Sales',
  company: 'Vantora Software',
  text: `About the role
Vantora sells cloud ERP software to mid-market and enterprise companies. As a Technology Consultant on our sales team you will win new logos alongside our account executives.

Responsibilities
- Run product demos of the Vantora platform for prospects, tailored to their business processes
- Respond to RFPs and security questionnaires
- Build proofs of concept and configure demo environments
- Partner with account executives to close deals and hit a quarterly sales quota
- Travel up to 50% to prospect sites

Requirements
- 3+ years in presales, solutions consulting or sales engineering for SaaS products
- Proven track record of contributing to quota attainment
- Hands-on experience configuring ERP software
- Excellent demo and presentation skills
- Bachelor's degree`,
};

P.sapFicoConsultant = {
  title: 'SAP S/4HANA FICO Functional Consultant',
  company: 'Ironbridge Systems Integrators',
  text: `Job description
We are hiring an SAP FICO consultant to configure and deliver S/4HANA Finance implementations.

Responsibilities
- Configure SAP FI (GL, AP, AR, asset accounting) and CO (cost center, profit center, product costing)
- Write functional specifications for RICEFW objects and work with ABAP developers
- Lead fit-gap workshops with finance users and design solutions in the system
- Execute unit testing, integration testing and support UAT and cutover
- Provide hypercare support after go-live

Required qualifications
- 6+ years of hands-on SAP FI/CO configuration experience
- At least 2 full-lifecycle S/4HANA implementations
- Strong knowledge of finance and accounting processes, including month-end close
- Experience with SAP integration points to MM, SD and PP
- SAP FICO certification

Preferred
- CPA or accounting degree`,
};

P.servicenowDeveloper = {
  title: 'ServiceNow Developer',
  company: 'Clearpoint Federal',
  text: `About the job
Clearpoint Federal is looking for a ServiceNow Developer to build and enhance ITSM and ITOM applications for a federal client.

What you'll do
- Develop and customize ServiceNow applications using JavaScript, Glide APIs, business rules, client scripts and UI policies
- Build integrations with REST and SOAP web services
- Configure Flow Designer workflows, catalog items and the CMDB
- Perform upgrades and resolve defects in an agile team

Required
- 4+ years of ServiceNow development experience
- Strong JavaScript skills
- Experience with ServiceNow ITSM and ITOM modules
- ServiceNow Certified System Administrator and Certified Application Developer
- Ability to obtain a Public Trust clearance`,
};

P.itAuditConsultant = {
  title: 'Technology Risk Consultant, IT Audit',
  company: 'Hartwell & Pryce LLP',
  text: `Overview
Our Technology Risk practice helps clients assess and improve their IT controls.

Responsibilities
- Perform IT general controls (ITGC) testing for SOX 404 audits, covering access management, change management and IT operations
- Evaluate application controls and SOC 1 / SOC 2 reports
- Document walkthroughs, test results and control deficiencies in audit workpapers
- Assess compliance with NIST, COBIT and ISO 27001 frameworks
- Work with external audit teams on financial statement audits

Qualifications
- 3+ years of IT audit, SOX or technology risk experience
- Working knowledge of ITGCs and internal controls
- CISA certification or ability to obtain within one year
- Bachelor's degree in accounting, information systems or related field`,
};

P.corporateStrategyCPG = {
  title: 'Senior Manager, Corporate Strategy',
  company: 'Brookfield Foods',
  text: `About Brookfield Foods
Brookfield Foods is a $9B consumer packaged goods company.

The role
- Lead the annual strategic planning process for the snacks and beverages divisions
- Evaluate M&A targets: market sizing, due diligence and valuation models
- Analyze category trends, consumer insights and competitor moves to shape portfolio strategy
- Build pricing and revenue growth management recommendations with brand teams
- Present to the CEO and executive leadership team

Requirements
- 7+ years in corporate strategy, M&A or management consulting, ideally in consumer packaged goods
- Expert financial modeling and valuation (DCF, LBO)
- Experience with Nielsen or IRI syndicated data
- MBA from a top program`,
};

P.helpDesk = {
  title: 'IT Support Technician',
  company: 'Lakemont School District',
  text: `Job summary
Provide hands-on technical support to staff and students across 12 schools.

Duties
- Resolve help desk tickets in ServiceNow for hardware, software and network issues
- Image, deploy and repair laptops, Chromebooks and printers
- Manage user accounts in Active Directory and Google Workspace
- Install and troubleshoot classroom technology and Wi-Fi access points
- Maintain asset inventory

Qualifications
- 2+ years of desktop support or help desk experience
- CompTIA A+ certification
- Experience with Windows 10/11, macOS and Active Directory
- Valid driver's license; ability to lift 50 lbs`,
};

P.enterpriseAccountExec = {
  title: 'Enterprise Account Executive',
  company: 'Strata Cloud',
  text: `About the role
Sell Strata's cloud infrastructure platform to CIOs and CTOs at Fortune 1000 companies.

Responsibilities
- Own a territory of 40 named enterprise accounts and build pipeline through outbound prospecting
- Run complex sales cycles with CIOs, CTOs and procurement, from discovery to negotiation and close
- Build account plans and forecast accurately in Salesforce
- Exceed an annual quota of $1.5M ARR

Requirements
- 5+ years of enterprise SaaS or cloud sales experience with a record of exceeding quota
- Experience selling to IT executives
- Strong negotiation skills
- Proficiency with Salesforce CRM and MEDDIC sales methodology`,
};

P.techRecruiter = {
  title: 'Technology Recruiter',
  company: 'Northwind Bank',
  text: `What you'll do
Partner with the CIO organization to hire software engineers, architects and technology leaders.

Responsibilities
- Manage full-cycle recruiting for 25-30 open technology roles at a time
- Source candidates on LinkedIn Recruiter and through referrals
- Advise hiring managers on market data, talent strategy and interview design
- Manage candidates in Workday Recruiting and report on pipeline metrics
- Negotiate and extend offers

Requirements
- 3+ years of technical recruiting experience, agency or in-house
- Experience with applicant tracking systems such as Workday or Greenhouse
- Strong sourcing skills, including Boolean search
- Bachelor's degree`,
};

P.cybersecurityConsultant = {
  title: 'Cybersecurity Consultant, Penetration Testing',
  company: 'Redline Security',
  text: `About the job
Join our offensive security team delivering penetration tests for enterprise clients.

Responsibilities
- Perform network, web application and cloud penetration tests
- Exploit vulnerabilities using Burp Suite, Metasploit, Nmap and custom scripts
- Conduct red team exercises and social engineering campaigns
- Write technical findings reports and remediation guidance for client security teams

Requirements
- 3+ years of hands-on penetration testing experience
- Strong knowledge of networking, Linux, Windows and Active Directory attacks
- Scripting in Python or PowerShell
- OSCP certification required; OSWE or OSEP a plus`,
};

P.marketingStrategist = {
  title: 'Digital Marketing Strategist',
  company: 'Brightline Agency',
  text: `About us
Brightline is a digital marketing agency for B2B technology brands.

The role
- Develop digital marketing strategies and campaign plans for technology clients
- Manage paid search, paid social and SEO programs and budgets
- Analyze campaign performance in Google Analytics and HubSpot and optimize for conversions
- Build content calendars and work with creative teams on copy and assets
- Present results and recommendations to client marketing leaders

Requirements
- 4+ years of digital marketing experience at an agency or in-house
- Hands-on experience with Google Ads, LinkedIn Ads, Google Analytics and HubSpot
- SEO and content marketing expertise
- Google Ads certification`,
};

P.workdayConsultant = {
  title: 'Workday HCM Implementation Consultant',
  company: 'Ascend HR Technology',
  text: `Responsibilities
- Configure Workday HCM core, compensation and absence modules for client implementations
- Lead design workshops with HR teams and translate requirements into Workday business processes
- Build EIBs and calculated fields; support data conversion and tenant testing
- Support go-live and post-production issues

Requirements
- 3+ years of hands-on Workday HCM configuration experience
- Workday HCM certification (active)
- At least two full-lifecycle Workday implementations
- Understanding of HR processes such as hiring, compensation and benefits`,
};

P.dataCenterTech = {
  title: 'Data Center Operations Technician',
  company: 'Hyperion Cloud',
  text: `About the job
Keep our hyperscale cloud data centers running.

Responsibilities
- Rack, stack, cable and replace servers, storage and network hardware
- Troubleshoot hardware failures and replace failed components
- Perform preventive maintenance and follow safety procedures
- Work rotating 12-hour shifts, including nights and weekends

Requirements
- 2+ years of data center or IT hardware experience
- Familiarity with Linux and networking fundamentals
- CompTIA A+ or Server+ certification
- Ability to lift 50 lbs and stand for long periods`,
};

P.healthcareStrategy = {
  title: 'Strategy Consultant, Healthcare Provider Practice',
  company: 'Carewell Advisors',
  text: `About the role
Advise hospitals and health systems on clinical service line strategy, growth and operations.

Responsibilities
- Develop service line strategies (cardiology, oncology, orthopedics) using market demand and physician supply analysis
- Build volume forecasts and facility master plans
- Lead clinical operations improvement projects: OR throughput, length of stay and patient flow
- Support hospital mergers with market and clinical integration analysis

Requirements
- 3+ years of healthcare strategy or consulting experience with hospitals or health systems
- Knowledge of hospital operations, reimbursement and clinical service lines
- Experience with claims and market data (e.g., CMS, Definitive Healthcare)
- MHA, MPH or MBA preferred`,
};

P.itProjectCoordinator = {
  title: 'IT Project Coordinator',
  company: 'Granite Manufacturing',
  text: `Responsibilities
- Schedule meetings and take notes for IT project teams
- Maintain project schedules, RAID logs and status reports in Smartsheet
- Track purchase orders and invoices for IT vendors
- Support the IT PMO with reporting

Requirements
- 1-2 years of administrative or project coordination experience
- Proficient with Microsoft Office and Smartsheet
- Strong organization skills
- Associate's or bachelor's degree`,
};

// [resume, posting, min, max, why] — resumes from techPostings / techStrategyDeep.
// A technology strategy consultant should not get a "good potential" (45+)
// read on any of these.
const BANDS = [
  ['techStrategyConsultant', 'presalesConsultant', 0, 44, 'a sales job with a quota and hands-on configuration'],
  ['techStrategyConsultant', 'sapFicoConsultant', 0, 44, 'hands-on SAP configuration; they ran an SAP vendor selection, not FICO'],
  ['techStrategyConsultant', 'servicenowDeveloper', 0, 44, 'a developer role; they wrote a ServiceNow roadmap'],
  ['techStrategyConsultant', 'itAuditConsultant', 0, 44, 'IT audit and SOX testing, a different practice'],
  ['techStrategyConsultant', 'corporateStrategyCPG', 0, 44, 'corporate strategy and M&A in consumer goods, not technology'],
  ['techStrategyConsultant', 'helpDesk', 0, 30, 'hands-on IT support'],
  ['techStrategyConsultant', 'enterpriseAccountExec', 0, 35, 'a sales job that sells to CIOs'],
  ['techStrategyConsultant', 'techRecruiter', 0, 30, 'recruiting for a CIO organization'],
  ['techStrategyConsultant', 'cybersecurityConsultant', 0, 30, 'hands-on penetration testing'],
  ['techStrategyConsultant', 'marketingStrategist', 0, 35, 'marketing strategy'],
  ['techStrategyConsultant', 'workdayConsultant', 0, 44, 'hands-on Workday configuration, and the title names Workday'],
  ['techStrategyConsultant', 'dataCenterTech', 0, 25, 'hands-on hardware'],
  ['techStrategyConsultant', 'healthcareStrategy', 0, 44, 'clinical strategy, not technology'],
  ['techStrategyConsultant', 'itProjectCoordinator', 0, 64, 'they could do it, but it is a junior administrative role'],
];

// [posting, better resume, worse resume, why]
const ORDER = [
  ['itProjectCoordinator', 'projectManager', 'techStrategyConsultant', 'a PMO role favours the project manager'],
];

module.exports = { POSTINGS: P, BANDS, ORDER };
