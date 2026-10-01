// Held-out postings and resumes, written after the scorer was tuned on
// quantPostings.js, quantNearMiss.js and the technology strategy fixtures, in
// formats those don't use (a LinkedIn paste with its page furniture, "•"
// bullets, dates on their own line, a terse posting). Bands were set before
// scoring. Quant and technology strategy roles, plus near-misses.

const P = {};

P.fxOptionsStrat = {
  title: 'Vice President, Quantitative Strategist - FX Options',
  company: 'Calder Securities',
  text: `About the job
Calder Securities' Strats group builds pricing, risk and trading analytics for our Global Markets businesses.

What you will do
• Develop and maintain pricing models for FX vanilla and exotic options (barriers, TARFs) using stochastic and local volatility models
• Calibrate volatility surfaces and manage model risk with the Model Validation group
• Build risk and P&L explain tooling for the FX options desk
• Lead and mentor a team of three junior strats

What we look for
• PhD in mathematics, physics, financial engineering or a related quantitative discipline
• 7+ years of experience as a front-office quant or strat, including FX or equity derivatives
• Expert knowledge of stochastic calculus, Monte Carlo and PDE methods
• Strong C++ and Python
• Experience with xVA is a plus`,
};

P.marketRiskAnalyst = {
  title: 'Risk Quant Analyst – Market Risk',
  company: 'Harbor Point Bank',
  text: `Job description

The Market Risk team measures and reports trading risk for the bank's rates, credit and equity desks.

Key responsibilities:
- Run daily Value-at-Risk and stress tests and explain moves to risk managers
- Back-test VaR models and investigate exceptions
- Build Python tools to automate risk reporting
- Support the annual review of market risk models with Model Validation

Qualifications:
- Master's in financial mathematics, statistics, economics or a related field
- 2+ years in market risk, risk analytics or quantitative finance
- Solid understanding of fixed income and derivatives
- Python and SQL
- FRM (or progress toward it) a plus`,
};

P.creditQuantResearcher = {
  title: 'Quantitative Researcher - Credit',
  company: 'Westlake Partners',
  text: `About the job
Westlake Partners is a systematic credit fund trading corporate bonds and CDS.

Role
We are hiring a Quantitative Researcher to develop systematic strategies in global credit markets.

Responsibilities
- Research and backtest alpha signals for corporate bonds and CDS
- Build factor and risk models for credit portfolios
- Work with large, messy pricing and fundamentals datasets
- Partner with portfolio managers to put research into production

Requirements
- Master's or PhD in a quantitative field
- 3+ years of experience in quantitative research or systematic trading
- Strong statistics, time series and machine learning
- Python (pandas, NumPy)
- Knowledge of fixed income or credit markets is a plus`,
};

P.techStrategySeniorAssociate = {
  title: 'Senior Associate, Technology Strategy',
  company: 'Pryor & Lane Advisory',
  location: 'Chicago, IL (Hybrid)',
  text: `About the job
Pryor & Lane Advisory is a professional services firm serving Fortune 500 clients.

Our Technology Strategy & Transformation practice helps CIOs set direction, modernize their technology estate and get value from their investments.

As a Senior Associate you will:
Lead workstreams on IT strategy, operating model and cloud transformation engagements
Assess current-state technology landscapes, costs and capabilities
Develop target-state architectures, roadmaps and business cases
Facilitate client workshops and prepare executive-ready deliverables
Coach associates and contribute to proposals

You bring:
3-6 years of experience in technology consulting, IT strategy or a related field
Experience with cloud strategy, application rationalization or ERP selection
Strong Excel and PowerPoint skills
Bachelor's degree required; MBA a plus
Ability to travel up to 30%

Show more
Show less`,
};

P.itStrategySeniorManager = {
  title: 'Senior Manager, IT Strategy & Transformation',
  company: 'Lakeview Insurance',
  text: `About the role
Lakeview Insurance is modernizing its core systems. Reporting to the CIO, you will lead IT strategy, planning and the transformation office.

Responsibilities
- Own the multi-year technology roadmap and annual IT planning cycle
- Run the transformation office: governance, benefits tracking and executive reporting
- Lead a team of 5 strategy and portfolio managers
- Build business cases for major investments (core policy system, cloud, data platform)
- Manage strategic vendor relationships

Requirements
- 10+ years of experience in IT strategy, management consulting or IT leadership
- 3+ years managing teams
- Experience leading large transformation programs
- Excellent executive communication
- Bachelor's degree; MBA preferred`,
};

P.marketingDataScientist = {
  title: 'Data Scientist, Marketing Analytics',
  company: 'Juniper Home',
  text: `About the job
Juniper Home is an online furniture retailer.

What you'll do
- Build marketing mix models and multi-touch attribution
- Design and analyze experiments for campaigns and promotions
- Forecast demand and customer lifetime value
- Share insights with marketing leaders

What you'll need
- 3+ years as a data scientist or in marketing analytics
- Python and SQL
- Statistics, experimentation and causal inference
- Experience with marketing data is a plus`,
};

P.treasuryOpsAnalyst = {
  title: 'Business Analyst, Treasury Operations',
  company: 'Harbor Point Bank',
  text: `Job summary
Support the Treasury Operations team with process improvement and reporting.

Duties
- Document treasury payment and settlement processes
- Gather requirements for system enhancements and support UAT
- Build Excel reports on cash positions and exceptions
- Coordinate with operations, technology and finance

Requirements
- Bachelor's degree in business or finance
- 2+ years as a business analyst or in banking operations
- Advanced Excel
- Strong organizational skills`,
};

// ---------- candidates (formats the tuned fixtures don't use) ----------

const R = {};

R.quantStratVP = `DANIEL OKONKWO
New York, NY | daniel.okonkwo@example.com

PROFESSIONAL EXPERIENCE

Northbridge Bank — Vice President, FX Options Strats
2019 – Present
• Own pricing models for FX vanilla and exotic options (barriers, TARFs) using local-stochastic volatility
• Calibrate FX volatility surfaces daily; partnered with Model Validation on 6 model approvals
• Built risk and P&L explain tools used by the FX options desk; implemented Monte Carlo and PDE engines in C++
• Manage 2 junior strats

Northbridge Bank — Associate, Equity Derivatives Quantitative Research
2016 – 2019
• Implemented Heston and local volatility models for equity exotics in C++ and Python
• Built xVA sensitivities for the counterparty risk desk

EDUCATION
PhD, Applied Mathematics — New York University, 2016
B.S., Physics — University of Lagos, 2010

SKILLS
C++, Python, stochastic calculus, Monte Carlo, PDE, volatility modeling, xVA`;

R.riskQuantJunior = `Sofia Marin
sofia.marin@example.com

Experience
Market Risk Analyst
Harborview Bank | Aug 2023 – Present
- Produce daily VaR and stressed VaR reports for the rates and credit desks
- Back-tested historical simulation VaR and investigated exceptions
- Automated risk reports with Python and SQL, saving 10 hours a week
- Explained P&L and risk moves in fixed income and interest rate swaps to risk managers

Education
M.S. Financial Mathematics, University of Chicago, 2023
B.S. Economics, University of Illinois, 2022

Certifications
FRM Part I

Skills
Python, SQL, VaR, stress testing, fixed income, derivatives, Excel`;

R.bigFourTechConsultant = `Nina Patel
nina.patel@example.com · Chicago, IL

Experience
Senior Associate, Technology Consulting — Harlow & Finch LLP
Jul 2022 – Present
• Led the current-state assessment and 3-year IT roadmap for a regional bank's CIO
• Built the business case and TCO model for a cloud migration of 220 applications
• Ran application rationalization for a manufacturer, retiring 60 applications
• Supported ERP vendor selection (Oracle Cloud vs SAP) and facilitated executive workshops
• Prepared steering committee decks in PowerPoint

Associate, Technology Consulting — Harlow & Finch LLP
Jul 2020 – Jun 2022
• Supported IT operating model and PMO work for a health insurer
• Built Excel models of IT spend

Education
B.S. Management Information Systems, University of Illinois, 2020

Skills
IT strategy, cloud strategy, application rationalization, roadmaps, business cases, Excel, PowerPoint`;

// [resume, posting, min, max, why]; resumes may come from the other fixtures.
const BANDS = [
  ['quantStratVP', 'fxOptionsStrat', 80, 100, 'the role they do today'],
  ['quantResearcherPhD', 'fxOptionsStrat', 15, 50, 'a quant, but no derivatives pricing, and not yet VP level'],
  ['mfeNewGrad', 'fxOptionsStrat', 0, 40, 'far too junior'],
  ['riskQuantJunior', 'marketRiskAnalyst', 75, 100, 'the role they do today'],
  ['modelValidator', 'marketRiskAnalyst', 35, 70, 'validated VaR models; not market risk day to day'],
  ['mfeNewGrad', 'marketRiskAnalyst', 40, 70, 'the right training, short on experience'],
  ['quantResearcherPhD', 'creditQuantResearcher', 65, 95, 'the same job in another asset class'],
  ['creditRiskModeler', 'creditQuantResearcher', 25, 60, 'credit, but consumer lending models, not markets research'],
  ['bigFourTechConsultant', 'techStrategySeniorAssociate', 75, 100, 'the role they do today'],
  ['techStrategyConsultant', 'techStrategySeniorAssociate', 75, 100, 'the role they do today'],
  ['juniorAnalyst', 'techStrategySeniorAssociate', 30, 70, 'right field, a level below'],
  ['softwareEngineer', 'techStrategySeniorAssociate', 0, 35, 'a different job'],
  ['techStrategyManager', 'itStrategySeniorManager', 65, 100, 'consulting manager to in-house senior manager'],
  ['techStrategyConsultant', 'itStrategySeniorManager', 25, 60, 'right work, short of 10 years and a team'],
  ['dataScientist', 'marketingDataScientist', 75, 100, 'the role they do today'],
  ['quantResearcherPhD', 'marketingDataScientist', 30, 65, 'statistics and ML carry over; no marketing'],
  ['modelValidator', 'treasuryOpsAnalyst', 0, 44, 'operations analysis, not models'],
  ['quantResearcherPhD', 'treasuryOpsAnalyst', 0, 35, 'operations analysis, not research'],
];

// [posting, better, worse, why]
const ORDER = [
  ['fxOptionsStrat', 'quantStratVP', 'quantResearcherPhD', 'the FX strat fits the FX strat role'],
  ['fxOptionsStrat', 'mfeNewGrad', 'fpaAnalyst', 'derivatives training beats FP&A'],
  ['marketRiskAnalyst', 'riskQuantJunior', 'dataScientist', 'market risk experience'],
  ['creditQuantResearcher', 'quantResearcherPhD', 'creditRiskModeler', 'markets research beats consumer credit models'],
  ['techStrategySeniorAssociate', 'bigFourTechConsultant', 'managementConsultant', 'technology consulting beats general strategy'],
  ['techStrategySeniorAssociate', 'managementConsultant', 'softwareEngineer', 'consulting beats engineering'],
  ['itStrategySeniorManager', 'techStrategyManager', 'techStrategyConsultant', 'more senior fits the senior manager role'],
  ['marketingDataScientist', 'dataScientist', 'quantResearcherPhD', 'retail data science fits marketing analytics'],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER };
