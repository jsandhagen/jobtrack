// Quantitative analyst roles in depth: front-office research, derivatives
// pricing, quant development, model validation, credit and market risk, and
// an entry-level and a leadership role. Written the way real postings read
// (company pitch, duties, requirements, benefits). Near-miss postings that
// share the vocabulary (quantitative, analyst, risk, models, statistics) but
// are a different job are in quantNearMiss.js.
//
// The bands were set from how a quant recruiter would screen each pair, before
// the scorer was tuned on them.

const P = {};

P.quantResearcher = {
  title: 'Quantitative Researcher, Systematic Equities',
  company: 'Halverson Capital',
  text: `About the job
Halverson Capital is a global quantitative investment firm managing $28B across systematic equity, futures and options strategies. We combine scientific research with robust engineering.

The Role
Quantitative Researchers on our Systematic Equities team generate and test predictive signals, build portfolio construction and risk models, and take ideas from research into live trading. You will work with large, noisy datasets, including alternative data, and collaborate closely with engineers and portfolio managers.

What you'll do
- Research, develop and backtest alpha signals across global equity markets
- Build and improve factor models, transaction cost models and portfolio optimization
- Apply statistical and machine learning techniques to large, noisy financial time series
- Evaluate new alternative datasets for predictive value
- Write production-quality research code in Python and contribute to our C++ research libraries

What you'll bring
- PhD or Master's degree in mathematics, statistics, physics, computer science, or another quantitative field
- 2+ years of experience in quantitative research, ideally in systematic trading
- Strong foundation in probability, statistics and time series analysis
- Proficiency in Python (NumPy, pandas); experience with C++ is a plus
- Experience with machine learning methods and rigorous out-of-sample testing
- Intellectual curiosity and the ability to work in a collaborative research environment

Benefits
Competitive base salary and discretionary bonus, comprehensive medical, dental and vision insurance, 401(k) match. Halverson Capital is an equal opportunity employer.`,
};

P.derivativesQuant = {
  title: 'Quantitative Analyst, Rates Derivatives',
  company: 'Ashford Global Markets',
  text: `About the job
Ashford Global Markets is a leading investment bank. Our Quantitative Research group partners with trading desks to build the models used to price and risk-manage our derivatives business.

Position overview
We are seeking a Quantitative Analyst to join the Rates Quantitative Research team. You will develop and maintain pricing models for interest rate derivatives (swaps, swaptions, caps/floors and exotics), work directly with traders and structurers, and support model approval with Model Risk.

Responsibilities
- Develop, calibrate and implement pricing models for interest rate derivatives
- Implement numerical methods (Monte Carlo simulation, PDE/finite difference, lattice methods) in the C++ analytics library
- Build curve construction and calibration routines for volatility surfaces
- Compute and explain risk sensitivities (Greeks) and P&L attribution for the desk
- Prepare model documentation and support independent model validation

Qualifications
- Master's or PhD in mathematics, physics, financial engineering or a related quantitative field
- 2+ years of experience in derivatives pricing or quantitative finance
- Strong knowledge of stochastic calculus and derivatives pricing theory
- Strong programming skills in C++ and Python
- Knowledge of interest rate models (Hull-White, LMM, SABR)
- Excellent communication skills; able to explain models to traders

Preferred
- Experience with xVA or counterparty credit risk

Compensation
Salary range $150,000 - $200,000 plus discretionary bonus. Ashford is an equal opportunity employer.`,
};

P.quantDeveloper = {
  title: 'Quantitative Developer, C++',
  company: 'Kestrel Trading',
  text: `About Kestrel
Kestrel Trading is a proprietary trading firm. We trade across equities, futures and options on exchanges worldwide, with technology at the center of everything we do.

The role
As a Quantitative Developer, you will build the low-latency trading infrastructure and pricing libraries that our traders and researchers rely on. You will own performance-critical components end to end.

Responsibilities
- Design and develop low-latency trading systems and market data handlers in modern C++
- Implement options pricing and risk libraries used in live trading
- Profile and optimize code for latency and throughput
- Build tools for researchers to deploy strategies to production
- Work with traders and quantitative researchers to translate models into production code

Requirements
- 4+ years of professional C++ development experience (C++17/20)
- Strong understanding of data structures, algorithms, multithreading and memory management
- Experience on Linux, including performance profiling
- Bachelor's degree in computer science, mathematics, engineering or a related field
- Knowledge of financial markets and options pricing is a plus
- Python experience is a plus`,
};

