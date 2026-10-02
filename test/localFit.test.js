const test = require('node:test');
const assert = require('node:assert');
const { localFitScore, extractTerms, titleLevel, workMode, postingSalaryMax } = require('../src/main/localFit');
const { CANDIDATES, POSTINGS, CASES, ORDERINGS } = require('./fixtures/fitCases');

const score = (c, p) => localFitScore(POSTINGS[p], CANDIDATES[c].documents, CANDIDATES[c].profile);

test('offline fit lands every benchmark case in the expected band', () => {
  const misses = [];
  for (const [c, p, band] of CASES) {
    const r = score(c, p);
    const ok =
      band === 'strong' ? r.score >= 65 : band === 'possible' ? r.score >= 40 && r.score <= 72 : band === 'weak' ? r.score < 45 : r.dealbreakers.length > 0 && r.score <= 30;
    if (!ok) misses.push(`${c}/${p}: expected ${band}, got ${r.score}`);
  }
  assert.deepEqual(misses, []);
});

test('offline fit ranks better matches above worse ones', () => {
  for (const [c, better, worse] of ORDERINGS) {
    assert.ok(score(c, better).score > score(c, worse).score, `${c}: ${better} should beat ${worse}`);
  }
});

test('non-dictionary requirements are discovered (certifications, tools, phrases)', () => {
  const r = score('nurse', 'icuRN');
  assert.ok(r.matchedSkills.includes('BLS') && r.matchedSkills.includes('ACLS'));
  assert.ok(r.missingSkills.includes('CCRN'));
  assert.ok(r.missingSkills.includes('ventilator management'));
  assert.deepEqual(extractTerms('- Current RN license', new Set()), ['RN']);
  assert.ok(extractTerms('- Experience with Epic and Cerner', new Set()).includes('Cerner'));
});

test('dealbreakers: pay, work mode and avoided words', () => {
  assert.equal(postingSalaryMax('Pay: $60,000 - $75,000'), 75000);
  assert.equal(postingSalaryMax('$30 - $40 per hour'), 83200);
  assert.equal(workMode('Frontend Engineer (Remote)'), 'remote');
  assert.equal(workMode('3 days in-office'), 'onsite');
  const r = score('frontend', 'clearance');
  assert.equal(r.label, 'Dealbreaker');
  assert.ok(r.dealbreakers.some((d) => /security clearance/.test(d)));
});

test('seniority is judged only when the title states a level', () => {
  assert.equal(titleLevel('Principal Frontend Architect'), 4);
  assert.equal(titleLevel('Registered Nurse'), null);
  assert.equal(score('nurse', 'telemetryRN').components.seniority, null);
  assert.ok(score('frontend', 'staffFrontend').concerns.some((c) => /years/.test(c)));
});

test('roles well below your level in your own field are not called strong fits', () => {
  const req = `Requirements
- JavaScript, TypeScript and React
- HTML and CSS
- Git and Jest unit tests
Nice to have
- Storybook`;
  const docs = CANDIDATES.frontend.documents;
  const profile = CANDIDATES.frontend.profile;
  // Same work, junior title: every requirement met, but not a strong fit for a senior engineer.
  const junior = localFitScore({ title: 'Junior Frontend Engineer', text: `Junior Frontend Engineer\n${req}` }, docs, profile);
  assert.ok(junior.score < 65, `junior role scored ${junior.score}`);
  assert.ok(junior.concerns.some((c) => /overqualified/.test(c)));
  // No level in the title, but plainly entry level in the text.
  const entry = localFitScore({ title: 'Frontend Engineer', text: `Frontend Engineer\nNew grads welcome!\n${req}` }, docs, profile);
  assert.ok(entry.score < 65, `entry-level role scored ${entry.score}`);
  // The same posting at a level that suits them still scores well.
  const senior = localFitScore({ title: 'Senior Frontend Engineer', text: `Senior Frontend Engineer\n${req}` }, docs, profile);
  assert.ok(senior.score >= 65 && senior.score > junior.score, `senior role scored ${senior.score}`);
  assert.ok(!senior.concerns.some((c) => /overqualified/.test(c)));
  // A career change into a junior role isn't overqualification.
  const switcher = localFitScore({ title: 'Junior Frontend Engineer', text: `Junior Frontend Engineer\n${req}` }, CANDIDATES.nurse.documents, CANDIDATES.nurse.profile);
  assert.ok(!switcher.concerns.some((c) => /overqualified/.test(c)));
});

test('no documents means no score, and confidence reflects what was recognised', () => {
  assert.equal(localFitScore(POSTINGS.seniorFrontend, [], {}).score, 0);
  assert.equal(score('frontend', 'seniorFrontend').confidence, 'high');
  const vague = localFitScore({ title: 'Team Member', text: 'Join our friendly team! Great culture.' }, CANDIDATES.frontend.documents, {});
  assert.equal(vague.confidence, 'low');
});

test('example-language lists, "accounting for", curly apostrophes and EEO text are not required qualifications', () => {
  const job = {
    title: 'Quantitative Analytics Senior',
    company: 'Freddie Mac',
    text: `Your Impact:
Design and code counterparty credit risk models.
These models must incorporate best practices while simultaneously accounting for the unique risks of each institution.
Qualifications:
PhD in economics, finance, statistics, or a related quantitative discipline, or Master’s degree with 3+ years of relevant experience.
Programming languages may include--but are not limited to--Python, R, SQL, and MATLAB.
Strong Programming skills is a must! Python and SQL are most frequently used; other useful languages and software available in the company include Java, SAS, MATLAB, C.
A safe and secure environment is critical. Employees adhere to privacy & security obligations as required via training programs and our acceptable use policy.`,
  };
  const resume = `Quantitative Risk Analyst  June 2022-Current
Built credit risk models in Python, SQL and Snowflake.
EDUCATION
Masters of Economics, May 2022`;
  const r = localFitScore(job, [{ kind: 'resume', text: resume }]);
  assert.deepEqual(r.missingSkills, []);
  assert.deepEqual(r.missingPreferred, ['one of Java, SAS, MATLAB']);
  assert.ok(!r.matchedSkills.includes('Accounting') && !r.missingSkills.includes('Accounting'));
  assert.ok(r.matchedSkills.includes('Programming'));
});

test('"X, Y, or Z" is one requirement that any one of them meets; "X and Y" stays two', () => {
  const job = { title: 'Data Analyst', company: 'Acme', text: 'Requirements\n- Experience with Python, R, or Java\n- SQL and Excel' };
  const r = localFitScore(job, [{ kind: 'resume', text: 'Analyst 2019-2024. Python, SQL.' }]);
  assert.ok(r.matchedSkills.includes('one of Python, R, Java'));
  assert.deepEqual(r.missingSkills, ['Excel']);
});

test('working at a low-code vendor is low-code experience; a skill in the bank counts', () => {
  const job = { title: 'Solutions Engineer', company: 'Acme', text: 'Solutions Engineer\nRequirements:\n- 3+ years of experience with low-code platforms\n- Experience with SQL\n- Experience with Kubernetes\n' };
  const resume = { kind: 'resume', text: 'Jordan Rivera\nEXPERIENCE\nSolutions Consultant\nAppian, 2019 - Present\n- Built case management apps for federal clients\n- Wrote SQL reports for 40 stakeholders\nSKILLS\nSQL, Java' };
  const plain = localFitScore(job, [resume], {});
  assert.ok(plain.matchedSkills.includes('Low-Code / BPM'), 'Appian as an employer shows low-code');
  assert.ok(plain.missingSkills.includes('Kubernetes'));
  // "I have this" adds it to the bullet bank's skills, which count as evidence.
  const claimed = localFitScore(job, [resume, { kind: 'bank', text: 'SQL, Kubernetes' }], {});
  assert.ok(claimed.matchedSkills.includes('Kubernetes'), 'a skill in the bank counts');
  assert.ok(claimed.score > plain.score);
  // Using a vendor's product isn't working there.
  const user = { kind: 'resume', text: 'Jordan Rivera\nEXPERIENCE\nAnalyst\nAcme Bank, 2019 - Present\n- Reviewed vendor demos including Appian and Pega\n- Wrote SQL reports' };
  assert.ok(!localFitScore(job, [user], {}).matchedSkills.includes('Low-Code / BPM'));
});

test('sentence pieces are not requirements; a domain list is one requirement', () => {
  const posting = {
    title: 'Product Marketing Manager, Competitive Intelligence',
    company: 'Acme Data',
    text: `What We're Looking For
- 4-6 years in competitive intelligence, product marketing, or market research, ideally in B2B SaaS
- Proven track record of producing content that sales and marketing actually use — battlecards, competitive decks, objection handling guides
- Storytelling: Proficient in turning complex, technology-heavy topics into digestible, compelling stories that resonate with target audiences
- Cross-functional fluency: has worked closely with sales (win/loss, deal support), product (roadmap and positioning input), and marketing (messaging, launches)
- Domain fit: familiarity with data infrastructure, CDPs, MarTech, or adjacent technical B2B markets.
Bonus If You Have
- Experience in a high-growth or fast-moving market where competitors and positioning shift often.`,
  };
  const resume = `Sr. Technology Strategy Consultant, Office of the CTO — B2B SaaS company   Oct 2021 - Present
- Liaison between the CTO and revenue teams across Sales, Marketing and Customer Success; field feedback into product roadmap and GTM strategy
- Led competitive analysis and market research on rival platforms for executive reports and partner business reviews
- Ran quarterly business reviews across seven strategic partnerships, forecasting partner revenue
Consultant — advisory firm   Aug 2019 - Oct 2021
- Built forecasting models and reporting in SQL and Power BI for Fortune 500 clients`;
  const r = localFitScore(posting, [{ kind: 'resume', text: resume }]);
  const labels = [...r.matchedSkills, ...r.partialSkills, ...r.missingSkills, ...r.matchedPreferred, ...r.missingPreferred];
  for (const junk of ['actually use', 'turning', 'digestible', 'shift often', 'where competitors']) assert.ok(!labels.some((l) => l.includes(junk)), `"${junk}" read as a requirement: ${labels.join(' | ')}`);
  assert.equal(labels.filter((l) => /\bCDP/.test(l) && !/^one of/.test(l)).length, 0, 'CDPs counted apart from its list');
  assert.ok(r.score >= 45, `B2B SaaS strategist with competitive analysis scored ${r.score}`);

  // Doing the job under another title: competitive intelligence, battlecards and
  // positioning as a strategy consultant is the role, and positioning is marketing work.
  const ci = resume.replace(
    '- Led competitive analysis and market research on rival platforms for executive reports and partner business reviews',
    '- Led competitive intelligence for the CTO, tracking competitor launches to produce battlecards, positioning briefs and objection handling guides\n- Prototyped messaging and sales enablement assets from win/loss trends and deal data'
  );
  const done = localFitScore(posting, [{ kind: 'resume', text: ci }]);
  assert.ok(done.components.role >= 80, `role ${done.components.role}`);
  assert.ok(done.matchedSkills.includes('Marketing'), done.matchedSkills.join(' | '));
  assert.ok(done.score >= 65 && done.score > r.score, `competitive intelligence lead scored ${done.score}`);
});

test('the shown score leans generous, but not past a screen or a dealbreaker', () => {
  const { shownFit } = require('../src/main/localFit');
  const { toShown } = require('../src/shared/fitScale');
  // Generous first (50 → 55), then on the grade-like shown scale.
  assert.equal(shownFit({ score: 50, label: 'Good potential', screens: [], dealbreakers: [] }).score, toShown(55));
  assert.equal(shownFit({ score: 76, label: 'Strong match', screens: [], dealbreakers: [] }).label, 'Excellent match');
  assert.equal(shownFit({ score: 76, screens: [], dealbreakers: [] }).calibratedScore, 76);
  assert.equal(shownFit({ score: 40, screens: [{ max: 40, reason: 'x' }], dealbreakers: [] }).score, toShown(40));
  assert.equal(shownFit({ score: 30, screens: [], dealbreakers: ['Onsite'] }).score, toShown(30));
  assert.equal(shownFit({ score: 100, screens: [], dealbreakers: [] }).score, 100);
});
