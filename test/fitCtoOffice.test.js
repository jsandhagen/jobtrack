// One person's search end to end (fixtures/ctoOfficePersona.js): a technology
// strategy consultant in a software vendor's Office of the CTO, ex-Big 4,
// against the jobs they'd look at next and the near misses around them.
//
// First pass, before the changes this persona prompted: 10 of 20 bands, 6 of 8
// orderings. Every in-house role one step up ("Manager, Strategy & Operations,
// Office of the CTO", "Senior Manager, Product Strategy / Competitive
// Intelligence / Technology Partnerships") was capped as a stretch at 44 or
// less: "CTO" in a title read as an executive role, and "Senior Manager" as a
// director whatever the years asked. The resume parser also lost the employer
// ("Consultant, Office of the CTO, Appian" read Office of the CTO as the company).
// The misses left are within a few points of their band.
const test = require('node:test');
const assert = require('node:assert');
const { localFitScore, titleLevel } = require('../src/main/localFit');
const { parseResume } = require('../src/main/bullets');
const F = require('./fixtures/ctoOfficePersona');

const fit = (r, p) => localFitScore(F.POSTINGS[p], [{ kind: 'resume', text: F.RESUMES[r] }], F.PROFILE);

test('CTO-office strategist: nearly every band met, none far off', () => {
  const wrong = [];
  for (const [r, p, lo, hi, why] of F.BANDS) {
    const v = fit(r, p).score;
    if (v < lo - 15 || v > hi + 15) assert.fail(`${r} → ${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${r} → ${p}: ${v}`);
  }
  assert.ok(wrong.length <= 7, `${wrong.length} of ${F.BANDS.length} outside their band: ${wrong.join('; ')}`);
});

test('CTO-office strategist: their list ranks the way they would rank it', () => {
  const wrong = F.RANKS.filter(([r, a, b]) => !(fit(r, a).score > fit(r, b).score));
  assert.ok(wrong.length <= 1, wrong.map((x) => x.join(' ')).join('; '));
});

test('CTO-office strategist: one step up is not a stretch, and the near misses stay below "Good potential"', () => {
  for (const p of ['octoStrategyOps', 'productStrategyAI', 'competitiveIntel', 'techPartnerships']) {
    const f = fit('ctoOfficeStrategist', p);
    assert.ok(f.score >= 60 && !/stretch/i.test(f.label), `${p}: ${f.score} ${f.label} — ${f.headline}`);
  }
  for (const p of ['aiStrategyDirector', 'productTechStrategyGVP', 'fieldCTO']) assert.match(fit('ctoOfficeStrategist', p).label, /stretch/i, p);
  for (const p of ['appianDeveloper', 'pegaArchitect', 'solutionsConsultant', 'enterpriseAE', 'backendEngineer', 'productMarketing']) {
    const f = fit('ctoOfficeStrategist', p);
    assert.ok(f.score < 45, `${p}: ${f.score} — ${f.headline}`);
  }
  assert.match(fit('ctoOfficeStrategist', 'solutionsConsultant').headline, /sales job/);
});

test('who a team serves is not its level; manager ranks follow the years asked', () => {
  assert.equal(titleLevel('Manager, Strategy & Operations, Office of the CTO'), 4);
  assert.equal(titleLevel('Strategy Analyst, Office of the Chief Technology Officer'), null);
  assert.equal(titleLevel('Operations Manager, reporting to the CEO'), 4);
  assert.equal(titleLevel('CTO'), 6);
  assert.equal(fit('ctoOfficeStrategist', 'productStrategyAI').postingLevel, 'staff/lead', 'a Senior Manager asking for 6+ years');
  assert.equal(fit('ctoOfficeStrategist', 'aiStrategyDirector').postingLevel, 'director');
});

test('a role line with a team before the employer keeps the employer', () => {
  const ex = parseResume(F.RESUMES.ctoOfficeStrategist).experiences;
  assert.deepEqual(
    ex.map((e) => [e.title, e.organization]),
    [
      ['Technology Strategy Consultant, Office of the CTO', 'Appian'],
      ['Technology Strategy Engineer, Office of the CTO', 'Appian'],
      ['Analyst, Technology Strategy & Transformation', 'Deloitte Consulting'],
    ],
  );
  const one = (line) => parseResume(`Experience\n${line}\n- Did a thing`).experiences[0];
  assert.deepEqual([one('Senior Engineer, Bloom Labs, Portland, OR, Jan 2020 – Present').organization, one('Senior Engineer, Bloom Labs, Portland, OR, Jan 2020 – Present').location], ['Bloom Labs', 'Portland, OR']);
  assert.equal(one('Consultant, Deloitte Consulting, Arlington, Jan 2020 – Present').organization, 'Deloitte Consulting', 'a company name is not a team');
  assert.equal(one('Product Manager, Ledgerline, Mar 2021 – Present').organization, 'Ledgerline');
});

