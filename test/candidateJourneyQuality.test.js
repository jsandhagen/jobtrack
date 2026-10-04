// Regressions found by reviewing a candidate's actual import-to-resume flow.
// All candidate content here is fictional; private PDFs stay outside fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../src/main/bullets');
const { localFitScore, shownFit, requirementUnits } = require('../src/main/localFit');
const { resumeEnhancements } = require('../src/main/resumeContext');
const { strategySummary } = require('../src/main/strategyResume');
const { resumeStrength } = require('../src/main/resumeStrength');
const { atsScore } = require('../src/main/atsScore');
const { skillSupported } = require('../src/main/draft');
const R = require('../src/shared/resumeDoc');
const { htmlToText } = require('../src/main/resumeRender');
const source = fs.readFileSync(path.join(__dirname, 'e2e/fixtures/Jordan_Reyes_Resume.txt'), 'utf8');
const documents = [{ kind: 'resume', text: source }];
const bankFor = () => B.mergeIntoBank(null, B.parseResume(source)).bank;

test('quota and territory planning do not turn business operations into quota-carrying sales', () => {
  for (const duty of [
    'Own territory design and quota setting with Finance.',
    'Support annual GTM planning: segmentation, resource allocation, territory design, coverage and quotas.',
  ]) {
    const job = { title: 'Business Operations Manager', text: `Responsibilities\n${duty}\nOwn QBRs and sales forecasting.\nRequirements\n5+ years in consulting or strategy\nSQL and Excel` };
    const result = shownFit(localFitScore(job, documents));
    assert.ok(!result.screens.some((s) => /sales role/.test(s.reason)), result.headline);
    assert.ok(result.score >= 65, `${duty}: ${result.score}`);
  }
  const sales = { title: 'Account Executive', text: 'Own a territory and meet sales quotas. Close new deals and generate pipeline. Requirements\n5+ years in SaaS sales' };
  assert.ok(shownFit(localFitScore(sales, documents)).screens.some((s) => /sales role/.test(s.reason)));
});

test('a named CRM is a specific requirement; another CRM does not satisfy it', () => {
  const job = { title: 'Business Operations Manager', text: 'Requirements\nExperience using Hubspot CRM\nAdvanced Excel and PowerPoint' };
  const units = requirementUnits(job).units;
  const hubspot = units.find((u) => u.label === 'HubSpot');
  assert.ok(hubspot);
  assert.equal(hubspot.match('built salesforce dashboards'), 0);
  assert.equal(hubspot.match('built hubspot dashboards'), 1);
  assert.equal(skillSupported('HubSpot', 'built salesforce dashboards'), false, 'the AI draft must not introduce a different CRM either');
  assert.equal(skillSupported('CRM', 'built salesforce dashboards'), true, 'a named CRM still supports the broader skill');
  assert.ok(!units.some((u) => u.label === 'CRM'), 'do not double-count the broad category');
  assert.ok(atsScore(job, 'Consultant 2020 - Present\nBuilt Salesforce dashboards using Excel and PowerPoint').score
    < atsScore(job, 'Consultant 2020 - Present\nBuilt HubSpot dashboards using Excel and PowerPoint').score);
});

test('multiword operational requirements retain their meaning', () => {
  const labels = (text) => requirementUnits({ title: 'Program Manager', text: `Requirements\n${text}` }).units.map((u) => u.label);
  const feedback = labels('Experience managing NPS, CSAT or Voice of Customer programs');
  assert.ok(feedback.some((l) => /Voice of Customer/.test(l)), feedback.join(', '));
  assert.ok(!feedback.some((l) => /Voice(?:,|$)/.test(l)), feedback.join(', '));
  const digital = labels('Deep fluency in IT and Digital Operations');
  assert.ok(digital.includes('Digital Operations'), digital.join(', '));
  assert.ok(!digital.includes('Digital'));
  const management = requirementUnits({ title: 'Program Manager', text: 'Requirements\n5-8 years of technical program or project management in software or technology.' }).units.find((u) => u.gate);
  assert.equal(management.label, 'experience in technical program or project management in software or technology');
  assert.equal(management.match('technical program management for software releases'), 1);
  assert.equal(management.match('technical project management for software releases'), 1);
  assert.ok(management.match('managed customer reporting programs') < 0.5);
});

