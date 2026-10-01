// A second random batch (seeded draw of 10 more occupations), rebuilt from web
// search results about current postings, written after every rule change the
// first batch (randomJobs.js) prompted, and scored once with no change after.
// Its result is the honest estimate for jobs the scorer hasn't seen.
// Drawn: Pharmacist, Human Resources Generalist, Customer Service
// Representative, Lab Technician, Network Engineer, Event Planner, Data
// Engineer, Construction Project Manager, Insurance Underwriter, Content Writer.

const P = {};

P.pharmacist = {
  title: 'Staff Pharmacist',
  company: 'Corner Drug Co.',
  text: `Job Description
Lead safe, accurate dispensing and patient care in a high-volume community pharmacy.

Responsibilities
- Verify and dispense prescriptions; counsel patients on medications
- Administer immunizations
- Supervise pharmacy technicians and manage workflow
- Ensure compliance with state and federal pharmacy law

Qualifications
- Doctor of Pharmacy (PharmD) from an accredited college of pharmacy
- Active, unrestricted pharmacist license in the state of practice
- APhA immunization certification
- Current BLS certification
- Retail pharmacy experience preferred`,
};

P.hrGeneralist = {
  title: 'HR Generalist',
  company: 'Summit Outdoor Co.',
  text: `About the role
Support 600 employees across our headquarters and two distribution centers.

Responsibilities
- Handle employee relations issues, investigations and corrective action
- Support onboarding, benefits enrollment and leave administration
- Maintain employee data in the HRIS (Workday)
- Advise managers on policies and employment law

Requirements
- 3-5 years of HR generalist experience
- Experience with employee relations and investigations
- HRIS experience (Workday, ADP or similar)
- Knowledge of federal and state employment law
- Bachelor's degree in human resources, business or a related field

Preferred
- SHRM-CP or PHR`,
};

P.customerServiceRep = {
  title: 'Customer Service Representative',
  company: 'Brightway Insurance Services',
  text: `What you'll do
- Answer inbound calls, chats and emails from policyholders
- Resolve billing and policy questions on the first contact
- Document every interaction in Salesforce
- Escalate complex issues to the right team

What we're looking for
- 1+ year of customer service or call center experience
- Experience with a CRM such as Salesforce or Zendesk
- Typing speed of 40+ words per minute
- High school diploma or equivalent
- Bilingual in Spanish a plus`,
};

P.labTechnician = {
  title: 'Medical Laboratory Technician',
  company: 'Riverbend Regional Medical Center',
  text: `Position Summary
Perform routine and complex tests in hematology, chemistry, urinalysis and blood bank.

Essential Functions
- Process and analyze patient specimens following procedures
- Operate, calibrate and maintain laboratory instruments
- Perform quality control and document results in the LIS
- Report critical values to providers

Qualifications
- Associate degree in medical laboratory technology or a related science
- MLT (ASCP) certification
- 1+ year of clinical laboratory experience preferred`,
};

P.networkEngineer = {
  title: 'Network Engineer',
  company: 'Granite Insurance',
  text: `About the role
Design, build and support our enterprise network across 40 offices and two data centers.

Responsibilities
- Configure and maintain Cisco routers, switches and wireless
- Manage Palo Alto firewalls and VPNs
- Troubleshoot routing (BGP, OSPF) and switching issues
- Document network designs and changes

Requirements
- 5+ years of network engineering experience
- Strong routing and switching (BGP, OSPF, VLANs)
- Firewall experience (Palo Alto or Cisco)
- CCNP or CCNA certification
- Bachelor's degree in computer science, information technology or a related field, or equivalent experience`,
};

P.eventPlanner = {
  title: 'Event Planner',
  company: 'Larkspur Hotels',
  text: `About the role
Plan and run corporate meetings, conferences and incentive events for our clients.

Responsibilities
- Manage events end to end: budgets, timelines, venues and run of show
- Source vendors and negotiate contracts
- Coordinate registration, travel and on-site logistics
- Track expenses and report results

Requirements
- 3-5 years of event planning experience
- Vendor management and contract negotiation
- Budget management
- Bachelor's degree in hospitality, marketing, communications or a related field
- Ability to travel up to 30%

Preferred
- CMP certification`,
};

P.dataEngineer = {
  title: 'Data Engineer',
  company: 'Tidewell Software',
  text: `What you'll do
- Build and maintain batch and streaming data pipelines
- Model data in Snowflake with dbt
- Orchestrate workflows in Airflow
- Partner with analysts and data scientists on data quality

Requirements
- 3+ years of data engineering experience
- Strong Python and SQL
- Experience with Airflow and dbt
- Snowflake or another cloud data warehouse
- Spark experience a plus`,
};

P.constructionPM = {
  title: 'Construction Project Manager',
  company: 'Keystone Builders',
  text: `Position Summary
Manage commercial construction projects from preconstruction through closeout.

Responsibilities
- Own project budgets, schedules and subcontractor buyout
- Manage RFIs, submittals and change orders in Procore
- Run owner and subcontractor meetings
- Enforce site safety with the superintendent

Requirements
- 5+ years of commercial construction project management experience
- Bachelor's degree in construction management, civil engineering or a related field
- Proficiency with Procore and MS Project
- Ability to read plans and specifications
- OSHA 30 certification

Preferred
- PMP`,
};

P.insuranceUnderwriter = {
  title: 'Commercial Lines Underwriter',
  company: 'Northfield Mutual',
  text: `About the role
Underwrite small and mid-sized commercial accounts (property, general liability, auto) within your authority.

Responsibilities
- Evaluate submissions, assess risk and price accounts
- Build relationships with independent agents
- Manage a renewal book and meet profitability goals

Requirements
- 3-5 years of commercial lines underwriting experience
- Strong risk assessment and analytical skills
- Bachelor's degree or equivalent experience
- CPCU or progress toward it preferred`,
};

P.contentWriter = {
  title: 'Content Writer',
  company: 'Tidewell Software',
  text: `About the role
Write the blog posts, guides and customer stories that bring finance teams to Tidewell.

What you'll do
- Write and edit SEO-driven blog posts, guides and case studies
- Interview customers and subject-matter experts
- Publish and optimize content in WordPress

What you'll need
- 2-4 years of B2B content writing experience
- A portfolio of published work
- Working knowledge of SEO and tools such as Ahrefs or Semrush
- Experience with WordPress or another CMS
- Bachelor's degree in English, journalism, communications or a related field`,
};

// ---------- people doing these jobs today ----------

const R = {};

R.pharmacistRx = `Nadia Hassan, PharmD
nadia.hassan@example.com

Experience
Pharmacist, Walgreens-style Retail Pharmacy (Main Street Drug), Jul 2021 – Present
- Verify and dispense 300+ prescriptions a day; counsel patients
- Administer flu, COVID and shingles immunizations
- Supervise four pharmacy technicians

Education
Doctor of Pharmacy (PharmD), University of Michigan, 2021

Licenses & Certifications
Michigan Pharmacist License (active), APhA Pharmacist and Patient-Centered Immunization Certificate, BLS`;

R.hrPro = `Jordan Ellis
jordan.ellis@example.com

Experience
HR Generalist, Pinecrest Manufacturing, Feb 2021 – Present
- Handle employee relations cases and investigations for 450 employees
- Run onboarding, benefits enrollment and FMLA leave
- Maintain records in ADP Workforce Now; built HR reports
- Advise managers on policies and state and federal employment law
HR Coordinator, Pinecrest Manufacturing, Jun 2019 – Jan 2021

Education
B.S. Human Resource Management, Purdue University, 2019

Certifications
SHRM-CP`;