test('working at a software vendor is enterprise software experience; using its product is not', () => {
  const posting = { title: 'Strategy Manager', text: 'Requirements\n- 5+ years of experience in strategy\n- Experience in enterprise software or SaaS\n- Bachelor\'s degree' };
  const vendor = localFitScore(posting, [{ kind: 'resume', text: 'Experience\nStrategy Manager, Appian, Jul 2020 – Present\n- Led strategy work for the CTO\nEducation\nB.A. Economics, 2015' }]);
  const user = localFitScore(posting, [{ kind: 'resume', text: 'Experience\nStrategy Manager, Acme Retail, Jul 2020 – Present\n- Led strategy work; managed vendors including Appian and Salesforce\nEducation\nB.A. Economics, 2015' }]);
  assert.ok(!vendor.missingSkills.some((s) => /enterprise software/i.test(s)), JSON.stringify(vendor.missingSkills));
  assert.ok(user.missingSkills.some((s) => /enterprise software/i.test(s)), JSON.stringify(user.missingSkills));
});

// ---------- held out (fixtures/ctoOfficeHoldout.js) ----------
// First pass, before the fixes they prompted: 10 of 16 bands, 5 of 7
// orderings; a sales-analytics manager role read as a strong fit (74, "you
// meet all 3 must-haves") while an applied-AI strategy role read 56; the
// LinkedIn PDF export lost the employer and the current role's description.
const H = require('./fixtures/ctoOfficeHoldout');
const hfit = (p, text = F.RESUMES.ctoOfficeStrategist) => localFitScore(H.POSTINGS[p], [{ kind: 'resume', text }], F.PROFILE);

test('held out: nearly every band met, none far off, and the order holds', () => {
  const wrong = [];
  for (const [p, lo, hi, why] of H.BANDS) {
    const v = hfit(p).score;
    if (v < lo - 15 || v > hi + 15) assert.fail(`${p}: ${v} far outside [${lo}, ${hi}] (${why})`);
    if (v < lo || v > hi) wrong.push(`${p}: ${v}`);
  }
  assert.ok(wrong.length <= 4, wrong.join('; '));
  const order = H.ORDER.filter(([a, b]) => !(hfit(a).score > hfit(b).score));
  assert.ok(order.length <= 1, order.map((x) => x.join(' ')).join('; '));
});

test('held out: "analytics" experience is data work, and "SQL and Tableau or Power BI" is two requirements', () => {
  const f = hfit('salesIntelAIStrategy');
  assert.ok(f.score < 50, `${f.score} ${f.headline}`);
  assert.ok(f.missingSkills.some((s) => /analytics/.test(s)), JSON.stringify(f.missingSkills));
  const { requirementUnits } = require('../src/main/localFit');
  const labels = (line) => requirementUnits({ title: 'Analyst', text: `Requirements\n- ${line}` }).units.map((u) => u.label);
  assert.deepEqual(labels('Expert SQL and Tableau or Power BI').sort(), ['SQL', 'one of Tableau, Power BI']);
  assert.deepEqual(labels('Python or SAS, and SQL').sort(), ['SQL', 'one of Python, SAS']);
  assert.deepEqual(labels('Python, R and SAS or similar tools'), ['one of Python, R, SAS']);
  // A large language model is generative AI; "technology roles" is the kind of experience again.
  const ai = hfit('appliedAIStrategyOps');
  assert.ok(ai.score >= 70 && !ai.missingSkills.some((s) => /language models|technology roles/.test(s)), `${ai.score} ${JSON.stringify(ai.missingSkills)}`);
});

test('held out: the same person as a LinkedIn PDF export or a two-line layout parses to the same roles', () => {
  const roles = (text) => parseResume(text).experiences.map((e) => [e.title, e.organization.replace(/ Corporation| Consulting LLP| Consulting$/, ''), e.bullets.length > 0]);
  const want = [
    ['Technology Strategy Consultant, Office of the CTO', 'Appian', true],
    ['Technology Strategy Engineer, Office of the CTO', 'Appian', true],
    ['Analyst, Technology Strategy & Transformation', 'Deloitte', true],
  ];
  assert.deepEqual(roles(H.RESUMES.ctoOfficeLinkedInPdf), want);
  assert.deepEqual(roles(H.RESUMES.ctoOfficeTwoLine), want);
  const li = parseResume(H.RESUMES.ctoOfficeLinkedInPdf);
  assert.equal(li.experiences[0].location, 'McLean, Virginia, United States');
  assert.ok(li.experiences[0].bullets.length >= 5, 'a LinkedIn description becomes one bullet per sentence');
  assert.deepEqual(li.skills, ['Technology Strategy', 'Competitive Analysis', 'Generative AI']);
  assert.deepEqual(parseResume(H.RESUMES.ctoOfficeTwoLine).education.map((e) => [e.school, e.degree]), [['University of Virginia', 'B.S. Systems Engineering']]);
  for (const [p, tol] of H.FORMAT) {
    const main = hfit(p).score;
    // The LinkedIn export has no full skills list, so a role that asks for listed skills may read lower.
    assert.ok(Math.abs(hfit(p, H.RESUMES.ctoOfficeTwoLine).score - main) <= tol, `two-line ${p}`);
    assert.ok(Math.abs(hfit(p, H.RESUMES.ctoOfficeLinkedInPdf).score - main) <= (p === 'bizOpsEngineering' ? 15 : tol), `LinkedIn ${p}`);
  }
});

// ---------- the application itself ----------

test('ATS: "N+ years in A, B, C, or similar roles" lists alternatives, not one knockout per item', () => {
  const { atsScore } = require('../src/main/atsScore');
  const r = atsScore(H.POSTINGS.soOctoSecurity, F.RESUMES.ctoOfficeStrategist, {});
  assert.deepEqual(r.knockouts, []);
  assert.ok(!r.tips.some((t) => /account management|strategy & operations/.test(t)), r.tips.join(' / '));
  assert.ok(r.score >= 60, `${r.score} ${r.grade}`);
});

test('the free resume: every bullet when the page has room, and a skills grid of your words', () => {
  const B = require('../src/main/bullets');
  const bank = B.mergeIntoBank(B.emptyBank(), parseResume(F.RESUMES.ctoOfficeStrategist), { id: 'r', name: 'Resume' }).bank;
  for (const p of [F.POSTINGS.chiefOfStaffCTO, F.POSTINGS.emergingTechStrategist, H.POSTINGS.appliedAIStrategyOps]) {
    const sel = B.selectBullets(p, bank, { profile: { name: 'Jordan Avery' } });
    const n = sel.roles.reduce((s, r) => s + r.bullets.length, 0);
    assert.equal(n, bank.bullets.length, `${p.title}: a one-page resume with room keeps all ${bank.bullets.length} bullets (got ${n})`);
    const skills = B.pickSkills(p, bank).all;
    assert.ok(!skills.some((s) => /^(Communication|Collaboration|Problem Solving|Leadership|Financial Services|Public Sector|IT Portfolio Management)$/.test(s)), `${p.title}: ${skills.join(', ')}`);
    const roadmaps = skills.filter((s) => /roadmap/i.test(s));
    assert.ok(roadmaps.length <= 1, `${p.title}: ${roadmaps.join(', ')}`);
  }
});

// ---------- Optimize for ATS, for the Office-of-the-CTO role ----------
// The fit score says whether a job suits you; the ATS check says whether this
// page will be found and pass the screen. For this role the page scored 67 (C)
// with a knockout (program management), and optimizing only re-ordered bullets
// it already had, so the score couldn't move. What moves it is the posting's
// own words, which only the applicant can say are true of them.

test('ATS keywords are phrases a recruiter would search, not words from the company pitch', () => {
  const { postingPhrases, atsScore } = require('../src/main/atsScore');
  const phrases = postingPhrases(F.POSTINGS.octoStrategyOps.text, F.POSTINGS.octoStrategyOps.company);
  for (const want of ['executive presentations', 'quarterly business reviews', 'board materials']) assert.ok(phrases.includes(want), `${want}: ${phrases.join(', ')}`);
  const missing = atsScore(F.POSTINGS.octoStrategyOps, F.RESUMES.ctoOfficeStrategist, {}).missingKeywords;
  for (const junk of ['comfort', 'excellence', 'definition', 'bring', 'special', 'materials']) assert.ok(!missing.includes(junk), `${junk} in ${missing.join(', ')}`);
  const W = require('./fixtures/realWorld');
  assert.ok(postingPhrases(W.POSTINGS.seniorAccountant.text).includes('month-end close'));
});

test('the free resume gets a summary made only of what the resume shows', () => {
  const B = require('../src/main/bullets');
  const bank = B.mergeIntoBank(B.emptyBank(), parseResume(F.RESUMES.ctoOfficeStrategist), { id: 'r', name: 'Resume' }).bank;
  const s = B.atsSummary(F.POSTINGS.octoStrategyOps, bank);
  assert.match(s, new RegExp(`^Technology Strategy Consultant, Office of the CTO at Appian, with ${new Date().getFullYear() - 2019} years in technology strategy\\. Experience includes `));
  assert.ok(!/management consulting|program management/i.test(s), s);
  // Every item it lists is on the resume already (in the same words, other forms allowed).
  const items = s.replace(/^.*Experience includes /, '').replace(/\.$/, '').split(/, | and /);
  const resume = F.RESUMES.ctoOfficeStrategist.toLowerCase();
  for (const it of items) assert.ok(resume.includes(it.toLowerCase().replace(/s$/, '')), `${it} isn't on the resume`);
  // "Budget" is not "financial modeling", whatever the dictionary files them under.
  assert.ok(!/budget/i.test(B.atsSummary(F.POSTINGS.chiefOfStaffCTO, bank)));
  // A summary you wrote stays yours.
  assert.equal(B.buildDoc({ profile: {}, bank: { ...bank, summary: 'Mine.' }, job: F.POSTINGS.octoStrategyOps, roles: [] }).doc.summary, 'Mine.');
});

