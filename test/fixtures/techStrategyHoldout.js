// Held-out technology strategy postings: written after the fit score was
// tuned on techPostings.js and techStrategyDeep.js, in different phrasing, and
// not used for tuning. They check the tuning generalises.

const P = {};

P.cloudAdvisory = {
  title: 'Cloud Transformation Advisor',
  company: 'Bluewater Partners',
  text: `Overview
Bluewater Partners advises enterprises on moving to the cloud the right way. Join a small, senior team that works directly with CIOs.

Key Responsibilities
- Lead cloud readiness assessments covering applications, infrastructure, security, skills and costs
- Build cloud business cases with TCO analysis and migration wave plans
- Define cloud operating models, FinOps practices and governance guardrails
- Advise executives on hyperscaler selection and contract negotiations
- Coordinate with engineering partners who execute migrations

Must-haves
- 4+ years in technology consulting or IT strategy roles
- Experience with cloud strategy or migration programs on AWS, Azure or Google Cloud
- Comfortable building financial models in Excel and presenting to executives
- Bachelor's degree

Bonus points
- FinOps certification
- Experience in regulated industries such as banking or healthcare`,
};

P.strategyOpsEngineering = {
  title: 'Strategy & Operations Manager, Engineering',
  company: 'Pathlight Software',
  text: `About Pathlight
Pathlight builds workflow software for 15,000 businesses.

What you'll do
- Partner with the SVP of Engineering to set annual and quarterly engineering priorities and OKRs
- Build the business case and plan for strategic investments like platform re-architecture and AI features
- Run the engineering operating cadence: planning, business reviews and headcount and budget tracking
- Lead cross-functional projects with product, finance and people teams
- Turn data into crisp executive updates and board slides

You have
- 5+ years in management consulting, strategy and operations, or technical program management
- Strong analytical and Excel skills; comfortable with SQL
- Proven project management and stakeholder management
- Clear, concise executive communication
- Experience at a software company is a plus`,
};

P.digitalStrategyConsultant = {
  title: 'Digital Strategy Consultant',
  company: 'Fairmount Consulting',
  text: `Who we are
Fairmount Consulting is a 400-person firm helping mid-market companies grow with technology.

Your role
As a Digital Strategy Consultant you will help clients define where digital and technology investments create value, and plan how to deliver them.

In this role you will
- Conduct interviews and workshops with client leaders to understand business goals and pain points
- Assess clients' digital maturity and technology landscape
- Develop digital strategies, initiative portfolios and implementation roadmaps
- Estimate costs and benefits and build investment cases
- Help clients set up transformation governance and track delivery

What we're looking for
- 2-5 years of consulting or corporate strategy experience, ideally focused on technology or digital
- Strong research, analysis and synthesis skills
- Polished PowerPoint and Excel skills
- Comfort leading client conversations
- Bachelor's degree; MBA a plus`,
};

P.enterpriseArchitect = {
  title: 'Enterprise Architect',
  company: 'Granite Insurance',
  text: `About the role
Granite Insurance is modernizing its policy and claims platforms. The Enterprise Architect defines the target-state architecture and guides delivery teams.

Responsibilities
- Define target-state enterprise architecture and transition roadmaps
- Maintain architecture standards, patterns and the application portfolio inventory
- Review solution designs from delivery teams
- Evaluate technologies and vendors and recommend build vs buy
- Model integration patterns using APIs and event streaming

Requirements
- 8+ years in IT, including 3+ years as an architect
- TOGAF certification preferred
- Hands-on background in software engineering or infrastructure
- Experience with cloud platforms and integration (APIs, Kafka)
- Insurance industry experience preferred`,
};

// [resume, posting, min, max, why] — resumes from techPostings / techStrategyDeep.
const BANDS = [
  ['techStrategyConsultant', 'cloudAdvisory', 70, 100, 'cloud strategy and business cases are their work'],
  ['techStrategyConsultant', 'digitalStrategyConsultant', 70, 100, 'the same job under another name'],
  ['techStrategyConsultant', 'strategyOpsEngineering', 45, 80, 'a common move; less of their core work'],
  ['techStrategyConsultant', 'enterpriseArchitect', 20, 55, 'adjacent; architects are hands-on and certified'],
  ['techStrategyManager', 'cloudAdvisory', 70, 100, 'their work'],
  // First guessed 40-75; but the posting asks 2-5 years and they have ~2.4 in tech consulting, so they meet it.
  ['juniorAnalyst', 'digitalStrategyConsultant', 55, 90, 'right field, at the posting\'s minimum years'],
  ['softwareEngineer', 'digitalStrategyConsultant', 0, 35, 'a different job'],
  ['managementConsultant', 'digitalStrategyConsultant', 45, 80, 'consulting and strategy, lighter on technology'],
  ['quantCareerChanger', 'strategyOpsEngineering', 30, 65, 'projects, stakeholders, SQL and analysis carry over'],
];

const ORDER = [
  ['digitalStrategyConsultant', 'techStrategyConsultant', 'managementConsultant', 'technology strategy beats general strategy'],
  ['digitalStrategyConsultant', 'managementConsultant', 'softwareEngineer', 'consulting beats engineering for a consulting role'],
  ['cloudAdvisory', 'techStrategyConsultant', 'projectManager', 'cloud strategy beats project management'],
  ['enterpriseArchitect', 'softwareEngineer', 'managementConsultant', 'an architect role favours the engineer over a generalist'],
];

module.exports = { POSTINGS: P, BANDS, ORDER };
