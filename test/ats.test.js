const test = require('node:test');
const assert = require('node:assert');
const { atsScore, libraryAtsScore, hiredScoreStyleGrade, gradeFromQualifications, skillsMatchLabel, degreeLevel } = require('../src/main/atsScore');
const { htmlToText, renderResumeHtml } = require('../src/main/resumeRender');
const claude = require('../src/main/claude');

const JOB = {
  title: 'Senior Frontend Engineer',
  company: 'Acme Co.',
  text: `Senior Frontend Engineer — Acme Co.

Requirements
- 5+ years of experience building web apps
- Strong TypeScript and React skills
- Experience with REST APIs
- Bachelor's degree in Computer Science or equivalent experience

Nice to have
- Amazon Web Services
- Docker

Benefits: health insurance, 401k. Acme is an equal opportunity employer.`,
};

const GOOD = `Jordan Rivera
Senior Frontend Engineer
jordan@example.com · (555) 123-4567

Summary
Frontend engineer with 8 years building React and TypeScript apps.

Skills
TypeScript, React, REST APIs, Amazon Web Services, CSS

Experience
Frontend Engineer, Bloom Labs, 2018 – Present
- Cut page load time 40% by rebuilding the React rendering pipeline
- Led a team of 4 building REST APIs integrations for 12 products
- Shipped a TypeScript design system used by 40 engineers
- Mentored 3 junior engineers

Education
B.S. Computer Science, State University, 2017
${'Additional detail about projects and impact. '.repeat(30)}`;

const WEAK = `Sam Lee
Barista, Bean There, 2021 - 2024
Made coffee and trained new staff.`;

test('a strong, well-formatted resume scores high with grade A or B', () => {
  const r = atsScore(JOB, GOOD);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.ok(['A', 'B'].includes(r.grade), r.grade);
  assert.equal(r.skillsMatch, 'Strong');
  assert.equal(r.knockouts.length, 0);
  assert.equal(r.components.parseability, 100);
  assert.equal(r.components.jobTitle, 100);
});

test('a weak resume scores low, grade D, and lists knockouts and tips', () => {
  const r = atsScore(JOB, WEAK);
  assert.ok(r.score < 40, `score ${r.score}`);
  assert.equal(r.grade, 'D');
  assert.ok(r.knockouts.some((k) => k.startsWith('React')));
  assert.ok(r.tips.some((t) => /^Required: "react". If you've used it/i.test(t)));
  assert.ok(!r.tips.some((t) => /not found|none found/.test(t)), 'tips say what to add, not what is missing');
  assert.ok(r.tips.some((t) => /email/.test(t)));
});

test('strict (literal) keyword rate is lower than the synonym-aware rate when wording differs', () => {
  const r = atsScore(JOB, GOOD.replace('Amazon Web Services', 'AWS').replace(/REST APIs/g, 'RESTful services API'));
  assert.ok(r.strictKeywordRate < r.normalizedKeywordRate, `${r.strictKeywordRate} vs ${r.normalizedKeywordRate}`);
  assert.ok(r.wordingTerms.includes('amazon web services'));
});

test('benefits / EEO boilerplate and the company name are not treated as keywords', () => {
  const r = atsScore(JOB, GOOD);
  for (const w of ['insurance', 'health', 'employer', 'acme', 'opportunity']) assert.ok(!r.missingKeywords.includes(w), w);
});

test('education and years are basic qualifications', () => {
  assert.equal(degreeLevel("Master's in Design"), 3);
  assert.equal(degreeLevel('B.S. Computer Science'), 2);
  assert.equal(degreeLevel('Bachelor of Science in Nursing'), 2);
  assert.equal(degreeLevel('Certified Scrum Master'), 0);
  const noDegree = atsScore(JOB, GOOD.replace('B.S. Computer Science', 'Coursework in Computer Science'));
  assert.ok(noDegree.components.education < 100);
  const junior = atsScore(JOB, GOOD.replace('2018 – Present', '2024 – Present'));
  assert.ok(junior.knockouts.some((k) => /years/.test(k)));
});

test('grades follow the HiredScore A–D rules', () => {
  assert.equal(hiredScoreStyleGrade({ basicMet: 5, basicTotal: 5, preferredMet: 2, preferredTotal: 3, score: 80 }), 'A');
  assert.equal(hiredScoreStyleGrade({ basicMet: 5, basicTotal: 5, preferredMet: 0, preferredTotal: 3, score: 80 }), 'B');
  assert.equal(hiredScoreStyleGrade({ basicMet: 3, basicTotal: 5, preferredMet: 3, preferredTotal: 3, score: 90 }), 'C');
  assert.equal(hiredScoreStyleGrade({ basicMet: 1, basicTotal: 5, preferredMet: 0, preferredTotal: 3, score: 20 }), 'D');
  const q = (type, status) => ({ requirement: 'x', type, status, evidence: '' });
  assert.equal(gradeFromQualifications([q('basic', 'met'), q('preferred', 'met')], 85), 'A');
  assert.equal(gradeFromQualifications([q('basic', 'met'), q('basic', 'partial')], 85), 'C');
  assert.equal(gradeFromQualifications([], 85), null);
  assert.equal(skillsMatchLabel(0.65), 'Good');
});

test('library score uses the best resume, or the whole library without format checks', () => {
  const docs = [
    { name: 'old.pdf', kind: 'resume', text: WEAK },
    { name: 'new.pdf', kind: 'resume', text: GOOD },
    { name: 'notes', kind: 'other', text: 'misc' },
  ];
  assert.equal(libraryAtsScore(JOB, docs).basis, 'new.pdf');
  const noResume = libraryAtsScore(JOB, [{ name: 'notes', kind: 'other', text: GOOD }]);
  assert.equal(noResume.components.parseability, null);
  assert.equal(libraryAtsScore(JOB, []), null);
});

test('our rendered resume template parses cleanly', () => {
  const html = renderResumeHtml({
    name: 'Jordan Rivera',
    headline: 'Senior Frontend Engineer',
    contact: ['jordan@example.com', '(555) 123-4567'],
    summary: 'Engineer.',
    skills: [{ category: 'Frontend', items: ['React', 'TypeScript'] }],
    experience: [{ title: 'Engineer', organization: 'Bloom', location: '', dates: '2018 – Present', bullets: ['Cut load time 40%', 'Led 4 people', 'Saved $20k'] }],
    projects: [],
    education: [{ degree: 'B.S.', school: 'State', dates: '2017', details: '' }],
    certifications: [],
    tailoring_notes: [],
  });
  const text = htmlToText(html);
  assert.match(text, /^Relevant Work Experience$/m);
  assert.match(text, /^- Cut load time 40%$/m);
  const r = atsScore(JOB, text);
  const failed = r.formatChecks.filter((c) => !c.ok).map((c) => c.id);
  assert.deepEqual(failed, ['length'], 'only the (deliberately short) length check should fail');
});

test('resume generation passes ATS guidance to Claude', async () => {
  const requests = [];
  const client = { beta: { messages: { parse: async (p) => (requests.push(p), { stop_reason: 'end_turn', parsed_output: {} }) } } };
  const ats = atsScore(JOB, WEAK);
  await claude.generateResume(client, { job: JOB, documents: [{ name: 'r', kind: 'resume', text: WEAK }], profile: {}, analysis: null, ats, roles: [], picked: [] });
  const prompt = requests[0].messages[0].content;
  assert.match(prompt, /<ats_notes>/);
  assert.match(prompt, /typescript/);
  assert.match(prompt, /"Senior Frontend Engineer"/);
});

test('a preferred advanced degree is not treated as required', () => {
  const { degreeRequirements } = require('../src/main/atsScore');
  assert.deepEqual(degreeRequirements("Requirements\n- Bachelor's degree in Economics\nNice to have\n- Master's degree"), { required: 2, preferred: 3 });
  assert.deepEqual(degreeRequirements("- Bachelor's or Master's degree in Finance"), { required: 2, preferred: null });
  assert.deepEqual(degreeRequirements('- MBA preferred'), { required: null, preferred: 3 });
});

test('ATS reads "Master’s" with a curly apostrophe and keeps optional languages out of the knockouts', () => {
  const job = {
    title: 'Quantitative Analytics Senior',
    company: 'Freddie Mac',
    text: `Qualifications:
PhD in economics or a related field, or Master’s degree with 3+ years of relevant experience.
Strong Programming skills is a must! Python and SQL are most frequently used; other useful languages include Java, SAS, MATLAB.
These models must incorporate best practices while accounting for the unique risks of each institution.`,
  };
  const resume = 'Quantitative Risk Analyst June 2022-Current\nPython, SQL\nEDUCATION\nMasters of Economics';
  const r = atsScore(job, resume, { checkFormatting: false });
  assert.deepEqual(r.knockouts, []);
  assert.equal(r.components.education, 100);
  assert.ok(!r.missingSkills.some((m) => m.skill === 'Accounting'));
  assert.ok(r.missingSkills.filter((m) => m.skill === 'Java').every((m) => m.kind === 'preferred'));
});

test('quantified-bullet check reads numbers on a wrapped bullet’s continuation lines', () => {
  const resume = ['● Launched a product estimated to bring', 'an additional $2M annually.', '● Benchmarked against a database of', 'over 30 million entries.', '● Built a model with 97% accuracy.'].join('\n');
  const r = atsScore({ title: 'Analyst', text: 'Requirements\n- SQL' }, resume);
  assert.ok(r.formatChecks.find((c) => c.id === 'quantified').ok);
});

test('ATS treats an "or" list as one qualification but still counts each keyword literally', () => {
  const job = { title: 'Data Analyst', text: 'Requirements\n- Experience with Python, Java, or C++\n- SQL' };
  const met = atsScore(job, 'Python and SQL', { checkFormatting: false });
  assert.deepEqual(met.knockouts, []);
  assert.deepEqual(met.basic, { met: 2, total: 2 });
  assert.equal(met.strictKeywordRate, 50); // python + sql of python, java, c++, sql
  const unmet = atsScore(job, 'SQL only', { checkFormatting: false });
  assert.deepEqual(unmet.knockouts, ['one of Python, Java, C++ (posting says "python / java / c++")']);
  assert.deepEqual(unmet.missingSkills.find((m) => m.anyOf).anyOf, ['python', 'java', 'c++']);
});

// ---- gentle nudges and the fixes Sprout makes itself ----

const { atsNudges } = require('../src/main/atsNudges');
const bulletBank = require('../src/main/bullets');
const SAAS_JOB = {
  title: 'Strategy Manager',
  company: 'Acme',
  text: 'About us\nWe are a fast-growing SaaS company.\nRequirements\n- 5+ years in strategy or consulting at a SaaS company\n- Experience with Kubernetes\n- Strong SQL skills and AWS',
};
const APPIAN = 'Jordan Avery\nExperience\nTechnology Strategy Consultant, Appian, Jul 2022 – Present\n- Wrote SQL analyses of product usage for the CTO\nAnalyst, Deloitte Consulting, Aug 2017 – Jun 2022\n- Built cost models in Excel for CIO clients\nSkills\nSQL, Excel, Amazon Web Services';

test('an industry your employer proves is a word to add, not a missing qualification', () => {
  const r = atsScore(SAAS_JOB, APPIAN);
  assert.deepEqual(r.fixable.map((f) => [f.skill, f.employer]), [['Enterprise Software', 'Appian']]);
  assert.ok(!r.knockouts.some((k) => /enterprise software|saas/i.test(k)));
  assert.ok(r.knockouts.some((k) => /kubernetes/i.test(k)), 'a skill nobody can infer is still required');
});

test('the employer is recognised in Sprout’s own layout too (name on its own line), not in a passing mention', () => {
  const page = 'Jordan Avery\nPROFESSIONAL SUMMARY\nStrategist.\nRELEVANT WORK EXPERIENCE\nTechnology Strategy Consultant Jul 2022 – Present\nAppian\n- Wrote SQL analyses of product usage';
  assert.deepEqual(atsScore(SAAS_JOB, page).fixable.map((f) => f.employer), ['Appian']);
  const mention = 'Jordan\nAnalyst, Deloitte, 2019 – 2022\n- Presented at Appian World on SQL tooling';
  assert.deepEqual(atsScore(SAAS_JOB, mention).fixable, []);
});

test('the optimizer says the industry once in your own summary, beside the employer, and gives the posting’s words beside yours', () => {
  // A summary that doesn't name the employer gets no "SaaS experience at Appian." sentence: a hiring manager reads it as keyword filler.
  const doc = { summary: 'Strategist who turns research into roadmaps.', roles: [{ organization: 'Appian', title: 'Consultant', dates: 'Jul 2022 – Present', bullets: [] }], skills: [] };
  assert.equal(bulletBank.addIndustryWords(doc, SAAS_JOB).added.length, 0);
  assert.equal(doc.summary, 'Strategist who turns research into roadmaps.');
  const named = { summary: 'Consultant at Appian who builds roadmaps.', roles: doc.roles, skills: [] };
  assert.equal(bulletBank.addIndustryWords(named, SAAS_JOB).added[0].term, 'SaaS');
  assert.equal(named.summary, 'Consultant at Appian (SaaS) who builds roadmaps.');
  assert.equal(bulletBank.addIndustryWords(named, SAAS_JOB).added.length, 0, 'once');
  // Not for an employer the list doesn't know.
  const other = { summary: 'Analyst.', roles: [{ organization: 'Deloitte Consulting', dates: '2017 – 2022', bullets: [] }], skills: [] };
  assert.equal(bulletBank.addIndustryWords(other, SAAS_JOB).added.length, 0);
  const skills = bulletBank.pickSkills({ text: 'Requirements\n- AWS experience required' }, { skills: ['Amazon Web Services'], bullets: [], experiences: [] });
  assert.deepEqual(skills.relevant, ['Amazon Web Services (AWS)']);
  assert.deepEqual(skills.reworded, [{ from: 'Amazon Web Services', to: 'Amazon Web Services (AWS)' }]);
});

test('nudges: three at most, kind, and they ask only for what Sprout can’t know', () => {
  const r = atsScore(SAAS_JOB, APPIAN);
  const n = atsNudges({ ats: r, job: SAAS_JOB, pageText: APPIAN, bank: { skills: [], bullets: [] }, onPage: true });
  assert.ok(n.nudges.length <= 3 && n.headline);
  const industry = n.nudges.find((x) => x.id.startsWith('industry:'));
  assert.match(industry.text, /SaaS/);
  assert.equal(industry.action.type, 'fix-page');
  const ask = n.nudges.find((x) => x.id === 'ask:skills');
  assert.deepEqual(ask.action, { type: 'have-skill', terms: ['Kubernetes'] });
  assert.doesNotMatch(n.nudges.map((x) => x.text).join(' '), /knockout|not found|missing/i, 'no cold wording');
  // What Sprout fixed shows while it's still on the page.
  const fixes = [{ term: 'SaaS', text: 'Added “SaaS” to your summary.' }];
  assert.deepEqual(atsNudges({ ats: r, job: SAAS_JOB, pageText: APPIAN + '\nSaaS experience at Appian.', fixes }).fixed, ['Added “SaaS” to your summary.']);
  assert.deepEqual(atsNudges({ ats: r, job: SAAS_JOB, pageText: APPIAN, fixes }).fixed, [], 'gone once you take it out');
  // No page yet: the fix is the optimizer.
  assert.equal(atsNudges({ ats: r, job: SAAS_JOB, pageText: APPIAN, onPage: false }).nudges.find((x) => x.id.startsWith('industry:')).action.type, 'optimize');
});

test('postingRewords offers the posting\'s word for a skill a bullet shows in other words', () => {
  const { postingRewords } = require('../src/main/atsScore');
  const job = {
    title: 'Backend Engineer',
    text: `Requirements:
- 3+ years with PostgreSQL and Amazon Web Services
- Experience with CI/CD pipelines and Kubernetes
- Machine learning a plus
Preferred: deep learning experience`,
  };
  const doc = {
    summary: 'Backend engineer.',
    roles: [
      {
        bullets: [
          { text: 'Moved billing from MySQL to Postgres, cutting query time 40%' },
          { text: 'Ran services on AWS with k8s and automated deploys in Jenkins' },
          { text: 'Trained PyTorch models and an ML ranking pipeline' },
          { text: 'Partnered with distributed systems teams on reliability' },
        ],
      },
    ],
  };
  const out = postingRewords(job, doc);
  const by = new Map(out.map((w) => [w.b, w.text]));
  // A spelling of the same name is replaced; anything else keeps your word beside theirs.
  assert.equal(by.get(0), 'Moved billing from MySQL to PostgreSQL, cutting query time 40%');
  assert.equal(by.get(1), 'Ran services on Amazon Web Services (AWS) with Kubernetes (k8s) and automated deploys in CI/CD (Jenkins)');
  assert.equal(by.get(2), 'Trained deep learning (PyTorch) models and a machine learning (ML) ranking pipeline', 'the article follows the new word');
  assert.ok(!by.has(3), 'an ordinary phrase is a writing job, not a word swap');
  assert.ok(out.every((w) => w.from === doc.roles[0].bullets[w.b].text && w.why));
  // Once the page says it, or you've turned it down, it isn't offered.
  doc.summary = 'Backend engineer with PostgreSQL.';
  assert.ok(!postingRewords(job, doc).some((w) => w.b === 0));
  assert.ok(!postingRewords(job, doc, ['jenkins→CI/CD']).find((w) => w.b === 1).text.includes('Jenkins)'));
});

test('a phrase a skill was recognised from is not offered as a word to add', () => {
  const job = { title: 'Competitive Intelligence Manager', text: 'Requirements\n- Run win/loss analysis and turn deal data into recommendations for executives\n- Experience with SQL and Excel' };
  const resume = 'Experience\nStrategy Consultant, Appian\n- Advised senior leaders across Product and GTM on competitive positioning\n- Built dashboards in SQL and Excel';
  const r = atsScore(job, resume);
  assert.ok(!r.wordingTips.some((w) => /^for /i.test(w.term)), JSON.stringify(r.wordingTips));
  assert.ok(!r.tips.some((t) => /"for executives"/i.test(t)));
});
