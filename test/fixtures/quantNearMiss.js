// Near-miss postings for quantitative analysts: jobs that share the vocabulary
// (quantitative, analyst, risk, models, statistics, finance, Python) but are a
// different job. Written to check the fit score doesn't match on words alone.

const P = {};

P.quantUXResearcher = {
  title: 'Quantitative UX Researcher',
  company: 'Lumen Apps',
  text: `About the job
Lumen Apps builds productivity software used by 30 million people.

What you'll do
- Design and analyze large-scale surveys and log-based studies of how people use our products
- Partner with designers, product managers and qualitative UX researchers to shape the product roadmap
- Build metrics for user satisfaction and task success
- Present research findings to product leadership

Requirements
- 3+ years of experience in UX research, survey research or product analytics
- Strong skills in survey design and statistics
- Proficiency in R or Python, and SQL
- Experience working with designers and product teams
- Portfolio of user research studies`,
};

P.fpaFinancialAnalyst = {
  title: 'Senior Financial Analyst, FP&A',
  company: 'Westhaven Health',
  text: `About the job
Westhaven Health is a regional hospital system.

Responsibilities
- Lead the annual budget and monthly forecasting process for clinical departments
- Build driver-based financial models and variance analysis in Excel
- Prepare monthly P&L reviews and board presentations
- Support month-end close and capital planning

Requirements
- Bachelor's degree in finance or accounting
- 3+ years of experience in FP&A or corporate finance
- Advanced Excel and financial modeling skills
- Experience with Hyperion or Adaptive Planning
- Strong communication skills`,
};

P.qaAnalyst = {
  title: 'Quality Assurance Analyst',
  company: 'Tidewater Software',
  text: `About the job
Tidewater builds claims software for insurers.

Responsibilities
- Write and execute manual and automated test cases for web applications
- Log defects in Jira and verify fixes
- Build test automation with Selenium and Python
- Take part in sprint planning and regression testing

Requirements
- 2+ years of experience in software quality assurance
- Experience with Selenium or Cypress
- Familiarity with Jira and agile teams
- Basic SQL`,
};

P.actuarialAnalyst = {
  title: 'Actuarial Analyst, Pricing',
  company: 'Northfield Mutual',
  text: `About the job
Northfield Mutual is a property and casualty insurer.

Responsibilities
- Develop rate indications and pricing models for personal auto and homeowners
- Analyze loss trends and reserve adequacy
- Build generalized linear models (GLMs) for rating plans
- Prepare rate filings for state regulators

Requirements
- Bachelor's degree in actuarial science, mathematics or statistics
- Passed at least 3 SOA or CAS actuarial exams
- 2+ years of actuarial experience in property and casualty insurance
- Proficiency in Excel and SQL; R or Python a plus`,
};

P.investmentBankingAnalyst = {
  title: 'Investment Banking Analyst, M&A',
  company: 'Calloway Partners',
  text: `About the job
Calloway Partners is a middle-market investment bank advising on mergers, acquisitions and capital raises.

Responsibilities
- Build three-statement financial models, DCF, LBO and comparable company analyses
- Prepare pitch books, confidential information memoranda and management presentations
- Conduct industry research and due diligence
- Support deal execution from first meeting to close

Requirements
- Bachelor's degree in finance, economics or accounting
- 1-2 years of investment banking or transaction advisory experience
- Advanced Excel and PowerPoint skills
- Strong accounting knowledge
- Willingness to work long hours in a fast-paced environment`,
};

P.opRiskAnalyst = {
  title: 'Risk Analyst, Operational Risk',
  company: 'Riverstone Bank',
  text: `About the job
The Operational Risk team oversees the bank's risk and control framework.

Responsibilities
- Facilitate risk and control self-assessments (RCSA) with business lines
- Review operational loss events and key risk indicators
- Test controls and track issues and remediation
- Prepare operational risk reporting for the risk committee

Requirements
- Bachelor's degree in business, finance or a related field
- 3+ years of experience in operational risk, internal audit or compliance
- Knowledge of risk and control frameworks (COSO)
- Experience with GRC tools such as Archer
- Strong written communication skills`,
};