P.modelValidation = {
  title: 'Senior Quantitative Analyst, Model Validation',
  company: 'Riverstone Bank',
  text: `About the job
Riverstone Bank is a $90B bank holding company. Model Risk Management provides effective challenge for the models used across credit, market risk, treasury and fraud.

Position Summary
The Senior Quantitative Analyst performs independent validation of models in line with SR 11-7, including conceptual soundness, outcome analysis and ongoing monitoring. You will review models built by first-line teams and present findings to model owners and the Model Risk Committee.

Responsibilities
- Independently validate credit risk (PD, LGD, EAD), CECL, CCAR stress testing and market risk models
- Assess conceptual soundness, data quality, assumptions and limitations of models
- Perform benchmarking, sensitivity analysis and back-testing; build challenger models
- Write clear validation reports and track remediation of findings
- Review vendor models and model performance monitoring plans

Qualifications
- Master's degree in statistics, mathematics, economics, finance or another quantitative field; PhD preferred
- 4+ years of experience in model development or model validation at a financial institution
- Strong knowledge of statistical modeling: regression, time series and machine learning techniques
- Proficiency in Python, R or SAS, and SQL
- Knowledge of SR 11-7 and regulatory expectations for model risk management
- Strong technical writing skills

Benefits
Medical, dental and vision insurance, 401(k) with match, and hybrid work. Riverstone Bank is an equal opportunity employer.`,
};

P.creditRiskModeler = {
  title: 'Credit Risk Modeling Analyst II',
  company: 'Copperline Financial',
  text: `About the job
Copperline Financial is a consumer lender offering personal loans and credit cards to more than 4 million customers.

What you'll do
- Develop application and behavioral scorecards and probability of default models for credit card and personal loan portfolios
- Build loss forecasting models for CECL reserves and stress testing
- Monitor model performance and present results to credit policy and model risk management
- Analyze loan-level data with SQL and Python to identify credit risk trends
- Document models to model risk management standards

What you'll need
- Master's degree in statistics, economics, mathematics or a related quantitative field
- 2+ years of experience in credit risk modeling
- Strong knowledge of logistic regression and econometric techniques
- Proficiency in Python or SAS, and SQL
- Experience with gradient boosting or other machine learning methods is a plus

Benefits
Competitive pay, bonus, 401(k), medical, dental and vision. Copperline is an equal opportunity employer.`,
};

P.marketRiskQuant = {
  title: 'Market Risk Quantitative Analyst',
  company: 'Ashford Global Markets',
  text: `About the job
Ashford Global Markets' Market Risk Analytics team builds the models that measure the firm's trading risk and regulatory capital.

Responsibilities
- Develop and maintain Value-at-Risk (VaR), Expected Shortfall and stressed VaR models
- Implement FRTB internal models approach and standardized approach calculations
- Analyze risk sensitivities (Greeks) and P&L explain for fixed income and equity derivatives desks
- Perform back-testing of risk models and investigate exceptions
- Write Python tools for risk aggregation and reporting

Qualifications
- Master's degree in financial engineering, mathematics, physics or a related quantitative field
- 3+ years of experience in market risk or quantitative finance
- Strong understanding of derivatives, fixed income and risk sensitivities
- Proficiency in Python and SQL
- Knowledge of FRTB and Basel market risk regulations
- FRM or CFA is a plus`,
};

P.entryQuantAnalyst = {
  title: 'Quantitative Analyst, Entry Level',
  company: 'Morrow Asset Management',
  text: `About the job
Morrow Asset Management manages multi-asset portfolios for pension funds and endowments.

The role
This entry-level role supports our portfolio managers with quantitative analysis. Recent graduates are encouraged to apply.

Responsibilities
- Maintain factor models and performance attribution reports
- Analyze portfolio risk and exposures using Python and Excel
- Run backtests of asset allocation strategies
- Prepare analysis for investment committee meetings

Requirements
- Bachelor's or Master's degree in finance, economics, mathematics, statistics or a related quantitative field
- 0-2 years of experience
- Proficiency in Python and Excel
- Coursework in statistics, econometrics or portfolio theory
- Strong attention to detail`,
};

P.headOfQuantResearch = {
  title: 'Director, Head of Quantitative Research',
  company: 'Morrow Asset Management',
  text: `About the job
Morrow Asset Management is looking for a Director to lead its Quantitative Research team of 12 researchers and developers.

Responsibilities
- Set the research agenda for systematic multi-asset strategies
- Lead, hire and develop a team of quantitative researchers and developers
- Own the firm's factor models, risk models and portfolio construction framework
- Present research and strategy performance to the investment committee and clients
- Partner with technology leadership on the research platform

Requirements
- PhD in a quantitative field
- 12+ years of experience in quantitative investment research, including 5+ years leading research teams
- Track record of developing systematic strategies that were deployed with real capital
- Deep expertise in factor models, portfolio optimization and risk modeling
- Proficiency in Python`,
};

// ---------- candidates ----------

const R = {};

R.quantResearcherPhD = `Elena Vasquez
elena.v@example.com · (555) 230-4411 · New York, NY

Experience
Quantitative Researcher, Brightwater Asset Management, Aug 2021 – Present
- Research, develop and backtest equity alpha signals from price, fundamental and alternative data; 3 signals in live trading
- Built a statistical risk model and transaction cost model used in daily portfolio optimization for a $2B book
- Applied gradient boosting and regularized regression to noisy financial time series with walk-forward out-of-sample testing
- Wrote research code in Python (NumPy, pandas) and optimized core routines in C++

Graduate Research Assistant, Columbia University, Sep 2016 – Jul 2021
- Developed Monte Carlo simulations and Bayesian inference methods for condensed matter physics experiments
- Published 4 papers; taught probability and statistics recitations

Education
PhD Physics, Columbia University, 2021
B.S. Physics and Mathematics, University of Chicago, 2016

Skills
Python, C++, NumPy, pandas, statistics, probability, time series, machine learning, portfolio optimization, factor models, backtesting`;

R.mfeNewGrad = `Kevin Zhou
kevin.zhou@example.com · (555) 712-0099 · New York, NY

Education
Master of Financial Engineering, Baruch College, Dec 2025
Coursework: Stochastic Calculus, Numerical Methods for Finance, Monte Carlo Simulation, Fixed Income, Time Series Analysis, Machine Learning
B.S. Mathematics, University of Illinois Urbana-Champaign, 2024

Experience
Quantitative Analyst Intern, Ashcroft Bank, Jun 2025 – Aug 2025
- Implemented a Heston model calibration and Monte Carlo pricer for equity options in Python
- Computed Greeks and validated prices against the desk's C++ library
Research Assistant, UIUC Department of Mathematics, Jan 2023 – May 2024
- Built numerical PDE solvers for option pricing in Python

Projects
- Statistical arbitrage backtest on S&P 500 pairs with cointegration tests (Python, pandas)

Skills
Python, C++, stochastic calculus, Monte Carlo, PDE, derivatives pricing, statistics, SQL, Excel`;

R.creditRiskModeler = `Priya Shah
priya@example.com · (555) 444-1212 · Arlington, VA

Experience
Credit Risk Analyst, Allegiant Mortgage, Jul 2021 – Present
- Built probability of default scorecards for a $9B mortgage portfolio using logistic regression in Python and SQL
- Ran quarterly performance monitoring of credit models and answered model validation findings
- Analyzed loan-level data to flag underwriting and borrower credit risk trends for credit policy
- Developed loss forecasting models used in CECL reserve estimates

Education
M.A. Economics, George Mason University, 2021
Coursework: Econometrics, Time Series, Statistical Learning

Skills
Python, SQL, SAS, Econometrics, Credit Risk Modeling`;