test('wording suggestions cannot equate architects with architecture or generic delivery with infrastructure delivery', () => {
  const bank = bankFor();
  bank.bullets.push({ id: 'architecture', experienceId: bank.experiences[0].id, text: 'Authored keynote presentations about AI architecture and workflow opportunities', variants: [] });
  bank.bullets.push({ id: 'delivery', experienceId: bank.experiences[0].id, text: 'Ensured consistent delivery of client reporting programs', variants: [] });
  bank.bullets.push({ id: 'reports', experienceId: bank.experiences[0].id, text: 'Built analytical reports for client programs', variants: [] });
  const job = { title: 'Program Manager', text: 'Requirements\nTechnical literacy to work with software architects.\nExperience in data infrastructure delivery.\nPrepare incident reports.' };
  const asks = resumeEnhancements({ job, bank }).filter((s) => /posting says/.test(s.text));
  assert.ok(!asks.some((s) => /software architects|data infrastructure delivery|incident reports/.test(s.text)), JSON.stringify(asks));
});

test('the marketplace accomplishment survives duplicate-result selection for an AWS alliance role', () => {
  const bank = bankFor();
  const job = require('./fixtures/allianceOpportunities').workivaAlliance;
  const { doc } = B.optimizeResume({ bank, job });
  const text = doc.roles.flatMap((r) => r.bullets).map((b) => b.text).join('\n');
  assert.match(text, /AWS Marketplace/);
  assert.equal((text.match(/\$9M/g) || []).length, 1);
  const without = { ...doc, roles: doc.roles.map((r) => ({ ...r, bullets: r.bullets.filter((b) => !/AWS Marketplace/.test(b.text)) })) };
  const ranked = B.rankBullets(job, bank).ranked;
  assert.ok(resumeStrength(doc, job, { ranked }).score > resumeStrength(without, job, { ranked }).score);
  assert.ok(R.measure(doc).pages <= 1);
});

test('customer-experience optimization keeps customer touchpoints ahead of unrelated sponsorship metrics', () => {
  const bank = bankFor();
  const add = (id, text) => bank.bullets.push({ id, text, experienceId: bank.experiences[0].id, variants: [] });
  add('journey', 'Managed customer-facing communications and engagement templates throughout the customer lifecycle, keeping customer touchpoints accurate as processes changed');
  add('customer', 'Built customer experience dashboards in SQL to identify recurring pain points across 60 enterprise accounts');
  add('funding', 'Led program management for technology partnerships, securing $4M in sponsorship funding and tracking program KPIs');
  const job = { title: 'Experience Program Manager', text: 'Own customer experience operations, customer journey communications and customer touchpoint accuracy. Maintain customer experience dashboards and reporting.\nQualifications\n3-6 years in program management or customer success operations\nExperience managing NPS, CSAT or Voice of Customer programs.' };
  const { doc } = B.optimizeResume({ bank, job });
  assert.ok(doc.roles[0].bullets.slice(0, 2).some((b) => /customer experience|customer-facing communications/i.test(b.text)));
  assert.ok(doc.roles[0].bullets.some((b) => b.bulletId === 'journey'));
  assert.doesNotMatch(htmlToText(R.renderHtml(doc)), /managed (?:NPS|CSAT|Voice of Customer)/i);
});