R.csRep = `Tasha Green
tasha.green@example.com

Experience
Customer Service Representative, Allied Auto Insurance, Mar 2023 – Present
- Handle 60+ inbound calls and chats a day on billing and policy questions
- Document interactions in Salesforce; 95% customer satisfaction
Retail Associate, Kohl's, Jun 2021 – Feb 2023

Education
High School Diploma, 2021

Skills
Salesforce, Zendesk, typing 55 wpm, bilingual English/Spanish`;

R.mlt = `Carlos Rivera, MLT(ASCP)
carlos.rivera@example.com

Experience
Medical Laboratory Technician, St. Anne's Hospital, Aug 2022 – Present
- Run hematology, chemistry, urinalysis and blood bank tests
- Calibrate and maintain analyzers; perform QC and document in the LIS
- Report critical values to providers

Education
A.A.S. Medical Laboratory Technology, Austin Community College, 2022

Certifications
MLT (ASCP)`;

R.netEng = `Owen Clarke
owen.clarke@example.com

Experience
Network Engineer, Lakeshore Health, Apr 2019 – Present
- Configure and support Cisco routers, switches and Meraki wireless across 35 sites
- Manage Palo Alto firewalls and site-to-site VPNs
- Troubleshoot BGP and OSPF routing; segment the network with VLANs
- Document designs and changes
Network Technician, Lakeshore Health, Jun 2017 – Mar 2019

Education
B.S. Information Technology, Ball State University, 2017

Certifications
CCNP Enterprise, CCNA`;

R.eventPro = `Bianca Moretti
bianca.moretti@example.com

Experience
Event Manager, Harbor Conference Group, Mar 2021 – Present
- Plan and run 30+ corporate meetings and conferences a year with budgets up to $1.2M
- Source venues and vendors and negotiate contracts
- Manage registration, travel and on-site logistics
Event Coordinator, Harbor Conference Group, Jul 2019 – Feb 2021

Education
B.S. Hospitality Management, UNLV, 2019

Certifications
CMP`;

R.dataEng = `Ravi Kumar
ravi.kumar@example.com

Experience
Data Engineer, Northpeak Commerce, May 2021 – Present
- Build batch and streaming pipelines in Python and Spark
- Model data in Snowflake with dbt; orchestrate with Airflow
- Own data quality checks for finance and marketing data
Data Analyst, Northpeak Commerce, Jun 2019 – Apr 2021

Education
B.S. Computer Science, UC San Diego, 2019

Skills
Python, SQL, Spark, Airflow, dbt, Snowflake, Kafka`;

R.constructionPMPro = `Megan Doyle
megan.doyle@example.com

Experience
Project Manager, Ridgeline Construction, Mar 2019 – Present
- Manage commercial projects up to $40M: budgets, schedules, buyout and closeout
- Run RFIs, submittals and change orders in Procore; schedules in MS Project
- Lead owner and subcontractor meetings; enforce site safety
Assistant Project Manager, Ridgeline Construction, Jun 2016 – Feb 2019

Education
B.S. Construction Management, Colorado State University, 2016

Certifications
OSHA 30`;

R.underwriter = `Peter Novak
peter.novak@example.com

Experience
Commercial Lines Underwriter, Lakeside Insurance Group, Jan 2021 – Present
- Underwrite property, general liability and auto for small commercial accounts
- Evaluate submissions, assess risk and price within authority
- Manage a $12M renewal book; work with 40 independent agents
Underwriting Assistant, Lakeside Insurance Group, Jun 2019 – Dec 2020

Education
B.B.A. Risk Management and Insurance, Temple University, 2019

Certifications
CPCU (in progress)`;

R.writer = `Hannah Lee
Portfolio: hannahlee.com/writing

Experience
Content Writer, Ledgerline, Feb 2022 – Present
- Write SEO blog posts, guides and customer case studies for a B2B SaaS company
- Interview customers and product experts; publish in WordPress
- Use Ahrefs for keyword research; grew organic traffic 60%
Marketing Coordinator, Ledgerline, Jun 2020 – Jan 2022

Education
B.A. English, University of Oregon, 2020`;

