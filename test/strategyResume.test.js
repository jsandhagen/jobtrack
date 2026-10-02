const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { atsScore } = require('../src/main/atsScore');
const { htmlToText } = require('../src/main/resumeRender');
const F = require('./fixtures/ctoOfficePersona');
const DEEP = require('./fixtures/techStrategyDeep');
const profile = { name: 'Jordan Avery', email: 'jordan@example.com', phone: '555-010-0100', location: 'Washington, DC' };
const bankFor = (text) => B.mergeIntoBank(B.emptyBank(), B.parseResume(text)).bank;
// The accomplishment in a summary: after the title-and-years lead, without "At Employer, ".
const plain = (t) => String(t).replace(/\s*\([^)]*\)/g, '').replace(/[.!?]+$/, '').toLowerCase();
const achievementOf = (summary) => plain(summary.split(/(?<=\.) /).slice(1).join(' ').replace(/^At [^,]+, /, ''));
// Where it came from in your bank (any wording), and whether the page already says all of it.
const sourceOf = (bank, summary) => bank.bullets.find((b) => [b.text, ...(b.variants || [])].some((t) => plain(t).includes(achievementOf(summary))));
const repeatsPage = (doc) => doc.roles.flatMap((r) => r.bullets).some((b) => plain(doc.summary).includes(plain(b.text)));

test('one-click strategy optimization leads with the work the target role actually needs', () => {
  const bank = bankFor(F.RESUMES.ctoOfficeStrategist);
  const cases = [
    ['octoStrategyOps', /annual technology planning.*OKRs/],
    ['chiefOfStaffCTO', /annual technology planning.*OKRs/],
    ['competitiveIntel', /competitive analysis.*Gartner/],
    ['corpStrategyVendor', /competitive analysis|technical due diligence/],
    ['productStrategyAI', /competitive analysis/],
    ['emergingTechStrategist', /prototypes.*Python|Research emerging technologies/],
    ['techPartnerships', /20\+.*4 technology partnerships/],
  ];
  for (const [key, proof] of cases) {
    const out = B.optimizeResume({ profile, bank, job: F.POSTINGS[key] });
    assert.match(out.doc.roles[0].bullets[0].text, proof, key);
    const source = sourceOf(bank, out.doc.summary);
    assert.ok(source && achievementOf(out.doc.summary).length > 20, key + ': the summary quotes a documented accomplishment');
    assert.ok(!repeatsPage(out.doc), key + ": the summary doesn't repeat a bullet on the page");
    assert.equal(out.pages, 1, key);
    assert.equal(R.measure(out.doc).pages, 1, key);
    assert.ok(out.doc.summary.split(/\s+/).length <= 75, key + ': concise summary');
  }
});

test('required investment and transformation work outranks optional technical experimentation for consulting roles', () => {
  const bank = bankFor(F.RESUMES.ctoOfficeStrategist);
  const { doc } = B.optimizeResume({ profile, bank, job: F.POSTINGS.techStrategyManagerBig4 });
  assert.match(doc.roles[0].bullets[0].text, /due diligence|Evaluated.*vendors/);
  // The investment / transformation work, from the consulting role, without repeating its bullet.
  assert.match(doc.summary, /At Deloitte Consulting, (?:developed IT strategies, technology roadmaps and business cases|assessed IT operating models and built cost models)/);
  assert.match(doc.roles.find((r) => /Deloitte/.test(r.organization)).bullets[0].text, /IT strategies|cost models/);
});

test('a tailored summary replaces a generic imported summary without inventing a title, tenure or accomplishment', () => {
  const bank = bankFor(F.RESUMES.ctoOfficeStrategist);
  bank.summary = 'Looking for opportunities in engineering.';
  const before = JSON.stringify(bank);
  for (const key of ['chiefOfStaffCTO', 'competitiveIntel', 'techStrategyManagerBig4']) {
    const out = B.optimizeResume({ profile, bank, job: F.POSTINGS[key] });
    assert.doesNotMatch(out.doc.summary, /Looking for opportunities|years in consulting|years in strategy/);
    assert.ok(out.doc.summary.startsWith(bank.experiences[0].title));
    assert.ok(sourceOf(bank, out.doc.summary), key + ': the summary quotes an accomplishment from your bank');
    assert.ok(!repeatsPage(out.doc), key + ": the summary doesn't repeat a bullet on the page");
    for (const role of out.doc.roles) {
      const source = bank.experiences.find((e) => e.id === role.experienceId);
      assert.equal(role.title, source.title);
      assert.equal(role.dates, source.dates);
      for (const bullet of role.bullets) {
        const orig = bank.bullets.find((b) => b.id === bullet.bulletId);
        assert.ok([orig.text, ...orig.variants].includes(bullet.text), 'uses an actual source wording');
      }
    }
  }
  assert.equal(JSON.stringify(bank), before, 'keeps the source bank intact');
});

test('strategy skills stay useful, distinct and supported rather than prepositions or redundant acronyms', () => {
  const bank = bankFor(F.RESUMES.ctoOfficeStrategist);
  for (const key of ['octoStrategyOps', 'chiefOfStaffCTO', 'productStrategyAI', 'corpStrategyVendor']) {
    const { doc } = B.optimizeResume({ profile, bank, job: F.POSTINGS[key] });
    assert.ok(!doc.skills.some((s) => /^(?:for|with|to|by|at|in|of)\b/i.test(s)), key);
    assert.ok(!doc.skills.includes('AI strategy (AI)'), key);
    assert.ok(!doc.skills.includes('technical due diligence (M&A)'), key);
    assert.ok(doc.skills.length >= 6 && doc.skills.length <= 15, key);
  }
});

test('an optimizer cannot turn a strategy consultant into a director or create management experience', () => {
  const bank = bankFor(F.RESUMES.ctoOfficeStrategist);
  const out = B.optimizeResume({ profile, bank, job: F.POSTINGS.aiStrategyDirector });
  assert.match(out.doc.summary, /^Technology Strategy Consultant/);
  assert.doesNotMatch(out.doc.summary, /12 years|15 years|years in transformation|Director/);
  assert.ok(out.checks.some((c) => /12\+ years/.test(c)));
  assert.ok(out.checks.some((c) => /managing people/.test(c)));
  const manager = B.optimizeResume({ profile, bank, job: F.POSTINGS.techStrategyManagerBig4 });
  assert.ok(manager.checks.some((c) => /managing project teams/.test(c)), 'surfaces an important requirement the ATS skill score misses');
  const corporate = B.optimizeResume({ profile, bank, job: F.POSTINGS.corpStrategyVendor });
  assert.ok(!corporate.checks.some((c) => /tier management consulting/.test(c)), 'top-tier must not become an invented experience field');
});

test('dated career gaps are not presented as years of experience in a strategy summary', () => {
  const bank = bankFor('Experience\nStrategy Analyst, First Company, Jan 2010 - Jan 2011\n- Built business cases for 4 investment decisions\nStrategy Consultant, Second Company, Jan 2020 - Jan 2022\n- Developed technology roadmaps for 3 clients\nEducation\nB.S. Economics, State University, 2009\nSkills\nExcel, PowerPoint, business cases');
  const { doc } = B.optimizeResume({ profile, bank, job: F.POSTINGS.techStrategyManagerBig4 });
  assert.match(doc.summary, /3 years of experience/);
  assert.doesNotMatch(doc.summary, /12 years/);
});

test('certifications survive import, baseline and optimization, including older bank schemas', () => {
  const source = F.RESUMES.ctoOfficeStrategist + '\nCertifications\nProject Management Professional (PMP), PMI, 2024';
  const bank = bankFor(source);
  const job = { title: 'Technology Strategy Manager', text: 'Requirements\n- PMP certification required\n- Technology strategy experience\n- Bachelor\'s degree' };
  const { doc } = B.optimizeResume({ profile, bank, job });
  assert.deepEqual(doc.certifications, ['Project Management Professional (PMP), PMI, 2024']);
  assert.deepEqual(B.baselineDoc({ profile, bank, job }).certifications, doc.certifications);
  const score = atsScore(job, htmlToText(R.renderHtml(doc)), { profile });
  assert.ok(!score.knockouts.some((k) => /PMP/.test(k)));
  assert.deepEqual(B.parseResume('Certifications: PMP, 2024').certifications, ['PMP, 2024']);
  const legacy = bankFor(F.RESUMES.ctoOfficeStrategist);
  delete legacy.certifications;
  assert.doesNotThrow(() => B.optimizeResume({ profile, bank: legacy, job }));
});

test('a strategy manager keeps separate MBA and bachelor degrees with their own schools and dates', () => {
  const bank = bankFor(DEEP.RESUMES.techStrategyManager);
  const { doc } = B.optimizeResume({ profile, bank, job: DEEP.POSTINGS.cioAdvisoryManager });
  assert.equal(doc.education.length, 2);
  assert.deepEqual(doc.education.map((e) => [e.school, e.degree, e.dates]), [
    ['University of Michigan', 'MBA', '2016'],
    ['Penn State', 'B.S. Computer Science', '2013'],
  ]);
});

test('hidden roles and internships stay off a one-click strategy resume', () => {
  const bank = bankFor(F.RESUMES.ctoOfficeStrategist);
  bank.experiences.push({ id: 'excluded', title: 'Strategy Director', organization: 'Hidden', dates: '2025 - Present', start: '2025', end: 'Present', hidden: true });
  bank.experiences.push({ id: 'intern', title: 'Strategy Intern', organization: 'Early', dates: '2018 - 2019', start: '2018', end: '2019' });
  bank.bullets.push({ id: 'hidden-proof', experienceId: 'excluded', text: 'Managed 20 people and owned a $50M budget', variants: [] });
  bank.bullets.push({ id: 'intern-proof', experienceId: 'intern', text: 'Built competitive analysis for 3 markets', variants: [] });
  const { doc } = B.optimizeResume({ profile, bank, job: F.POSTINGS.chiefOfStaffCTO });
  assert.ok(doc.roles.every((r) => !['excluded', 'intern'].includes(r.experienceId)));
  assert.doesNotMatch(doc.summary, /Director|50M|20 people/);
});