P.quantTrader = {
  title: 'Quantitative Trader',
  company: 'Kestrel Trading',
  text: `About the job
Kestrel Trading is a proprietary trading firm.

Responsibilities
- Trade options and futures on our systematic market making desk
- Monitor and adjust automated trading strategies in real time
- Research trading signals and improve pricing and hedging
- Manage risk and P&L of the book

Requirements
- Bachelor's or Master's degree in mathematics, statistics, physics, computer science or a related quantitative field
- 2+ years of trading experience at a proprietary trading firm or bank
- Strong probability, statistics and mental math
- Python programming
- Knowledge of options pricing and volatility`,
};

P.salesAndTrading = {
  title: 'Fixed Income Sales Associate',
  company: 'Ashford Global Markets',
  text: `About the job
Our Fixed Income Sales team covers institutional investors.

Responsibilities
- Cover asset managers and hedge funds, pitching trade ideas across rates and credit
- Build and grow client relationships and generate revenue for the desk
- Work with traders and strategists to deliver market color

Requirements
- 3+ years of institutional sales experience in fixed income
- FINRA Series 7 and 63 licenses
- Strong relationships with buy-side clients
- Knowledge of fixed income markets`,
};

// [resume, posting, min, max, why]; resumes come from quantPostings.js and techPostings.js.
const BANDS = [
  ['quantResearcherPhD', 'quantUXResearcher', 0, 44, 'statistics carry over, but no UX or survey research'],
  ['quantResearcherPhD', 'fpaFinancialAnalyst', 0, 30, 'corporate finance, not quantitative research'],
  ['quantResearcherPhD', 'qaAnalyst', 0, 25, 'software testing'],
  ['quantResearcherPhD', 'actuarialAnalyst', 0, 44, 'needs actuarial exams and insurance pricing'],
  ['quantResearcherPhD', 'investmentBankingAnalyst', 0, 30, 'M&A modeling and pitch books'],
  ['quantResearcherPhD', 'quantTrader', 30, 65, 'adjacent: research, not trading'],
  ['quantResearcherPhD', 'salesAndTrading', 0, 25, 'a sales job'],
  ['modelValidator', 'opRiskAnalyst', 0, 44, 'risk, but controls and audit, not models'],
  ['creditRiskModeler', 'opRiskAnalyst', 0, 44, 'risk, but controls and audit, not models'],
  ['creditRiskModeler', 'actuarialAnalyst', 15, 50, 'modeling carries over; no exams or insurance'],
  ['mfeNewGrad', 'investmentBankingAnalyst', 0, 35, 'finance, but M&A, not quant'],
  ['mfeNewGrad', 'salesAndTrading', 0, 25, 'a sales job'],
  ['dataScientist', 'quantUXResearcher', 35, 70, 'statistics, A/B tests and product analytics carry over'],
  ['fpaAnalyst', 'fpaFinancialAnalyst', 75, 100, 'the role they do today'],
  ['fpaAnalyst', 'investmentBankingAnalyst', 25, 60, 'financial modeling, but not transactions'],
];

// [posting, better, worse, why]
const ORDER = [
  ['quantUXResearcher', 'dataScientist', 'quantResearcherPhD', 'product analytics fits UX research better than markets research'],
  ['fpaFinancialAnalyst', 'fpaAnalyst', 'quantResearcherPhD', 'FP&A fits FP&A'],
  ['quantTrader', 'quantResearcherPhD', 'fpaAnalyst', 'quant research is closer to trading'],
  ['opRiskAnalyst', 'modelValidator', 'quantResearcherPhD', 'bank risk is closer to op risk'],
];

module.exports = { POSTINGS: P, BANDS, ORDER };