const BANDS = [
  ['pharmacistRx', 'pharmacist', 75, 100, 'the job they do'],
  ['hrPro', 'hrGeneralist', 75, 100, 'the job they do'],
  ['csRep', 'customerServiceRep', 75, 100, 'the job they do'],
  ['mlt', 'labTechnician', 75, 100, 'the job they do'],
  ['netEng', 'networkEngineer', 75, 100, 'the job they do'],
  ['eventPro', 'eventPlanner', 75, 100, 'the job they do'],
  ['dataEng', 'dataEngineer', 75, 100, 'the job they do'],
  ['constructionPMPro', 'constructionPM', 75, 100, 'the job they do'],
  ['underwriter', 'insuranceUnderwriter', 75, 100, 'the job they do'],
  ['writer', 'contentWriter', 75, 100, 'the job they do'],
  // neighbours
  ['nurse', 'pharmacist', 0, 30, 'clinical, no PharmD or license'],
  ['mlt', 'pharmacist', 0, 30, 'clinical lab, no PharmD'],
  ['dataScientist', 'dataEngineer', 45, 75, 'Spark and Airflow, SQL and Python'],
  ['softwareEngineer', 'dataEngineer', 40, 70, 'engineering, Kafka and Python-adjacent'],
  ['softwareEngineer', 'networkEngineer', 10, 40, 'engineering, not networks'],
  ['projectManager', 'constructionPM', 15, 45, 'project management, not construction'],
  ['projectManager', 'eventPlanner', 15, 45, 'budgets and vendors, not events'],
  ['csRep', 'hrGeneralist', 0, 30, 'a different job'],
  ['accountExecutive', 'customerServiceRep', 25, 55, 'Salesforce and customers, overqualified'],
  ['productManager', 'contentWriter', 15, 45, 'writes, but not content'],
  ['fpaAnalyst', 'insuranceUnderwriter', 10, 40, 'financial analysis, not underwriting'],
  // the user's target profiles
  ['techStrategyConsultant', 'pharmacist', 0, 15, 'a different job'],
  ['techStrategyConsultant', 'networkEngineer', 5, 35, 'technology, hands-on networking'],
  ['techStrategyConsultant', 'eventPlanner', 5, 35, 'workshops and vendors, not events'],
  ['techStrategyConsultant', 'constructionPM', 0, 30, 'a different job'],
  ['techStrategyConsultant', 'hrGeneralist', 0, 30, 'a different job'],
  ['techStrategyConsultant', 'contentWriter', 0, 30, 'a different job'],
  ['quantResearcherPhD', 'dataEngineer', 25, 55, 'Python and data, not pipelines'],
  ['quantResearcherPhD', 'insuranceUnderwriter', 5, 35, 'risk, but underwriting'],
  ['quantResearcherPhD', 'customerServiceRep', 0, 25, 'a different job, far overqualified'],
];

const ORDER = [
  ['dataEngineer', 'dataEng', 'dataScientist', 'data engineering'],
  ['dataEngineer', 'dataScientist', 'techStrategyConsultant', 'data work'],
  ['networkEngineer', 'netEng', 'softwareEngineer', 'networking'],
  ['constructionPM', 'constructionPMPro', 'projectManager', 'construction'],
  ['pharmacist', 'pharmacistRx', 'nurse', 'PharmD and license'],
  ['hrGeneralist', 'hrPro', 'csRep', 'HR'],
  ['customerServiceRep', 'csRep', 'quantResearcherPhD', 'call center'],
  ['eventPlanner', 'eventPro', 'projectManager', 'events'],
  ['insuranceUnderwriter', 'underwriter', 'fpaAnalyst', 'underwriting'],
  ['contentWriter', 'writer', 'productManager', 'writing'],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER };
