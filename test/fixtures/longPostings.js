// Full-length postings written the way real ones are (company pitch, duties,
// requirements, benefits), at different distances from a quantitative credit
// risk background. Short benchmark postings have too few distinctive words to
// test the domain signal, so it is calibrated on these.

const CREDIT_RISK = {
  title: 'Credit Risk Modeling Analyst',
  company: 'Summit Bank',
  text: `About the job
Summit Bank is a regional bank serving families and businesses across the Mid-Atlantic for over 80 years. We believe in doing the right thing for our customers and our communities.

Position Summary
Summit Bank is seeking a Credit Risk Modeling Analyst to develop, validate and monitor the statistical models that drive our consumer and mortgage lending decisions. You will build probability of default and loss forecasting models, support CECL and stress testing, and work closely with credit policy and model risk management.

Responsibilities
- Develop and maintain credit risk scorecards and probability of default (PD) models for mortgage and consumer loan portfolios
- Build loss forecasting models used in CECL reserves and CCAR-style stress testing
- Perform ongoing performance monitoring of credit models and present results to the model risk committee
- Respond to findings from model validation, internal audit and regulators
- Analyze large loan-level datasets to identify credit risk trends in underwriting and borrower behavior
- Partner with credit policy to translate model results into underwriting rules and risk mitigation strategies
- Document models in line with model risk management standards (SR 11-7)

Qualifications
- Master's degree in statistics, economics, finance or a related quantitative field
- 3+ years of experience in credit risk modeling or analytics, ideally in mortgage or consumer lending
- Strong knowledge of regression, logistic regression and econometric techniques
- Proficiency in Python or SAS, and SQL
- Experience with machine learning methods is a plus
- Excellent written and verbal communication skills

Benefits
Competitive salary, annual bonus, 401(k) with company match, medical, dental and vision insurance, tuition reimbursement and paid volunteer time. Summit Bank is an equal opportunity employer.`,
};

const DATA_SCIENTIST = {
  title: 'Data Scientist',
  company: 'Trailhead Retail',
  text: `About the job
Trailhead Retail is an outdoor gear retailer with 140 stores and a fast-growing online business. Our mission is to get more people outside.

The Role
We're hiring a Data Scientist to help us understand customers and optimize pricing, promotions and inventory. You'll own models end to end, from exploration to production, and work with merchandising, marketing and supply chain teams.

What you'll do
- Build demand forecasting models to plan inventory across stores and distribution centers
- Design and analyze A/B tests for pricing and promotions on our website
- Develop customer segmentation and lifetime value models to guide marketing spend
- Deploy machine learning models with our data engineering team
- Communicate insights to merchants and executives through clear visualizations

What you'll bring
- 3+ years of experience in data science or applied statistics
- Strong Python skills (pandas, scikit-learn) and SQL
- Experience with forecasting, experimentation and causal inference
- Experience deploying models to production
- Bachelor's degree in a quantitative field; Master's preferred
- Retail or e-commerce experience is a plus

Perks
Generous gear discount, hybrid schedule, health benefits, 401(k) match and paid time off to get outside.`,
};

const BACKEND = {
  title: 'Backend Software Engineer',
  company: 'Nimbus Cloud',
  text: `About the job
Nimbus Cloud builds the infrastructure that powers thousands of SaaS companies. We're a remote-first team that values ownership and craftsmanship.

What you'll do
- Design, build and operate distributed services in Go and Java that handle millions of requests per second
- Own services end to end: design reviews, implementation, testing, deployment and on-call
- Improve the reliability, latency and cost of our storage and networking layers
- Build internal APIs and tooling used by other engineering teams
- Mentor engineers and contribute to architecture decisions

What we're looking for
- 4+ years of professional software engineering experience
- Strong experience with Go, Java or Rust
- Experience with distributed systems, microservices and message queues such as Kafka
- Hands-on experience with Kubernetes, Docker and AWS or GCP
- Familiarity with observability tools (Prometheus, Grafana, OpenTelemetry)
- Computer science degree or equivalent experience

Benefits
Remote-first, equity, top-tier health insurance, home office stipend and a learning budget.`,
};

const ICU_NURSE = {
  title: 'Registered Nurse - ICU',
  company: 'Riverside Medical Center',
  text: `About the job
Riverside Medical Center is a 400-bed Level II trauma center committed to compassionate, patient-centered care.

Position Summary
We are seeking an experienced Registered Nurse for our 24-bed medical-surgical ICU. The ICU nurse provides direct care to critically ill adult patients, collaborates with physicians and the interdisciplinary team, and supports patients and families through complex illness.

Responsibilities
- Assess, plan, implement and evaluate nursing care for critically ill patients
- Manage ventilated patients, vasoactive drips and continuous renal replacement therapy (CRRT)
- Monitor hemodynamics and respond to changes in patient condition
- Document care accurately in the Epic electronic health record
- Educate patients and families and coordinate discharge planning
- Participate in unit quality improvement and shared governance

Requirements
- Current RN license in the state
- BLS and ACLS certification required
- 2+ years of ICU or critical care experience
- CCRN certification preferred
- BSN preferred

Schedule and Benefits
Three 12-hour shifts, rotating weekends. Shift differentials, tuition assistance, retirement plan and comprehensive health benefits.`,
};

const MARKETING = {
  title: 'Marketing Manager',
  company: 'Lumen Beauty',
  text: `About the job
Lumen Beauty is a clean skincare brand sold in 2,000 stores and online. We are growing fast and looking for creative, data-minded marketers.

The Role
The Marketing Manager will plan and run integrated campaigns that grow brand awareness and drive sales across paid social, email, influencer partnerships and retail.

Responsibilities
- Develop and execute quarterly campaign plans across paid social, email and influencer channels
- Manage a marketing budget and agency partners
- Track campaign performance and report on ROI, customer acquisition cost and conversion
- Partner with creative on content for product launches
- Coordinate with retail partners on in-store promotions

Requirements
- 4+ years of experience in consumer marketing, ideally beauty or CPG
- Experience running paid social campaigns on Meta and TikTok
- Familiarity with email marketing platforms such as Klaviyo
- Strong project management and communication skills
- Bachelor's degree in marketing or business

Perks
Product allowance, flexible hybrid schedule, health benefits and paid parental leave.`,
};

module.exports = { CREDIT_RISK, DATA_SCIENTIST, BACKEND, ICU_NURSE, MARKETING };