test('ATS gaps point to the closest bullet, and using the exact words (if true) clears the knockout', () => {
  const { atsGaps, atsScore } = require('../src/main/atsScore');
  const p = F.POSTINGS.octoStrategyOps;
  const bullets = parseResume(F.RESUMES.ctoOfficeStrategist).experiences.flatMap((e, r) => e.bullets.map((x, b) => ({ r, b, text: x.text })));
  const { gaps } = atsGaps(p, F.RESUMES.ctoOfficeStrategist, bullets);
  const g = (phrase) => gaps.find((x) => x.phrase === phrase);
  assert.equal(g('program management').type, 'knockout');
  assert.match(g('program management').closest.text, /^Ran the annual technology planning cycle/);
  assert.equal(g('ai adoption').type, 'wording');
  assert.match(g('ai adoption').closest.text, /AI strategy/);
  assert.match(g('board materials').closest.text, /^Prepared board and executive presentations/);
  const before = atsScore(p, F.RESUMES.ctoOfficeStrategist, {});
  const edit = (planning) =>
    F.RESUMES.ctoOfficeStrategist
      .replace('- Ran the annual technology planning cycle for the CTO organization', planning)
      .replace('- Prepared board and executive presentations on AI strategy', '- Prepared board materials and executive presentations on AI strategy and AI adoption')
      .replace('with product and engineering', 'with product and engineering leaders');
  const nearly = atsScore(p, edit('- Program-managed the annual technology planning cycle and quarterly business reviews for the CTO organization'), {});
  const exact = atsScore(p, edit('- Led program management for the annual technology planning cycle and quarterly business reviews of the CTO organization'), {});
  assert.equal(before.knockouts.length, 1);
  assert.equal(nearly.knockouts.length, 1, '"program-managed" is not the words a strict system matches');
  assert.equal(exact.knockouts.length, 0);
  assert.ok(exact.score >= before.score + 10 && exact.basic.met === exact.basic.total, `${before.score} ${before.grade} -> ${exact.score} ${exact.grade}`);
});

test('a career that runs to "Present" counts to this year', () => {
  const B = require('../src/main/bullets');
  const bank = B.mergeIntoBank(B.emptyBank(), parseResume(F.RESUMES.ctoOfficeStrategist), { id: 'r', name: 'Resume' }).bank;
  assert.match(B.atsSummary(F.POSTINGS.octoStrategyOps, bank), new RegExp(`with ${new Date().getFullYear() - 2019} years`));
});

test('optimizing never reads worse to an ATS than the resume you started with', () => {
  const B = require('../src/main/bullets');
  const ResumeDoc = require('../src/shared/resumeDoc');
  const { htmlToText } = require('../src/main/resumeRender');
  const { atsScore } = require('../src/main/atsScore');
  const bank = B.mergeIntoBank(B.emptyBank(), parseResume(F.RESUMES.ctoOfficeStrategist), { id: 'r', name: 'Resume' }).bank;
  const profile = { name: 'Jordan Avery', email: 'jordan.avery@example.com', location: 'Washington, DC' };
  const rows = [];
  for (const p of [F.POSTINGS.octoStrategyOps, F.POSTINGS.productStrategyAI, F.POSTINGS.competitiveIntel, F.POSTINGS.chiefOfStaffCTO, F.POSTINGS.corpStrategyVendor, H.POSTINGS.appliedAIStrategyOps, H.POSTINGS.soOctoSecurity]) {
    const sel = B.selectBullets(p, bank, { profile });
    const { doc } = B.buildDoc({ profile, bank, job: p, roles: sel.roles });
    const page = htmlToText(ResumeDoc.renderHtml(ResumeDoc.compact(doc)));
    const before = atsScore(p, F.RESUMES.ctoOfficeStrategist, {}).score;
    const after = atsScore(p, page, {}).score;
    rows.push(`${p.title}: ${before} -> ${after}`);
    assert.ok(after >= before - 1, rows.join('; '));
  }
  // Working at Appian is enterprise software experience; the summary says so where a posting asks.
  assert.match(B.atsSummary(F.POSTINGS.productStrategyAI, bank), /at Appian \(enterprise software\)/);
  assert.doesNotMatch(B.atsSummary(F.POSTINGS.octoStrategyOps, bank), /enterprise software/);
});
