// Opportunities the CTO-office persona (ctoOfficePersona.js) shouldn't miss:
// in-house strategy jobs under titles that aren't on their target list
// ("Associate Principal, Business Operations and Strategy", "Senior Manager,
// AI Enablement", "Principal Associate"), next to near misses with the same
// words. Found by web search in October 2026 and rebuilt from what search
// returned about each real posting (noted beside each; real companies kept,
// as the person would see them). Nothing is added to a posting that search
// didn't report, so some are short, as pasted summaries are.
//
// Labels (BANDS, SHOW, ORDER) were written before any of these was scored.

const P = {};

// Google "Associate Principal, Business Operations and Strategy".
P.googleAssocPrincipalBOS = {
  title: 'Associate Principal, Business Operations and Strategy',
  company: 'Google',
  location: 'New York, NY',
  text: `Minimum qualifications:
- Bachelor's degree or equivalent practical experience.
- 5 years of experience in management consulting at the project lead or managerial level or equivalent experience in corporate strategy.

Preferred qualifications:
- Advanced degree in a management, technical, or engineering field.
- 5 years of experience in a management consulting firm with a strong performance trajectory.
- Experience in strategy or in a business operations environment, leading client projects and owning operational initiatives.
- Experience guiding consultants.
- Excellent leadership, communication, and collaboration skills.
- Excellent problem-solving, modeling, and presentation skills.

Responsibilities
- Structure ambiguous business issues for the Google executive team, gather and analyze information quickly and solve problems effectively.
- Develop compelling and insightful recommendations.
- Build consensus among cross-functional teams and influence decision making within leadership audiences.
- Work with product managers, leadership, and functions to operationalize recommendations.`,
};

// Google "Product Strategy and Operations Lead, Google Cloud" (the 4-year level).
P.googlePSOLead = {
  title: 'Product Strategy and Operations Lead, Google Cloud',
  company: 'Google',
  location: 'Reston, VA',
  text: `Minimum qualifications:
- Bachelor's degree or equivalent practical experience.
- 4 years of experience in management consulting, product management and strategy, or analytics in a technology company.
- Experience working with and analyzing data.

Preferred qualifications:
- Advanced degree or equivalent practical experience.
- Experience working in a developer environment.
- Ability to create effective relationships, influence and collaborate internally and externally at all organizational levels.
- Excellent written and verbal communication skills.
- Excellent strategic and problem-solving capabilities, with the ability to collaborate well in a team environment.

About the job
Product and Business Strategy Leaders bring together teams across Google's functions to help products execute optimally, pushing Google to scale at key points by executing efficiently with solid business sense and sound judgment, and working effectively across organizational lines.`,
};

// Salesforce "Senior Manager, Strategy & Operations - Missionforce" (JR338108).
P.salesforceSOMissionforce = {
  title: 'Senior Manager, Strategy & Operations - Missionforce',
  company: 'Salesforce',
  location: 'California - San Francisco',
  text: `This role is an apprenticeship in executive problem-solving, with exposure to the full range of challenges facing a high-growth government cloud business — commercial, technical, organizational — and the chance to build the judgment and versatility to operate at the next level.

Required qualifications
- 5–7 years in strategy consulting, investment banking, or corporate strategy
- Demonstrated ability to learn quickly across very different contexts
- Strong analytical and communication skills; ability to structure thinking clearly in writing and slides
- High tolerance for ambiguity and comfort working on problems without a clear roadmap
- A bias toward action and follow-through

Preferred qualifications
- Experience working with or presenting to senior executives`,
};

// Marriott "Senior Manager, AI Enablement" (Bethesda, MD).
P.marriottAIEnablement = {
  title: 'Senior Manager, AI Enablement',
  company: 'Marriott International',
  location: 'Bethesda, MD',
  text: `The Sr. Manager, AI Enablement plays a critical role in scaling Marriott's AI capabilities across the enterprise as AI transitions from a centralized function to an embedded, domain-led capability across Data, Analytics, & AI and Technology teams. This role designs and operates the enablement systems, intake mechanisms, and adoption frameworks that allow business and technology teams to responsibly and efficiently leverage AI without creating bottlenecks, duplication, or unmanaged risk.

Partnering closely with AI Product, Technology, Data & Analytics leaders, and enterprise functions (Legal, Privacy, HR, Change & Communications), the Senior Manager ensures AI initiatives are easy to access, well-governed, reusable, and measurably valuable.

Qualifications
- Bachelor's degree required; advanced degree preferred (MBA, MS in Information Systems, Data Science, Human-Centered Design, or related field).
- Minimum 6 years of progressive experience in AI enablement, digital transformation, product operations, platform adoption, or enterprise technology strategy.
- Demonstrated experience scaling emerging technologies (AI, automation, analytics, platforms) across large, matrixed enterprises.
- Strong understanding of AI lifecycle concepts, including use case intake, experimentation, deployment, adoption, and measurement (hands-on model development not required).
- Proven ability to operate effectively across business, technology, legal, privacy, and change functions.`,
};

// QAD "Senior Manager - Enterprise AI Transformation" (Summit Partners job board).
// Search returned the duties; the years line is what search reported for these roles.
P.qadAITransformation = {
  title: 'Senior Manager - Enterprise AI Transformation',
  company: 'QAD',
  location: 'Remote (US)',
  text: `The Senior Manager - Enterprise AI Transformation will lead the internal AI leverage agenda across QAD by translating company-level productivity goals into a governed, prioritized, and measurable AI transformation roadmap. You will own the overall operating model for internal AI adoption: prioritization, governance, reference architecture coordination, usage controls, value tracking, and execution cadence. This is not a PMO lead role.

What you'll do
- Own the enterprise internal AI leverage roadmap across functions and business units, and prioritize use cases based on value, feasibility, functional readiness, data readiness, and risk
- Define the internal AI governance model in partnership with IT, Data, Engineering, InfoSec, Legal, Procurement, and functional leaders
- Establish use-case intake, prioritization, approval, and escalation processes, and create a risk-tiered governance approach
- Coordinate the internal AI reference architecture across approved tools, data sources, enterprise systems, workflow layers, and governance controls

What you'll bring
- 8+ years of experience in digital transformation, AI transformation, enterprise automation, technology strategy, operations transformation, or consulting`,
};

// Walmart "Senior Manager, Technology Strategy - Operational Technology" (R-2476312).
P.walmartTechStrategyOT = {
  title: 'Senior Manager, Technology Strategy - Operational Technology',
  company: 'Walmart',
  location: 'Bentonville, AR',
  text: `The Senior Manager, Product Management – Operational Technology owns the end-to-end product lifecycle, technology strategy, and operational health for enterprise Operational Technology platforms that support campus operations, building systems, and digital workplace infrastructure.

What you'll do
- Define and maintain multi-year roadmaps aligned to business priorities, financial plans (AOP/LRP), and enterprise architecture; incorporate industry trends, emerging tech, and regulatory considerations
- Lead planning and investment decisions, including modernization, build-vs-buy, and ecosystem partnerships
- Translate business and operational needs into clear product visions, success metrics, and prioritized initiatives; influence senior stakeholders by communicating trade-offs, risks, and recommendations
- Partner with Engineering, Campus Operations, Construction, Finance, Infosec, and vendors to deliver secure, scalable solutions
- Own the support strategy and operating model (SLAs, escalation, incident management), and ensure operational readiness for releases

Minimum Qualifications
Option 1: Bachelor's degree in computer science, information technology, engineering, business, finance, strategy, or related area and 8 years' experience in retail, eCommerce, strategy, operations, technology, management consulting, or related area.
Option 2: 10 years' experience in retail, eCommerce, strategy, operations, technology, management consulting, or related area.`,
};

// Nationwide "Technology Innovation Consultant": an in-house job with a consultant title.
P.nationwideInnovationConsultant = {
  title: 'Technology Innovation Consultant',
  company: 'Nationwide',
  location: 'Columbus, OH',
  text: `Qualifications
- Bachelor's degree in business, IT or related field; advanced degree preferred
- Typically 7 or more years of demonstrated experience delivering initiatives and conducting customer research to inform value-based solutions
- Experience delivering work in an agile environment, leveraging product-centric principles and managing large scale initiatives with multiple dependencies
- Deep knowledge of the insurance industry
- In-depth understanding of agile planning practices and customer-centric design
- Strong command of verbal and written communication skills and facilitation techniques`,
};

// Nationwide "Technology Innovation Analyst": the junior job on the same team.
P.nationwideInnovationAnalyst = {
  title: 'Technology Innovation Analyst',
  company: 'Nationwide',
  location: 'Columbus, OH',
  text: `As a Technology Innovation Analyst, you will assist Technology Strategy and Planning activities by analyzing technology trends, including enterprise architecture, technology portfolio dimensions, and benchmark and peer analysis.

Education: Undergraduate studies in computer science, management information systems or a related field is preferred.`,
};

// Capital One "Principal Associate, eHR Strategic Operations" (McLean).
P.capOnePrincipalAssociate = {
  title: 'Principal Associate, eHR Strategic Operations',
  company: 'Capital One',
  location: 'McLean, VA',
  text: `Basic Qualifications
- Bachelor's Degree or Military experience
- At least 3 years of experience in Strategic Operations, Project Management, Management Consulting, HR Strategy, Chief of Staff role or combination
- At least 1 year of experience in roadmap alignment, governance structures, and change management
- At least 3 years experience working in a matrixed environment`,
};

// Capital One "Senior Associate, Strategy" (McLean): the post-consulting entry level.
P.capOneSeniorAssociate = {
  title: 'Senior Associate, Strategy',
  company: 'Capital One',
  location: 'McLean, VA',
  text: `Basic Qualifications
- Bachelor's degree
- At least one year of consulting or investment banking experience

Preferred
- Strong written and verbal communication skills
- Ability to work in a fast-paced environment while maintaining a high level of analytical rigor and attention to detail
- Interest or experience with the banking or payments industries
- Financial modeling or investment research expertise
- Strong judgment and problem-solving skills`,
};

// Intuit "Director, Business Operations & Strategy".
P.intuitDirectorBOS = {
  title: 'Director, Business Operations & Strategy',
  company: 'Intuit',
  location: 'Mountain View, CA',
  text: `Qualifications
- 10+ years of progressive experience in corporate strategy, management consulting, or a related field within the tech/SaaS industry
- Proven experience partnering with and influencing C-suite and VP/SVP-level executives, with the ability to build trust, challenge courageously, and drive leadership alignment`,
};

// Microsoft "Technical Advisor to CTO": strategy words, an engineering job.
P.msftTechnicalAdvisorCTO = {
  title: 'Technical Advisor to CTO',
  company: 'Microsoft',
  location: 'Redmond, WA',
  text: `The Technical Advisor (TA) to the EVP/CTO extends the capacity of the CTO by generating research, synthesizing insights into specific technical domains, doing hands-on prototyping and technical exploration, driving initiatives that span across the organization, and helping multiple teams move towards common goals across Microsoft.

Responsibilities
- Research to synthesize key opportunities, issues, and progress to date, and generate briefs that synthesize shared and divergent points of view
- Drive projects that require collaboration from multiple teams across Microsoft while sharing a common strategic vision
- Help the CTO with technical prioritization decisions and with understanding key industry technical and social trends

Qualifications
- Demonstrated expertise in research, engineering and product development; a deep expert in technical domains with a reputation as a credible thought leader
- 15+ years of Technical Program Management and/or Software Engineering experience
- Experience building software for customers, using bleeding-edge technologies`,
};

// Salesforce "Manager/Senior Manager, Strategy & Innovation" (sales compensation systems).
P.salesforceStrategyInnovation = {
  title: 'Manager/Senior Manager, Strategy & Innovation',
  company: 'Salesforce',
  location: 'San Francisco, CA',
  text: `Join the Innovation and Transformation team to support the team's strategy, growth, process excellence and innovation. You'll collaborate cross-functionally with Sales Compensation and other Prospect-to-Cash counterparts to re-engineer and automate the systems that drive company strategies.

Required
- 7+ years of operational responsibilities with SaaS large-scale initiatives
- 5+ years of Business Analyst or equivalent technical experience
- BA/BS degree
- Exceptional project management skills
- Salesforce and Spiff SaaS compensation systems
- Ability to automate manual bottlenecks in Sales Compensation`,
};

// Salesforce "Senior Manager, Engineering Strategy & Operations" (JR334170).
P.salesforceEngSO = {
  title: 'Senior Manager, Engineering Strategy & Operations',
  company: 'Salesforce',
  location: 'Palo Alto, CA',
  text: `Qualifications
- 15+ years of experience in engineering, operations, or program management roles in SaaS or enterprise software, with 5+ years in leadership positions
- Experience scaling engineering teams and operations in fast-paced environments, with a background in change management and scaling operational frameworks
- Proven track record managing cross-functional, globally distributed engineering teams and large-scale programs
- Experience supporting senior executives and leadership teams in a strategic and operational capacity`,
};

// [posting, min, max, why] for the persona's resume with the scenarios Profile
// (Washington, DC; any arrangement; travel up to 30%).
const BANDS = [
  ['googleAssocPrincipalBOS', 55, 85, '7 years of consulting and in-house strategy count as "equivalent experience in corporate strategy"'],
  ['googlePSOLead', 65, 92, 'consulting, then strategy in a technology company; 4 years asked'],
  ['salesforceSOMissionforce', 65, 92, 'strategy consulting and corporate strategy, 5-7 years: their profile exactly'],
  ['marriottAIEnablement', 60, 88, 'enterprise technology strategy and scaling AI, near home'],
  ['qadAITransformation', 50, 80, 'AI roadmap and governance; 7 of 8+ years'],
  ['walmartTechStrategyOT', 30, 62, 'mostly product and support ownership of building systems; 7 of 8 years'],
  ['nationwideInnovationConsultant', 35, 68, 'an in-house innovation job; no insurance or agile delivery'],
  ['nationwideInnovationAnalyst', 30, 62, 'their kind of work, a junior job'],
  ['capOnePrincipalAssociate', 50, 82, 'strategic operations and roadmaps, HR technology in a bank'],
  ['capOneSeniorAssociate', 35, 65, 'strategy at a post-consulting entry level they are past'],
  ['intuitDirectorBOS', 20, 50, 'a director role with 10+ years'],
  ['msftTechnicalAdvisorCTO', 0, 35, '15+ years of engineering or TPM'],
  ['salesforceStrategyInnovation', 10, 45, 'sales compensation systems and business analysis'],
  ['salesforceEngSO', 0, 40, '15+ years and engineering leadership'],
];

// Good opportunities the job search should list for someone with the
// persona's target roles: by title or by a fit at the "similar title" minimum.
const SHOW = ['googleAssocPrincipalBOS', 'googlePSOLead', 'salesforceSOMissionforce', 'marriottAIEnablement', 'qadAITransformation', 'capOnePrincipalAssociate'];

// [better, worse, why]
const ORDER = [
  ['marriottAIEnablement', 'walmartTechStrategyOT', 'AI strategy beats running building-systems products'],
  ['googlePSOLead', 'salesforceEngSO', 'their level beats 15+ years'],
  ['googleAssocPrincipalBOS', 'intuitDirectorBOS', 'their level beats a director'],
  ['salesforceSOMissionforce', 'salesforceStrategyInnovation', 'strategy beats sales compensation systems'],
  ['nationwideInnovationConsultant', 'nationwideInnovationAnalyst', 'their level beats the junior job'],
  ['capOnePrincipalAssociate', 'capOneSeniorAssociate', 'their level beats the entry level'],
  ['googlePSOLead', 'msftTechnicalAdvisorCTO', 'strategy beats a senior engineering advisor'],
];

module.exports = { POSTINGS: P, BANDS, SHOW, ORDER };
