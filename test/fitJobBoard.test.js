// Findings from an end-to-end run (October 2026) that scored ~720 live postings
// from 16 company job boards for a technology strategist (CTO office,
// partnerships, competitive intelligence). The postings here are short
// paraphrases of the ones that went wrong; the candidate is the fictional e2e
// one (test/e2e/fixtures), who has the same kind of background.
//
// - Ramp heads its requirements "WHAT YOU NEED", which wasn't read as one: a
//   backend Software Engineer posting's only must-have was "AI", and the
//   strategist read 89 "Strong match". Vanta's "How to be successful in this
//   role:" was missed the same way.
// - Benefits lists ran past their heading ("Benefits available to all
//   full-time Ramp employees (global)", then "United States", "Canada"):
//   RRSP, DPSP and Lumino Health were preferred qualifications, and Zip's
//   "Catered lunches" and "happy hours" were phrases to add to a resume.
// - SEON's privacy notice ("SEON Technologies collects…", "If you are a
//   European Job Applicant…") made "Technologies" and "European Job
//   Applicant" requirements to ask about.
// - SDR, BDR and Account Executive roles read 86–91 for someone with no sales
//   work: the posting talks about outbound and leads, not a quota.
// - "Partner across Marketing, Product Growth, Data Science, Finance, and GTM"
//   made Marketing and Finance skills a backend engineer must have.
// - "BSA/AML advisory or operations" was met by any "operations".
// - "3-5 years of investment banking, management consulting, and/or business
//   operations" asked for Financial Services from a consultant.
// - "product judgment", "research instincts" and "Grit" were skills to add.
// - "Change Management" was listed both as partly shown and as missing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { localFitScore, shownFit, requirementUnits } = require('../src/main/localFit');
const { classifyLines } = require('../src/main/fitScore');
const { atsScore } = require('../src/main/atsScore');

const read = (f) => fs.readFileSync(path.join(__dirname, 'e2e', 'fixtures', f), 'utf8');
const RESUME = { name: 'Jordan_Reyes_Resume.txt', kind: 'resume', text: read('Jordan_Reyes_Resume.txt') };
const IMPACT = { name: 'Impact_Statement.txt', kind: 'recommendation', text: read('Impact_Statement.txt') };
const fit = (job) => shownFit(localFitScore(job, [RESUME, IMPACT], {}));
const labels = (job) => requirementUnits(job).units.map((u) => u.label);

const RAMP_BENEFITS = `BENEFITS AVAILABLE TO ALL FULL-TIME RAMP EMPLOYEES (GLOBAL)
 - Flexible PTO
 - Health and wellness stipend
UNITED STATES
 - 100% medical, dental & vision insurance coverage for you
 - 401(k), including employer match
CANADA
 - Group Retirement Plan with employer match (RRSP + DPSP)
 - Employee Assistance Program and virtual care through Lumino Health`;

const SWE = {
  title: 'Software Engineer, Backend, Growth',
  company: 'Ramp',
  text: `We are looking for a product-minded backend engineer to build the infrastructure behind AI-native marketing products.
WHAT YOU'LL DO
 - Build the backend systems that power AI-native marketing and growth products.
 - Partner across Marketing, Product Growth, Product, Data Science, Finance, and GTM Platform to own systems from discovery through production.
WHAT YOU NEED
 - 5+ years of software engineering experience building production backend systems, with strong proficiency in Python or another modern server-side language.
 - A track record of owning production services, APIs, data models, and event-driven workflows.
 - Strong product judgment and system-design fundamentals, including asynchronous processing, reliability and observability.
 - Experience applying AI to real product workflows.
NICE TO HAVES
 - Experience building incentive, rewards, payments or ledger systems.
${RAMP_BENEFITS}`,
};

test('"What you need" and "How to be successful in this role" are requirements sections', () => {
  for (const h of ['WHAT YOU NEED', 'How to be successful in this role:', 'Role requirements:', "Here's what we're looking for:", 'You could be a great fit if:', 'You should apply if:']) {
    assert.equal(classifyLines(`${h}\n- 5+ years of SQL`)[1].kind, 'required', h);
  }
  // And these end one: what follows them isn't a requirement.
  for (const h of ['THE INTERVIEW', 'Interview process', 'A few things to note:', 'What can you expect?']) {
    assert.equal(classifyLines(`Requirements\n- SQL\n${h}\n- 30 min - Recruiter Screen with Talent Team`)[3].kind, 'neutral', h);
  }
});

