// A second held-out batch, written after every rule change prompted by
// quantHoldout.js, and scored once before any further change. Its first pass
// is the honest estimate of how the score does on postings it hasn't seen.
// Formats again differ: an Indeed-style paste, a posting with the
// requirements first, a resume with a summary and no section dates.

const P = {};

P.quantAnalystInsurance = {
  title: 'Quantitative Analyst, Investment Risk',
  company: 'Granite Life Insurance',
  text: `Full job description
Granite Life manages a $60B general account portfolio.

Requirements:
* Master's degree in a quantitative discipline (statistics, mathematics, financial engineering)
* 3+ years in investment risk, portfolio analytics or quantitative finance
* Experience with fixed income analytics, interest rate risk and scenario analysis
* Python or R; SQL
* CFA or FRM a plus

Responsibilities:
* Model interest rate and credit risk for the general account
* Run stress tests and scenario analysis for ALM
* Build portfolio risk dashboards for the investment committee

Job Type: Full-time
Pay: $130,000.00 - $160,000.00 per year`,
};

P.quantResearchAssociate = {
  title: 'Quantitative Research Associate',
  company: 'Pemberton Asset Management',
  text: `Pemberton is a systematic macro manager.

The Quantitative Research Associate will support senior researchers in developing futures trading strategies.

You will:
- Clean and analyze futures and macroeconomic datasets
- Backtest trend, carry and value signals
- Help maintain the research codebase in Python

You have:
- A Bachelor's or Master's degree in a quantitative field
- 1-3 years of quantitative research or data science experience (internships count)
- Strong Python and statistics
- Interest in financial markets`,
};

P.cloudStrategyManager = {
  title: 'Manager, Cloud Strategy',
  company: 'Ridgeway Consulting Group',
  text: `What you'll do
Lead cloud strategy engagements for enterprise clients: assess application portfolios, build migration roadmaps and business cases, and design cloud operating models and FinOps practices.
Manage teams of 3-6 consultants and own client relationships day to day.

What you'll bring
6+ years of experience in technology consulting, including cloud strategy or migration work
Experience managing teams and client delivery
Knowledge of AWS, Azure or GCP
Bachelor's degree`,
};

P.digitalTransformationAnalyst = {
  title: 'Digital Transformation Analyst',
  company: 'Cobalt Health Partners',
  text: `About the role
Support the Digital Transformation Office in planning and tracking the health system's technology initiatives.

Responsibilities
- Track initiative milestones, risks and benefits for the transformation portfolio
- Prepare executive dashboards and PowerPoint updates
- Support business cases and vendor evaluations
- Document current-state processes

Qualifications
- 1-3 years of experience in consulting, project management or business analysis
- Excel, PowerPoint and Power BI
- Bachelor's degree`,
};

P.erpImplementationLead = {
  title: 'Oracle Cloud ERP Implementation Lead',
  company: 'Summit Systems Integrators',
  text: `About the job
Lead Oracle Cloud Financials implementations for mid-market clients.

Responsibilities
- Configure Oracle Cloud General Ledger, Payables and Receivables
- Lead design workshops and write configuration documents
- Manage testing, data conversion and cutover

Requirements
- 7+ years of hands-on Oracle ERP Financials configuration
- 3+ full-cycle Oracle Cloud implementations
- Oracle Cloud Financials certification preferred`,
};

P.riskReportingAnalyst = {
  title: 'Risk Reporting Analyst',
  company: 'Harbor Point Bank',
  text: `About the job
Produce the bank's monthly risk reports for senior management and the board.

Responsibilities
- Compile risk metrics from credit, market and operational risk teams
- Build and maintain Excel and Tableau reports
- Write commentary on risk trends

Requirements
- Bachelor's degree in finance, economics or business
- 2+ years in risk reporting, finance or audit
- Advanced Excel; Tableau a plus`,
};

const R = {};

R.insuranceRiskQuant = `Grace Liu
grace.liu@example.com | Hartford, CT

Summary
Investment risk quant with 5 years of fixed income and ALM risk modeling at an insurer.

Experience
Senior Investment Risk Analyst, Constitution Mutual (2021 to present)
- Model interest rate, spread and credit risk for a $40B fixed income portfolio in Python and SQL
- Run ALM stress tests and scenario analysis for the investment committee
- Built portfolio risk dashboards in Tableau
Investment Risk Analyst, Constitution Mutual (2019 to 2021)
- Fixed income analytics and duration/convexity reporting

Education
M.S. Statistics, University of Connecticut, 2019
CFA Level II candidate`;

R.dataScienceGrad = `Omar Haddad
omar.haddad@example.com

Education
M.S. Data Science, NYU, May 2025
B.S. Mathematics, Rutgers University, 2023

Experience
Data Science Intern, Brightline Capital, Jun 2024 – Aug 2024
- Backtested momentum signals on futures data in Python (pandas)
Data Analyst, Rutgers Athletics, Sep 2023 – May 2025
- Built Python and SQL reports on player performance

Skills
Python, pandas, statistics, machine learning, SQL`;

// [resume, posting, min, max, why]; resumes may come from the other fixtures.
const BANDS = [
  ['insuranceRiskQuant', 'quantAnalystInsurance', 80, 100, 'the role they do today'],
  ['riskQuantJunior', 'quantAnalystInsurance', 40, 70, 'fixed income risk, but 2.5 years and a bank'],
  ['fpaAnalyst', 'quantAnalystInsurance', 0, 35, 'finance, but not quantitative risk'],
  ['dataScienceGrad', 'quantResearchAssociate', 70, 100, 'exactly what the role asks for'],
  ['quantResearcherPhD', 'quantResearchAssociate', 40, 64, 'can do it all; overqualified for an associate role'],
  ['fpaAnalyst', 'quantResearchAssociate', 0, 30, 'not quantitative research'],
  ['bigFourTechConsultant', 'cloudStrategyManager', 50, 79, 'the work they do, a step up to managing teams'],
  ['techStrategyManager', 'cloudStrategyManager', 75, 100, 'the role they do today'],
  ['softwareEngineer', 'cloudStrategyManager', 0, 40, 'cloud skills, but not consulting or management'],
  ['juniorAnalyst', 'digitalTransformationAnalyst', 70, 100, 'what they do today'],
  ['businessAnalyst', 'digitalTransformationAnalyst', 60, 100, 'business analysis, portfolio reporting, vendor evaluation'],
  ['techStrategyConsultant', 'erpImplementationLead', 0, 40, 'hands-on Oracle configuration, which they have not done'],
  ['modelValidator', 'riskReportingAnalyst', 20, 55, 'risk, but reporting, not modeling; overqualified'],
  ['fpaAnalyst', 'riskReportingAnalyst', 40, 75, 'finance reporting in Excel carries over'],
];

const ORDER = [
  ['quantAnalystInsurance', 'insuranceRiskQuant', 'riskQuantJunior', 'more years in the same work'],
  ['quantResearchAssociate', 'dataScienceGrad', 'fpaAnalyst', 'quant training fits a research associate role'],
  ['cloudStrategyManager', 'techStrategyManager', 'bigFourTechConsultant', 'already a manager'],
  ['digitalTransformationAnalyst', 'juniorAnalyst', 'softwareEngineer', 'consulting analyst fits the analyst role'],
  ['erpImplementationLead', 'techStrategyConsultant', 'fpaAnalyst', 'ERP selection is closer than FP&A'],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER };
