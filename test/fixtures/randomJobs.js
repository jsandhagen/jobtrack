// Sixteen jobs drawn at random (seeded draw from 60 common occupations), each
// rebuilt from what web search returned about current postings for it
// (requirements, years, licenses, certifications, typical duties), plus a
// resume of someone doing that job today. Scored for that person and for the
// other profiles in the fixtures, against labels set before scoring.
// Drawn: Bank Teller, Cybersecurity Analyst, Management Consultant, Graphic
// Designer, Medical Assistant, Social Worker, Supply Chain Analyst, Tax
// Associate, Warehouse Supervisor, Electrician, Database Administrator,
// Financial Analyst, Dental Hygienist, Elementary School Teacher, Auditor,
// Strategy Analyst.

const P = {};

P.bankTeller = {
  title: 'Bank Teller',
  company: 'Prairie State Bank',
  text: `Job Summary
Provide friendly, accurate service to customers at our Elm Street branch.

Essential Functions
- Process deposits, withdrawals, check cashing and loan payments
- Balance cash drawer daily and follow cash handling procedures
- Identify customer needs and refer them to bankers for products
- Follow bank security and compliance procedures (BSA/AML)

Qualifications
- High school diploma or GED
- 6+ months of cash handling or customer service experience
- Basic math and computer skills
- Strong attention to detail

Pay: $17 - $20 per hour. Full-time, on-site.`,
};

P.cybersecurityAnalyst = {
  title: 'Cybersecurity Analyst (SOC)',
  company: 'Meridian Health System',
  text: `About the role
Join our Security Operations Center to monitor, detect and respond to threats across 12 hospitals.

Responsibilities
- Monitor and triage alerts in Splunk and our EDR platform
- Investigate incidents and lead response for phishing, malware and account compromise
- Build detection rules and SOAR playbooks
- Write incident reports and recommend improvements

Requirements
- 3+ years of experience in a SOC, MSSP or incident response role
- Hands-on experience with SIEM (Splunk preferred) and EDR tools
- Knowledge of networking, Windows and Linux logs, and the MITRE ATT&CK framework
- Security+ or equivalent certification
- Bachelor's degree in cybersecurity, information technology, computer science or a related field, or equivalent experience

Preferred
- GCIH, GCIA or CySA+
- Scripting in Python or PowerShell`,
};

P.managementConsultant = {
  title: 'Consultant',
  company: 'Hartley Strategy Partners',
  text: `About the role
Consultants at Hartley work in small teams with senior client executives to solve their most important strategic and operational problems.

What you'll do
- Structure ambiguous problems, form hypotheses and run analyses
- Build financial and market models and synthesize findings into clear recommendations
- Present to client leadership and drive implementation

Qualifications
- Bachelor's degree with outstanding academic record; MBA or other advanced degree preferred
- 3+ years of experience at a top management consulting firm or in a strategy or operating role
- Exceptional analytical and quantitative problem-solving skills
- Strong Excel and PowerPoint
- Excellent communication skills
- Willingness to travel up to 70%`,
};

P.graphicDesigner = {
  title: 'Graphic Designer',
  company: 'Bluebird Brands',
  text: `What you'll do
- Design marketing assets: social graphics, email, packaging, print and trade show materials
- Keep work on brand and contribute to brand guidelines
- Prepare files for print and digital production

What you'll need
- 3+ years of professional graphic design experience
- Expert in Adobe Creative Suite (Photoshop, Illustrator, InDesign)
- A portfolio that shows strong typography, layout and branding work
- Bachelor's degree in graphic design or a related field

Nice to have
- Figma
- Motion graphics (After Effects)`,
};

P.medicalAssistant = {
  title: 'Certified Medical Assistant',
  company: 'Lakeside Family Medicine',
  text: `Position Summary
Support providers in a busy family medicine clinic.

Duties
- Room patients, take vital signs and record histories in the EHR
- Perform phlebotomy, EKGs and point-of-care tests
- Administer injections and immunizations as directed
- Schedule appointments and handle prior authorizations

Requirements
- Graduate of an accredited medical assisting program
- Current CMA, RMA or CCMA certification
- 1+ year of clinical medical assistant experience
- EHR experience (Epic preferred)
- BLS certification`,
};

P.socialWorker = {
  title: 'Social Worker (LMSW)',
  company: 'Riverside Community Services',
  text: `Job Summary
Provide case management and support to adults with serious mental illness in our community programs.

Responsibilities
- Complete psychosocial assessments and develop service plans
- Coordinate housing, benefits and medical care with community partners
- Provide crisis intervention and supportive counseling
- Document services in the electronic case record

Qualifications
- Master of Social Work (MSW) from a CSWE-accredited program
- Current LMSW license
- 1+ year of case management experience with adults with mental illness
- Knowledge of community resources and trauma-informed care
- Valid driver's license`,
};

P.supplyChainAnalyst = {
  title: 'Supply Chain Analyst',
  company: 'Northfield Foods',
  text: `About the role
Support demand and inventory planning for our distribution network.

Responsibilities
- Analyze inventory levels, forecast accuracy and service levels
- Build reports and dashboards in Power BI
- Support the monthly S&OP process
- Recommend safety stock and replenishment changes

Requirements
- 3+ years of experience in supply chain analytics, planning or operations
- Advanced Excel and SQL
- Experience with SAP or another ERP
- Knowledge of forecasting, inventory management and S&OP
- Bachelor's degree in supply chain, business, engineering or a related field

Preferred
- Tableau or Power BI
- APICS CPIM`,
};

P.taxAssociate = {
  title: 'Tax Associate',
  company: 'Pryor & Lane LLP',
  text: `As a Tax Associate you will prepare and review federal and state tax returns for individuals, partnerships and corporations.

Responsibilities
- Prepare federal and state income tax returns
- Research tax issues and document conclusions
- Prepare tax provisions and workpapers
- Communicate with clients to gather information

Requirements
- Bachelor's degree in accounting
- CPA eligible (150 credit hours) or on track to sit for the CPA exam
- 0-2 years of tax experience; internships count
- Knowledge of tax software (CCH Axcess, UltraTax or similar)
- Strong Excel skills`,
};

P.warehouseSupervisor = {
  title: 'Warehouse Supervisor',
  company: 'Keystone Distribution',
  text: `Position Summary
Lead second-shift operations in a 400,000 sq ft distribution center.

Responsibilities
- Supervise a team of 25 associates in receiving, picking and shipping
- Hit productivity, accuracy and safety targets
- Enforce OSHA safety rules and run safety huddles
- Manage inventory accuracy using our WMS

Requirements
- 3+ years of warehouse supervisory experience in a high-volume distribution center
- Experience with a warehouse management system (WMS)
- Forklift certification or ability to obtain within 2 weeks
- Knowledge of OSHA regulations
- High school diploma; bachelor's degree preferred`,
};

P.electrician = {
  title: 'Journeyman Electrician',
  company: 'Bright Current Electric',
  text: `We are hiring a Journeyman Electrician for commercial projects.

Responsibilities
- Install conduit, wiring, panels and lighting to code
- Read blueprints and schematics
- Troubleshoot and repair electrical systems
- Mentor apprentices

Requirements
- Active Journeyman Electrician license
- 4+ years of commercial electrical experience
- Thorough knowledge of the National Electrical Code (NEC)
- Own hand tools and reliable transportation
- Valid driver's license
- OSHA 10 certification`,
};

P.databaseAdministrator = {
  title: 'Database Administrator',
  company: 'Granite Insurance',
  text: `About the role
Keep our production databases fast, available and secure.

Responsibilities
- Administer SQL Server and PostgreSQL databases in production
- Manage backup and recovery, replication and high availability
- Tune queries and database performance
- Automate routine tasks with PowerShell and scripting

Requirements
- 3-5 years of experience in database administration
- Strong SQL Server and PostgreSQL administration
- Backup and recovery, high availability and replication
- Performance tuning
- PowerShell or shell scripting
- Bachelor's degree in computer science or related field, or equivalent experience`,
};

P.financialAnalyst = {
  title: 'Financial Analyst',
  company: 'Copperline Financial',
  text: `About the role
Partner with business leaders on budgeting, forecasting and performance analysis.

Responsibilities
- Build and maintain financial models and monthly forecasts
- Prepare variance analysis and management reporting
- Support the annual budget and long-range plan

Requirements
- Bachelor's degree in finance, accounting or economics
- 2+ years of experience in FP&A, corporate finance or investment banking
- Advanced Excel and financial modeling
- Experience with Adaptive Insights, Anaplan or similar planning tools a plus`,
};

P.dentalHygienist = {
  title: 'Registered Dental Hygienist',
  company: 'Bright Smiles Dental',
  text: `Join our general dentistry practice four days a week.

Responsibilities
- Perform prophylaxis, scaling and root planing, and periodontal charting
- Take radiographs and apply sealants and fluoride
- Administer local anesthesia
- Educate patients on oral hygiene

Requirements
- Graduate of an accredited dental hygiene program
- Current RDH license in good standing
- Local anesthesia certification
- Current CPR/BLS certification
- Radiography certification`,
};

P.elementaryTeacher = {
  title: 'Elementary School Teacher, Grade 3',
  company: 'Maple Grove School District',
  text: `Position
Third grade classroom teacher for the 2026-27 school year.

Responsibilities
- Plan and deliver standards-based lessons in reading, writing, math, science and social studies
- Use assessment data to differentiate instruction
- Maintain a positive, well-managed classroom
- Communicate with families and collaborate with grade-level team

Qualifications
- Bachelor's degree in elementary education or a related field
- Valid state teaching certificate for elementary grades (K-6)
- Student teaching or classroom teaching experience
- Strong classroom management skills
- Must pass background check and fingerprinting`,
};

P.internalAuditor = {
  title: 'Senior Internal Auditor',
  company: 'Westlake Manufacturing',
  text: `About the role
Lead risk-based audits across operations, finance and IT.

Responsibilities
- Plan and lead risk-based audits and SOX 404 testing
- Evaluate internal controls and recommend improvements
- Write audit reports and track remediation
- Present findings to management and the audit committee

Requirements
- 3-6 years of internal audit or public accounting experience, including at least 1 year in a senior or lead role
- Knowledge of SOX 404, COSO and GAAP
- Bachelor's degree in accounting, finance or a related field
- CPA, CIA or CISA preferred`,
};

P.strategyAnalyst = {
  title: 'Senior Analyst, Corporate Strategy',
  company: 'Crestline Brands',
  text: `About the role
Support the corporate strategy team on growth strategy, M&A and annual planning.

Responsibilities
- Analyze markets, competitors and acquisition targets
- Build financial models and business cases for strategic initiatives
- Prepare executive presentations for the leadership team

Requirements
- 2-4 years of experience in management consulting, investment banking or corporate strategy
- Strong Excel and PowerPoint skills; Power BI preferred
- Superior quantitative and qualitative analytical skills
- BA/BS degree in finance, business or economics`,
};

// ---------- people doing these jobs today ----------

const R = {};

R.teller = `Jasmine Ortiz
Springfield, IL · jasmine.ortiz@example.com

Experience
Bank Teller, Heartland Credit Union, May 2023 – Present
- Process 80+ deposits, withdrawals and loan payments a day with a balanced drawer
- Refer members to loan officers; recognized for top referrals in Q2 2025
- Follow BSA/AML procedures and report suspicious activity
Cashier, Target, Jun 2021 – Apr 2023
- Handled cash and card payments and customer returns

Education
High School Diploma, Springfield High School, 2021

Skills
Cash handling, customer service, Excel, attention to detail`;

R.socAnalyst = `Kevin Tran
kevin.tran@example.com

Experience
SOC Analyst II, Sentinel Managed Security (MSSP), Jan 2022 – Present
- Triage and investigate alerts in Splunk and CrowdStrike for 30 client environments
- Lead incident response for phishing and account compromise; wrote 40 incident reports
- Built Splunk detection rules mapped to MITRE ATT&CK and SOAR playbooks
- Automate enrichment with Python
IT Support Specialist, Bayview Schools, Jun 2019 – Dec 2021
- Windows and network troubleshooting

Education
B.S. Information Technology, University of Central Florida, 2019

Certifications
CompTIA Security+, GCIH`;

R.mbbConsultant = `Sarah Lindqvist
sarah.lindqvist@example.com

Experience
Associate, Bain-style Strategy Firm (Calder & Rowe), Sep 2022 – Present
- Led workstreams on growth strategy and cost transformation for retail and industrial clients
- Built market sizing and financial models; synthesized findings for CEO-level presentations
- Managed client stakeholders and drove implementation of a $40M cost program
Senior Analyst, Corporate Strategy, Hearth Foods, Jul 2019 – Aug 2022
- Supported annual strategic planning and two acquisitions

Education
MBA, Wharton, 2022
B.A. Economics, Northwestern University, 2017

Skills
Strategy, financial modeling, market sizing, Excel, PowerPoint, client management`;

R.designer = `Maya Brooks
Portfolio: mayabrooks.design

Experience
Graphic Designer, Lumen Retail, Mar 2021 – Present
- Design social, email, packaging and in-store print for a 120-store retailer
- Helped write and maintain brand guidelines; prepare print-ready files
- Created motion graphics for paid social in After Effects
Junior Designer, Fold Studio, Jun 2019 – Feb 2021
- Layout and typography for client brochures and reports

Education
B.F.A. Graphic Design, SCAD, 2019

Skills
Adobe Photoshop, Illustrator, InDesign, After Effects, Figma, typography, branding`;

R.medicalAssistantCMA = `Rosa Delgado, CMA
rosa.delgado@example.com

Experience
Certified Medical Assistant, Northside Pediatrics, Aug 2022 – Present
- Room 30+ patients a day, take vital signs and document histories in Epic
- Perform phlebotomy, EKGs, rapid tests and immunizations
- Handle scheduling and prior authorizations

Education
Medical Assistant Diploma, Pima Medical Institute (CAAHEP-accredited), 2022

Certifications
CMA (AAMA), BLS`;

R.socialWorkerLMSW = `Andre Wallace, LMSW
andre.wallace@example.com

Experience
Case Manager, Harborview Behavioral Health, Jun 2023 – Present
- Carry a caseload of 25 adults with serious mental illness
- Complete psychosocial assessments and service plans; coordinate housing and benefits
- Provide crisis intervention using trauma-informed care
- Document in Netsmart electronic case records

Education
Master of Social Work (MSW), Rutgers University (CSWE-accredited), 2023

Licenses
LMSW (New Jersey)`;

R.supplyChainAnalystPro = `Ethan Park
ethan.park@example.com

Experience
Supply Chain Analyst, Orchard Beverages, Feb 2021 – Present
- Analyze inventory, forecast accuracy and fill rates for 9 distribution centers
- Built Power BI dashboards and SQL queries on SAP data
- Run the demand review for the monthly S&OP process; recommended safety stock changes that cut inventory 12%
Logistics Coordinator, Orchard Beverages, Jun 2019 – Jan 2021

Education
B.S. Supply Chain Management, Michigan State University, 2019

Certifications
APICS CPIM

Skills
Excel, SQL, SAP, Power BI, forecasting, inventory management, S&OP`;

R.taxGrad = `Olivia Chen
olivia.chen@example.com

Education
Master of Accountancy, University of Texas, May 2026 (150 credit hours; sitting for the CPA exam)
B.B.A. Accounting, University of Texas, 2025

Experience
Tax Intern, Pryor & Lane LLP, Jan 2025 – Apr 2025
- Prepared federal and state individual and partnership tax returns in CCH Axcess
- Researched tax issues and prepared workpapers
VITA Volunteer Tax Preparer, 2023 – 2024

Skills
CCH Axcess, Excel, tax research`;

R.warehouseLead = `Luis Moreno
luis.moreno@example.com

Experience
Warehouse Supervisor, FastShip Logistics, Apr 2021 – Present
- Supervise 30 associates on night shift in a 500,000 sq ft distribution center
- Improved pick accuracy to 99.7% and cut recordable injuries 40% with daily safety huddles and OSHA training
- Manage inventory and labor in Manhattan WMS
Lead, Receiving, FastShip Logistics, Jan 2018 – Mar 2021
- Forklift operator and trainer

Education
High School Diploma, 2014

Certifications
Forklift certified, OSHA 30`;

R.electricianJourneyman = `Tom Becker
tom.becker@example.com

Experience
Journeyman Electrician, Allied Electric, Jun 2021 – Present
- Install conduit, wiring, panels and lighting on commercial jobs to NEC
- Read blueprints; troubleshoot and repair electrical systems; mentor two apprentices
Apprentice Electrician, Allied Electric, Jun 2017 – May 2021

Licenses & Certifications
Journeyman Electrician License (Ohio), OSHA 10, valid driver's license`;

R.dba = `Priyanka Rao
priyanka.rao@example.com

Experience
Database Administrator, Summit Health Plans, Mar 2021 – Present
- Administer 60 SQL Server and PostgreSQL production databases
- Manage backup and recovery, Always On availability groups and replication
- Tuned slow queries and indexes, cutting report times 70%
- Automated maintenance with PowerShell
Junior DBA, Summit Health Plans, Jul 2019 – Feb 2021

Education
B.S. Computer Science, Georgia State University, 2019`;

R.hygienist = `Emily Shaw, RDH
emily.shaw@example.com

Experience
Registered Dental Hygienist, Lakeview Dental Group, Jun 2020 – Present
- Prophylaxis, scaling and root planing, periodontal charting, radiographs, sealants
- Administer local anesthesia; educate patients on home care

Education
A.S. Dental Hygiene (CODA-accredited), Valencia College, 2020

Licenses & Certifications
RDH license, local anesthesia certification, radiography certification, BLS/CPR`;

R.teacher = `Grace Kim
grace.kim@example.com

Experience
Second Grade Teacher, Pine Hill Elementary, Aug 2021 – Present
- Plan and deliver standards-based reading, writing, math, science and social studies lessons
- Use assessment data to differentiate instruction for 24 students
- Classroom management with PBIS; communicate weekly with families
Student Teacher, Oak Ridge Elementary, Jan 2021 – May 2021

Education
B.S. Elementary Education, Indiana University, 2021

Certifications
Indiana Teaching License, Elementary Generalist (K-6)`;

R.auditor = `Daniel Price, CPA
daniel.price@example.com

Experience
Internal Audit Senior, Corwin Industries, Jan 2023 – Present
- Lead risk-based operational and financial audits; plan and execute SOX 404 testing
- Evaluate internal controls under COSO; write audit reports and track remediation
- Present findings to management and the audit committee
Audit Associate, Hale & Morgan LLP, Sep 2020 – Dec 2022
- External audits of manufacturing clients under GAAP

Education
B.S. Accounting, Penn State, 2020

Certifications
CPA`;

// [resume, posting, min, max, why]; other resumes come from the other fixtures.
const BANDS = [
  // the person doing the job
  ['teller', 'bankTeller', 75, 100, 'the job they do'],
  ['socAnalyst', 'cybersecurityAnalyst', 75, 100, 'the job they do'],
  ['mbbConsultant', 'managementConsultant', 75, 100, 'the job they do'],
  ['designer', 'graphicDesigner', 75, 100, 'the job they do'],
  ['medicalAssistantCMA', 'medicalAssistant', 75, 100, 'the job they do'],
  ['socialWorkerLMSW', 'socialWorker', 75, 100, 'the job they do'],
  ['supplyChainAnalystPro', 'supplyChainAnalyst', 75, 100, 'the job they do'],
  ['taxGrad', 'taxAssociate', 70, 100, 'exactly who this role hires'],
  ['warehouseLead', 'warehouseSupervisor', 75, 100, 'the job they do'],
  ['electricianJourneyman', 'electrician', 75, 100, 'the job they do'],
  ['dba', 'databaseAdministrator', 75, 100, 'the job they do'],
  ['fpaAnalyst', 'financialAnalyst', 70, 100, 'the job they do'],
  ['hygienist', 'dentalHygienist', 75, 100, 'the job they do'],
  ['teacher', 'elementaryTeacher', 75, 100, 'the job they do, a grade over'],
  ['auditor', 'internalAuditor', 75, 100, 'the job they do'],
  ['mbbConsultant', 'strategyAnalyst', 40, 64, 'can do it all; overqualified'],
  // neighbours
  ['managementConsultant', 'managementConsultant', 60, 90, 'strategy consulting, 7 years'],
  ['techStrategyConsultant', 'managementConsultant', 50, 80, 'consulting, technology-focused'],
  ['managementConsultant', 'strategyAnalyst', 60, 95, 'consulting into corporate strategy'],
  ['juniorAnalyst', 'strategyAnalyst', 45, 75, 'consulting analyst, technology side'],
  ['techStrategyConsultant', 'strategyAnalyst', 45, 75, 'consulting, technology side'],
  ['accountant', 'internalAuditor', 30, 60, 'accounting, not audit'],
  ['accountant', 'taxAssociate', 30, 64, 'accounting, not tax; overqualified'],
  ['auditor', 'taxAssociate', 25, 60, 'public accounting, audit not tax'],
  ['accountant', 'financialAnalyst', 35, 65, 'finance-adjacent'],
  ['businessAnalyst', 'supplyChainAnalyst', 25, 55, 'SQL and Excel, no supply chain'],
  ['dataScientist', 'supplyChainAnalyst', 35, 65, 'forecasting and SQL, no supply chain'],
  ['softwareEngineer', 'databaseAdministrator', 30, 60, 'PostgreSQL and SQL as a developer'],
  ['softwareEngineer', 'cybersecurityAnalyst', 15, 45, 'engineering, not security operations'],
  ['nurse', 'medicalAssistant', 30, 64, 'clinical, overqualified, not certified as an MA'],
  ['nurse', 'dentalHygienist', 0, 30, 'clinical, but a different license'],
  ['medicalAssistantCMA', 'dentalHygienist', 0, 30, 'different license'],
  ['hygienist', 'medicalAssistant', 10, 40, 'clinical, different certification'],
  ['teller', 'financialAnalyst', 0, 30, 'banking, not finance analysis'],
  ['quantCareerChanger', 'financialAnalyst', 25, 55, 'analysis in lending, no FP&A'],
  // the user's target profiles on unrelated jobs
  ['techStrategyConsultant', 'bankTeller', 0, 35, 'a different job, far overqualified'],
  ['techStrategyConsultant', 'graphicDesigner', 0, 20, 'a different job'],
  ['techStrategyConsultant', 'electrician', 0, 15, 'a different job'],
  ['techStrategyConsultant', 'dentalHygienist', 0, 15, 'a different job'],
  ['techStrategyConsultant', 'elementaryTeacher', 0, 20, 'a different job'],
  ['techStrategyConsultant', 'warehouseSupervisor', 0, 30, 'a different job'],
  ['techStrategyConsultant', 'cybersecurityAnalyst', 5, 35, 'technology, but hands-on security'],
  ['techStrategyConsultant', 'supplyChainAnalyst', 15, 45, 'Excel and SAP selection, not supply chain'],
  ['techStrategyConsultant', 'internalAuditor', 5, 35, 'a different job'],
  ['quantResearcherPhD', 'financialAnalyst', 15, 45, 'quantitative, not FP&A'],
  ['quantResearcherPhD', 'databaseAdministrator', 5, 35, 'a different job'],
  ['quantResearcherPhD', 'socialWorker', 0, 15, 'a different job'],
  ['quantResearcherPhD', 'medicalAssistant', 0, 15, 'a different job'],
  ['quantResearcherPhD', 'taxAssociate', 0, 25, 'a different job'],
  ['softwareEngineer', 'graphicDesigner', 0, 25, 'a different job'],
  ['nurse', 'socialWorker', 10, 40, 'care for patients, different license and training'],
  ['teacher', 'socialWorker', 5, 35, 'works with families, not social work'],
];

// [posting, better, worse, why]
const ORDER = [
  ['managementConsultant', 'mbbConsultant', 'techStrategyConsultant', 'strategy firm experience'],
  ['managementConsultant', 'techStrategyConsultant', 'businessAnalyst', 'consulting'],
  ['strategyAnalyst', 'managementConsultant', 'fpaAnalyst', 'strategy work beats FP&A'],
  ['financialAnalyst', 'fpaAnalyst', 'accountant', 'FP&A'],
  ['financialAnalyst', 'accountant', 'teller', 'finance training'],
  ['internalAuditor', 'auditor', 'accountant', 'audit'],
  ['taxAssociate', 'taxGrad', 'auditor', 'tax'],
  ['supplyChainAnalyst', 'supplyChainAnalystPro', 'dataScientist', 'supply chain'],
  ['supplyChainAnalyst', 'dataScientist', 'techStrategyConsultant', 'analysis'],
  ['databaseAdministrator', 'dba', 'softwareEngineer', 'database administration'],
  ['cybersecurityAnalyst', 'socAnalyst', 'softwareEngineer', 'security operations'],
  ['medicalAssistant', 'medicalAssistantCMA', 'nurse', 'MA certification'],
  ['medicalAssistant', 'nurse', 'quantResearcherPhD', 'clinical experience'],
  ['dentalHygienist', 'hygienist', 'nurse', 'RDH license'],
  ['socialWorker', 'socialWorkerLMSW', 'nurse', 'LMSW'],
  ['elementaryTeacher', 'teacher', 'socialWorkerLMSW', 'teaching certificate'],
  ['warehouseSupervisor', 'warehouseLead', 'projectManager', 'warehouse supervision'],
  ['bankTeller', 'teller', 'techStrategyConsultant', 'cash handling'],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER };
