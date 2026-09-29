const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseResume, mergeIntoBank, emptyBank, rankBullets, selectBullets, buildResume, similarity, splitHeader } = require('../src/main/bullets');
const { atsScore } = require('../src/main/atsScore');
const { renderResumeHtml, htmlToText } = require('../src/main/resumeRender');
const { POSTINGS } = require('./fixtures/fitCases');

const resume = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'resumes', n), 'utf8');

function bankFromBoth() {
  let r = mergeIntoBank(emptyBank(), parseResume(resume('a.txt')), { id: 'a', name: 'a.txt' });
  const first = r;
  r = mergeIntoBank(r.bank, parseResume(resume('b.txt')), { id: 'b', name: 'b.txt' });
  return { bank: r.bank, first, second: r };
}

test('parses "Title, Company, Dates" resumes with dash bullets', () => {
  const p = parseResume(resume('a.txt'));
  assert.equal(p.experiences.length, 2);
  assert.deepEqual([p.experiences[0].title, p.experiences[0].organization, p.experiences[0].dates], ['Senior Frontend Engineer', 'Bloom Labs', '2019 – Present']);
  assert.equal(p.experiences[0].bullets.length, 4);
  assert.equal(p.education[0].degree, 'B.S. Computer Science');
  assert.ok(p.skills.includes('TypeScript'));
  assert.match(p.summary, /design systems/);
});

test('parses two-line headers, wrapped bullets and projects', () => {
  const p = parseResume(resume('b.txt'));
  const [bloom, pine, project] = p.experiences;
  assert.deepEqual([bloom.title, bloom.organization, bloom.location], ['Frontend Engineer', 'Bloom Labs', 'Portland, OR']);
  assert.equal(bloom.bullets[0].text, 'Led the Petal design system in React + TypeScript, now used by 40 engineers on six product teams');
  assert.ok(!bloom.bullets[2].text.includes('Pine Studio'), 'the next company line is not glued onto a bullet');
  assert.deepEqual([pine.title, pine.organization], ['Web Developer', 'Pine Studio']);
  assert.equal(project.isProject, true);
});

test('merging two resumes: same roles combine, reworded bullets become alternative wordings', () => {
  const { bank, first, second } = bankFromBoth();
  assert.equal(first.added, 6);
  assert.equal(second.merged, 3);
  assert.equal(second.roles, 1, 'only the project is a new role');
  const design = bank.bullets.find((b) => b.text.startsWith('Built a React'));
  assert.equal(design.variants.length, 1);
  assert.match(design.variants[0], /Petal design system/);
  assert.equal(bank.education.length, 1, 'the same degree written two ways is one entry');
  assert.equal(bank.education[0].school, 'Oregon State University');
  // Re-importing the same resume adds nothing.
  const again = mergeIntoBank(bank, parseResume(resume('a.txt')), { name: 'a.txt' });
  assert.equal(again.added, 0);
});

test('similarity separates rewordings from different accomplishments', () => {
  assert.ok(similarity('Cut page load time 35% with code splitting', 'Reduced page load time by 35% through code splitting') > 0.62);
  assert.ok(similarity('Built a React design system used by 40 engineers', 'Mentored 4 junior engineers') < 0.3);
});

test('header splitting handles "Company — Title" order and "at"', () => {
  assert.deepEqual(splitHeader('Registered Nurse at St. Mary\'s Hospital').title, 'Registered Nurse');
  const h = splitHeader('Contoso Health — Staff Accountant');
  assert.deepEqual([h.title, h.organization], ['Staff Accountant', 'Contoso Health']);
});

test('ranking puts bullets that prove required skills first, and picks the best wording', () => {
  const { bank } = bankFromBoth();
  const { ranked, evidence } = rankBullets(POSTINGS.seniorFrontend, bank);
  assert.match(ranked[0].text, /design system/);
  assert.ok(ranked[0].covers.some((c) => c.label === 'React'));
  const gql = evidence.find((e) => e.label === 'GraphQL');
  assert.match(gql.bullet.text, /GraphQL/);
  assert.equal(evidence.find((e) => e.label === 'Storybook').bullet, null);
});

test('selection covers different requirements and gives every role enough bullets', () => {
  const { bank } = bankFromBoth();
  const { roles, coverage } = selectBullets(POSTINGS.seniorFrontend, bank);
  const bloom = roles.find((r) => bank.experiences.find((e) => e.id === r.experienceId).organization === 'Bloom Labs');
  assert.ok(bloom.bullets.length >= 3);
  assert.ok(roles.every((r) => r.bullets.length >= 1));
  const covered = coverage.filter((c) => c.covered).map((c) => c.label);
  for (const s of ['React', 'TypeScript', 'GraphQL', 'REST APIs']) assert.ok(covered.includes(s), s);
});

test('a resume built from bullets is complete, notes gaps, and scores well on the ATS check', () => {
  const { bank } = bankFromBoth();
  const job = POSTINGS.seniorFrontend;
  const { roles } = selectBullets(job, bank);
  const r = buildResume({ profile: { name: 'Jordan Rivera', email: 'jordan@example.com', phone: '(555) 123-4567' }, bank, job, roles });
  assert.equal(r.name, 'Jordan Rivera');
  assert.equal(r.experience[0].organization, 'Bloom Labs');
  assert.equal(r.projects.length, 1);
  assert.equal(r.skills[0].category, 'Relevant skills');
  assert.ok(r.skills[0].items.includes('React'));
  assert.ok(r.tailoring_notes.some((n) => /Storybook/.test(n)));
  const ats = atsScore(job, htmlToText(renderResumeHtml(r)));
  assert.ok(ats.score >= 80, `ATS ${ats.score}`);
});

test('an edited bullet is used as written', () => {
  const { bank } = bankFromBoth();
  const job = POSTINGS.seniorFrontend;
  const { roles } = selectBullets(job, bank);
  roles[0].bullets[0].text = 'Built the Storybook-documented React design system used by 40 engineers';
  const r = buildResume({ profile: { name: 'J' }, bank, job, roles });
  assert.equal(r.experience[0].bullets[0], 'Built the Storybook-documented React design system used by 40 engineers');
  assert.ok(!r.tailoring_notes.some((n) => /Not shown anywhere: .*Storybook/.test(n)));
});

test('Claude polish: only edits for known bullets come back, and the prompt forbids new facts', async () => {
  const claude = require('../src/main/claude');
  const requests = [];
  const client = {
    beta: {
      messages: {
        parse: async (p) => (
          requests.push(p),
          { stop_reason: 'end_turn', parsed_output: { edits: [{ id: 'r1:0', text: 'Built a React design system (Storybook)', why: 'mirrors posting' }, { id: 'bogus', text: 'x', why: '' }] } }
        ),
      },
    },
  };
  const edits = await claude.polishBullets(client, { job: POSTINGS.seniorFrontend, bullets: [{ id: 'r1:0', text: 'Built a React design system', role: 'Engineer' }], documents: [], profile: {} });
  assert.deepEqual(edits.map((e) => e.id), ['r1:0']);
  assert.match(requests[0].messages[0].content, /never add tools, results or responsibilities/);
});

test('Claude resume writing is given the hand-picked bullets', async () => {
  const claude = require('../src/main/claude');
  const requests = [];
  const client = { beta: { messages: { parse: async (p) => (requests.push(p), { stop_reason: 'end_turn', parsed_output: {} }) } } };
  await claude.generateResume(client, { job: POSTINGS.seniorFrontend, documents: [], profile: {}, bullets: [{ role: 'Engineer, Bloom Labs', bullets: ['Built a design system'] }] });
  assert.match(requests[0].messages[0].content, /hand-picked these bullets[\s\S]*Engineer, Bloom Labs:\n- Built a design system/);
});

test('parses a classic Word/Google-Docs resume exported to PDF (split dates, wrapped ● bullets, RELEVANT headings)', () => {
  const p = parseResume(resume('classic.txt'));
  assert.equal(p.experiences.length, 2);
  const [a, b] = p.experiences;
  assert.deepEqual([a.organization, a.location, a.title, a.dates], ['Northwind Insurance', 'Springfield, IL', 'Senior Data Analyst - Pricing and Claims Analytics', 'March 2021 – Current']);
  assert.equal(a.bullets.length, 3);
  assert.match(a.bullets[0].text, /^Built a claims triage model .* across a team of 40 adjusters\.$/);
  assert.deepEqual([b.organization, b.location, b.title, b.dates], ['Contoso Bank', 'Chicago, IL', 'Data Analyst', 'June 2018 – February 2021']);
  assert.equal(b.bullets.length, 2);
  assert.deepEqual(p.skills, ['SQL', 'Python', 'Tableau', 'Statistics', 'Excel', 'Stakeholder Communication']);
  const e = p.education[0];
  assert.deepEqual([e.school, e.location, e.degree, e.dates], ['University of Illinois Springfield', 'Springfield, IL', 'Bachelor of Science in Economics, GPA: 3.6', 'May 2018']);
  assert.deepEqual(e.lines, [{ label: 'Relevant Courses', text: 'Econometrics, Statistics, Data Visualization, Database Systems.' }]);
  assert.match(p.summary, /^Detail-oriented Data Analyst .* business stakeholders$/);
});