R.modelValidator = `Marcus Bell
marcus.bell@example.com · (555) 318-7720 · Charlotte, NC

Experience
Model Risk Manager, Granite National Bank, Mar 2021 – Present
- Lead independent validations of CCAR stress testing, CECL and PD/LGD credit risk models under SR 11-7
- Built challenger models in Python and R; performed benchmarking, sensitivity analysis and back-testing
- Wrote validation reports and presented findings to the Model Risk Committee
Senior Quantitative Analyst, Model Validation, Granite National Bank, Jun 2018 – Feb 2021
- Validated market risk VaR models and vendor models; reviewed ongoing monitoring plans
Risk Analyst, Carolina Federal Credit Union, Jul 2016 – May 2018
- Built loss forecasting models in SAS and SQL

Education
M.S. Statistics, NC State University, 2016

Skills
Model validation, SR 11-7, regression, time series, machine learning, Python, R, SAS, SQL, technical writing`;

R.quantDev = `Arjun Mehta
arjun@example.com · (555) 905-3321 · Chicago, IL

Experience
Senior Software Engineer, Trading Systems, Lakeshore Securities, May 2020 – Present
- Built low-latency order routing and market data handlers in C++17 on Linux, cutting tick-to-trade latency 40%
- Implemented an options pricing library (Black-Scholes, binomial trees) used by the volatility desk
- Profiled and optimized multithreaded code with perf and lock-free queues
Software Engineer, Pinewood Systems, Jul 2016 – Apr 2020
- Developed C++ and Python services for exchange connectivity

Education
B.S. Computer Engineering, University of Michigan, 2016

Skills
C++, Python, Linux, multithreading, low latency, data structures, algorithms, options pricing`;

R.dataScientist = `Hannah Cole
hannah@example.com · (555) 660-1188 · Seattle, WA

Experience
Senior Data Scientist, Northpeak Commerce, Jan 2021 – Present
- Built demand forecasting and pricing models with gradient boosting in Python
- Designed and analyzed A/B tests for checkout and recommendations
- Deployed machine learning models with the data engineering team using Spark and Airflow
Data Analyst, Northpeak Commerce, Jun 2018 – Dec 2020
- Built SQL pipelines and Tableau dashboards for marketing

Education
M.S. Statistics, University of Washington, 2018

Skills
Python, SQL, machine learning, statistics, A/B testing, Spark, Tableau, time series forecasting`;

R.fpaAnalyst = `Lauren Price
lauren@example.com · (555) 420-7766 · Dallas, TX

Experience
Senior Financial Analyst, FP&A, Bluebonnet Healthcare, Apr 2021 – Present
- Own the annual budget and monthly forecast for a $400M operating unit
- Built Excel driver-based forecasting models and variance analysis for leadership
- Prepared board presentations on P&L performance
Financial Analyst, Lone Star Logistics, Jun 2018 – Mar 2021
- Month-end close support, variance reporting and capital expenditure tracking

Education
B.B.A. Finance, Texas A&M University, 2018

Skills
Financial modeling, budgeting, forecasting, Excel, PowerPoint, Hyperion, SQL`;

// Bands: [resume, posting, min, max, why]; resumes may come from techPostings too.
const BANDS = [
  ['quantResearcherPhD', 'quantResearcher', 80, 100, 'the role they do today'],
  ['quantResearcherPhD', 'derivativesQuant', 30, 60, 'strong quant, but no derivatives pricing or rates models'],
  ['quantResearcherPhD', 'entryQuantAnalyst', 40, 64, 'can do it all, but overqualified for an entry role'],
  ['quantResearcherPhD', 'headOfQuantResearch', 20, 50, 'right field, years too junior to lead'],
  ['mfeNewGrad', 'derivativesQuant', 40, 70, 'the right training and an internship, but short of 2 years'],
  ['mfeNewGrad', 'entryQuantAnalyst', 70, 100, 'an entry quant role fresh out of an MFE'],
  ['mfeNewGrad', 'quantResearcher', 35, 65, 'right skills, short on research experience'],
  ['mfeNewGrad', 'headOfQuantResearch', 0, 30, 'far too junior'],
  ['creditRiskModeler', 'creditRiskModeler', 80, 100, 'the role they do today'],
  ['creditRiskModeler', 'modelValidation', 45, 75, 'model development counts; short of 4 years and SR 11-7 depth'],
  ['creditRiskModeler', 'derivativesQuant', 0, 40, 'a different kind of quant'],
  ['creditRiskModeler', 'quantDeveloper', 0, 30, 'a C++ engineering job'],
  ['modelValidator', 'modelValidation', 80, 100, 'the role they do today'],
  ['modelValidator', 'creditRiskModeler', 60, 90, 'they validate these models; a level down'],
  ['modelValidator', 'marketRiskQuant', 35, 70, 'validated VaR models, but not market risk work day to day'],
  ['quantDev', 'quantDeveloper', 80, 100, 'the role they do today'],
  ['quantDev', 'quantResearcher', 20, 50, 'engineering, not research'],
  ['quantDev', 'derivativesQuant', 30, 60, 'pricing libraries in C++, without stochastic calculus'],
  ['dataScientist', 'quantResearcher', 35, 65, 'ML on time series carries over; no markets or research degree'],
  ['dataScientist', 'creditRiskModeler', 35, 65, 'modeling carries over; no credit risk'],
  ['dataScientist', 'derivativesQuant', 0, 35, 'no pricing, stochastic calculus or C++'],
  ['fpaAnalyst', 'quantResearcher', 0, 25, 'finance, but not quantitative research'],
  ['fpaAnalyst', 'derivativesQuant', 0, 25, 'finance, but not quantitative'],
  ['fpaAnalyst', 'creditRiskModeler', 0, 35, 'forecasting in Excel is not credit modeling'],
  ['techStrategyConsultant', 'quantResearcher', 0, 25, 'a different job'],
  ['techStrategyConsultant', 'modelValidation', 0, 30, 'a different job'],
  ['softwareEngineer', 'quantDeveloper', 25, 55, 'a strong engineer, but Java, not C++'],
  ['softwareEngineer', 'quantResearcher', 0, 30, 'engineering, not research'],
];

// [posting, better, worse, why]
const ORDER = [
  ['quantResearcher', 'quantResearcherPhD', 'dataScientist', 'markets research beats retail ML'],
  ['quantResearcher', 'dataScientist', 'fpaAnalyst', 'ML and statistics beat spreadsheets'],
  ['quantResearcher', 'quantResearcherPhD', 'quantDev', 'a researcher fits research'],
  ['quantResearcher', 'mfeNewGrad', 'fpaAnalyst', 'quant training beats FP&A'],
  ['derivativesQuant', 'mfeNewGrad', 'creditRiskModeler', 'derivatives training fits a pricing role'],
  ['derivativesQuant', 'mfeNewGrad', 'dataScientist', 'derivatives training fits a pricing role'],
  ['derivativesQuant', 'quantDev', 'fpaAnalyst', 'C++ pricing libraries are closer than FP&A'],
  ['quantDeveloper', 'quantDev', 'softwareEngineer', 'C++ low latency beats Java services'],
  // Not judged: softwareEngineer vs quantResearcherPhD here. The posting asks for 4+ years of C++;
  // the engineer writes Java, the researcher writes some C++. Neither order is clearly right.
  ['modelValidation', 'modelValidator', 'creditRiskModeler', 'the validator fits validation best'],
  ['modelValidation', 'creditRiskModeler', 'dataScientist', 'bank models beat retail ML'],
  ['creditRiskModeler', 'creditRiskModeler', 'dataScientist', 'credit risk experience'],
  ['creditRiskModeler', 'creditRiskModeler', 'fpaAnalyst', 'credit risk experience'],
  ['marketRiskQuant', 'modelValidator', 'fpaAnalyst', 'risk models beat FP&A'],
  ['entryQuantAnalyst', 'mfeNewGrad', 'quantResearcherPhD', 'the entry role fits the new grad better'],
  ['headOfQuantResearch', 'quantResearcherPhD', 'mfeNewGrad', 'more experience fits a leadership role'],
];

module.exports = { POSTINGS: P, RESUMES: R, BANDS, ORDER };