test('the written summary reads as English: no line-start capitals, duty phrases or stray adjectives', () => {
  const fixtureBank = (file, key) => {
    const r = require(`./fixtures/${file}`).RESUMES[key];
    return B.mergeIntoBank(null, B.parseResume(typeof r === 'string' ? r : r.text)).bank;
  };
  const posting = (file, key) => require(`./fixtures/${file}`).POSTINGS[key];
  // "a strategy or operating role": "operating" describes the role.
  const consultant = B.atsSummary(posting('randomJobs.js', 'managementConsultant'), fixtureBank('quantHoldout.js', 'bigFourTechConsultant'));
  assert.doesNotMatch(consultant, /years in (?:[a-z ]+ and )?operating\b/, consultant);
  // "- Statistics, experimentation…" and "- Forecast demand…" are capitalized only as list items.
  const analyst = B.atsSummary(posting('quantHoldout.js', 'marketingDataScientist'), fixtureBank('quantPostings.js', 'dataScientist'));
  assert.match(analyst, /\bstatistics\b/, analyst);
  assert.doesNotMatch(analyst, /\b(?:Forecast|Statistics)\b/, analyst);
  // "- Write audit reports and track remediation" is a duty, not something you have experience in.
  const auditor = B.atsSummary(posting('randomJobs.js', 'internalAuditor'), fixtureBank('randomJobs.js', 'auditor'));
  assert.doesNotMatch(auditor, /\bwrite audit reports\b/i, auditor);
});

test('skill suggestions are skills: no "business", "combination", titles or bare describing words', () => {
  const labels = (text) => requirementUnits({ title: 'Manager', text: `Requirements\n${text}` }).units.map((u) => u.label).join(' | ');
  const consulting = labels('- Minimum five years of recent experience in technology/business consulting, or a combination of consulting and technology roles');
  assert.doesNotMatch(consulting, /\bbusiness(?:,|$| \|)|combination/, consulting);
  const analyst = labels('- 5+ years of Business Analyst or equivalent technical experience');
  assert.doesNotMatch(analyst, /or technical\b/, analyst);
  const related = labels('- 8+ years experience in financial management, business planning, strategy, project management or business-related roles');
  assert.doesNotMatch(related, /business-related/, related);
  // Asked as the skill, not the posting's job title.
  const { atsNudges } = require('../src/main/atsNudges');
  const job = { title: 'Product Owner', text: 'Requirements\n- 3+ years as a Product Manager / Business Analyst\n- Write user stories' };
  const page = 'Consultant 2020 - Present\n- Built dashboards for 40 clients';
  const ask = atsNudges({ ats: atsScore(job, page), job, pageText: page, bank: { skills: [], bullets: [] } }).nudges.concat([]).find((n) => n.id === 'ask:skills');
  assert.ok(ask, 'asks about the missing skill');
  assert.ok(!ask.action.terms.some((t) => /manager|analyst/i.test(t)), ask.action.terms.join(', '));
});

test('a shortened summary proof must still demonstrate the target work', () => {
  const bank = bankFor();
  const job = { title: 'Business Operations Manager', text: 'Own reporting and dashboards, forecasting and data analysis.' };
  const doc = B.baselineDoc({ bank, job, profile: {} });
  doc.roles[0].bullets = doc.roles[0].bullets.filter((b) => !/competitive intelligence/i.test(b.text));
  const ranked = B.rankBullets(job, bank).ranked;
  const competitor = ranked.find((b) => /Led competitive intelligence/.test(b.text));
  competitor.text = 'Led competitive intelligence and thought leadership for the CTO by tracking competitor forecasts and reporting analytical insights across business units and regional customer teams to inform their strategies and priorities for the following year';
  competitor.score = 100;
  competitor.strategy = [{ key: 'analytics', weight: 15 }];
  const summary = strategySummary(job, doc, ranked);
  assert.doesNotMatch(summary, /\. Led competitive intelligence/);
});

test('resume strength counts required work experience even when the tool list matches', () => {
  const job = { title: 'Technical Program Manager', text: 'Requirements\n5+ years of experience in software engineering\nSQL and Python' };
  const page = (title) => ({ summary: 'Program leader delivering technical projects.', roles: [{ title, dates: '2020 - Present', bullets: [{ text: 'Built reporting dashboards with SQL and Python for 50 customers' }] }] });
  const adjacent = resumeStrength(page('Business Operations Consultant'), job);
  const direct = resumeStrength(page('Software Engineer'), job);
  assert.ok(direct.parts.mustHaves > adjacent.parts.mustHaves);
  assert.ok(direct.score > adjacent.score);
  assert.ok(adjacent.notes.some((n) => /required kind of work/.test(n)));
});