test('a benefits section, country sub-headings and all, is never a requirement', () => {
  const units = labels(SWE);
  for (const junk of ['RRSP', 'DPSP', 'Lumino Health', 'Retirement Plan', 'Assistance Program', 'Medical']) assert.ok(!units.some((u) => u.includes(junk)), `${junk}: ${units}`);
  // Zip's perks, as a posting writes them: no phrases to put on a resume.
  const zip = {
    title: 'Product Operations Manager',
    company: 'Zip',
    text: `QUALIFICATIONS\n - 5+ years in product operations or program management\n - Experience running planning cadences across product teams\n\nPERKS & BENEFITS\n\nAt Zip, we’re committed to providing our employees with everything they need.\n\n - 🍽️ Catered lunches & dinners for SF employees\n - 🚠 Team building events & happy hours\n - 💻 Apple equipment plus home office budget\n\nWe're looking to hire people who take ownership and communicate openly.`,
  };
  const ats = atsScore(zip, RESUME.text);
  assert.ok(!ats.missingKeywords.some((k) => /catered|happy hour|apple equipment/.test(k)), ats.missingKeywords.join(', '));
  assert.ok(!labels(zip).some((u) => /Apple|Zipsters/.test(u)), labels(zip).join(', '));
});

test('a privacy notice and the employer’s mission are not requirements', () => {
  const seon = {
    title: 'Lead Competitive Intelligence Manager',
    company: 'SEON',
    text: `What you bring\n - 5+ years in competitive intelligence or strategy at a B2B SaaS company\n - Familiarity with CI tools (e.g. Klue, Crayon)\n - Ability to manage CI initiatives end-to-end\n\nSEON Technologies collects and processes personal data in accordance with applicable data protection laws. If you are a European Job Applicant see the privacy notice for further details.`,
  };
  const units = labels(seon);
  assert.ok(!units.some((u) => /Technologies|European|Job Applicant/.test(u)), units.join(', '));
  // "CI" is the title's own Competitive Intelligence: not a second thing to ask about.
  assert.ok(!units.includes('CI'), units.join(', '));
  const vanta = {
    title: 'Partner Marketing Programs Manager',
    company: 'Vanta',
    text: `How to be successful in this role:\n - 5+ years in partner marketing\n - Strong proficiency in Salesforce reporting and dashboard creation\nAbout Vanta\nWe started in 2018, in the wake of several high-profile data breaches.\nNow more than ever, making security continuous—not just a point-in-time check— is essential.`,
  };
  const q = fit(vanta);
  assert.ok(!q.missingSkills.includes('Security'), q.missingSkills.join(', '));
  assert.ok(!labels(vanta).includes('creation'), labels(vanta).join(', '));
});

test('a backend engineering job is a stretch for a strategist, whatever words they share', () => {
  const q = fit(SWE);
  assert.equal(q.label, 'Stretch role', `${q.score} ${q.headline}`);
  assert.ok(q.missingSkills.includes('experience in software engineering'), q.missingSkills.join(', '));
  // The teams it works with aren't skills it asks for.
  assert.ok(!labels(SWE).includes('Finance'), labels(SWE).join(', '));
  // Nor are qualities.
  assert.ok(!q.missingSkills.some((s) => /judgment/.test(s)), q.missingSkills.join(', '));
});

test('sales development and account executive roles are sales jobs, even without the word quota', () => {
  const mdr = {
    title: 'Marketing Development Representative',
    company: 'Zip',
    text: `What you'll do\n - Own all marketing-sourced leads from campaigns across digital, tradeshows and webinars\n - Work historic leads through nurture campaigns and sequences\nQualifications\n - Prior work or internship experience in a sales or marketing role\n - A consistent track record of meeting and exceeding goals\n - Experience with Salesforce, Outreach, Gong, and/or SalesNavigator`,
  };
  const ae = {
    title: 'Account Executive, Mid-Market',
    company: 'Factory',
    text: `Requirements\n - 3+ years of B2B SaaS experience\n - Comfortable presenting to technical and executive audiences\n - Experience with AI developer tools a plus`,
  };
  for (const job of [mdr, ae]) {
    const q = fit(job);
    assert.ok(q.score < 60, `${job.title}: ${q.score} ${q.label}`);
    assert.ok(q.screens.some((s) => /sales role/.test(s.reason)), `${job.title}: ${JSON.stringify(q.screens)}`);
  }
});

test('the alternatives of a kind of experience share its words, and any one of them meets it', () => {
  const kind = (line) => labels({ title: 'Analyst', company: 'X', text: `Requirements\n${line}` }).find((l) => l.startsWith('experience in'));
  assert.equal(kind('- 3+ years of experience in BSA/AML advisory or operations'), 'experience in bsa aml advisory or bsa aml operations');
  assert.equal(kind('- 4+ years of experience in performance or quantitative marketing'), 'experience in performance marketing or quantitative marketing');
  assert.equal(kind('- 3+ years experience in sales or customer success'), 'experience in sales or customer success');
  // A consultant meets "investment banking, management consulting, and/or business operations".
  const director = { title: 'Director of Strategy and Operations', company: 'Local Infusion', text: 'Qualifications\n- 3-5 years of investment banking, management consulting, and / or business operations role\n- Proven ability to lead complex, ambiguous projects' };
  assert.ok(!fit(director).missingSkills.includes('Financial Services'), fit(director).missingSkills.join(', '));
  // "Operations" on its own isn't people operations.
  const mobility = { title: 'Senior Analyst, Global Mobility & Immigration', company: 'Ramp', text: 'What you need\n- 3+ years of experience in people operations, immigration operations or global mobility\n- Strong Excel skills' };
  const q = localFitScore(mobility, [{ kind: 'resume', text: 'Business Operations Manager, Acme 2018 - 2024\n- Ran sales operations reporting and business operations reviews' }]);
  assert.ok(q.missingSkills.some((s) => /people operations/.test(s)), q.missingSkills.join(', '));
});

test('"experience as an HR Business Partner" is the kind of experience asked for, without years', () => {
  const hrbp = { title: 'Human Resources Business Partner, GTM', company: 'Zip', text: 'Qualifications\n- Demonstrated experience as an HR Business Partner supporting go-to-market organizations\n- Foundational knowledge of GTM practices: performance metrics, quota setting and pipeline mechanics' };
  assert.ok(labels(hrbp).includes('experience in hr business partner'), labels(hrbp).join(', '));
  assert.notEqual(fit(hrbp).label, 'Strong match');
  assert.notEqual(fit(hrbp).label, 'Excellent match');
});

test('a must-have is partly shown or missing, never both', () => {
  const job = { title: 'Implementation Specialist', company: 'Ashby', text: 'Requirements\n- 3+ years of experience in people operations, employee lifecycle operations or another high-detail service\n- Change management experience' };
  const q = fit(job);
  assert.deepEqual(q.partialSkills.filter((s) => q.missingSkills.includes(s)), []);
});

test('a scam warning, people, qualities and "hands-on" are not skills to ask about', () => {
  const job = {
    title: 'Senior Channel Partner Manager',
    company: 'Ramp',
    text: `What you need\n - 5+ years in partnerships, channel sales or alliances\n - 3+ years of hands-on experience working with SAP S/4HANA\n - Exceptional organizational and time management abilities\n - Comfort working with Controllers and Finance Heads\n - ⚙️You thrive in complexity\n\nBeware of recruiting scams: Ramp will only contact you through official @Ramp.com email addresses.`,
  };
  const units = labels(job);
  for (const junk of ['Human Resources', 'experience in hands-on', 'Exceptional organizational', 'Controllers', 'Heads', 'You thrive in complexity']) assert.ok(!units.some((u) => u.includes(junk)), `${junk}: ${units.join(', ')}`);
});

test('the screening check doesn’t count an alternative the resume meets another way as a gap', () => {
  const job = { title: 'Business Operations', company: 'Factory', text: 'Requirements\n- 3-4 years of experience at a top consulting firm, investment bank, private equity fund, or high-growth startup.\n- Strong data analysis and financial modeling skills.' };
  const ats = atsScore(job, 'Consultant, KCIC 2021 - 2024\n- Built financial models and data analysis for Fortune 500 consulting clients');
  assert.ok(!ats.knockouts.some((k) => /Financial Services/.test(k)), ats.knockouts.join(' | '));
  assert.ok(!ats.missingSkills.some((m) => m.skill === 'Financial Services'), JSON.stringify(ats.missingSkills));
});
