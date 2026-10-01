const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseResume, mergeIntoBank, emptyBank, rankBullets, selectBullets, buildResume, baselineDoc, similarity, splitHeader } = require('../src/main/bullets');
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

test('Claude polish: only real rewordings of known bullets come back; added facts are held back', async () => {
  const claude = require('../src/main/claude');
  const requests = [];
  const edit = (id, text, changed = true) => ({ id, changed, text, change_summary: 'uses the posting wording' });
  const client = {
    beta: {
      messages: {
        parse: async (p) => (
          requests.push(p),
          {
            stop_reason: 'end_turn',
            parsed_output: {
              edits: [
                edit('0:0', 'Built a React component library and design system'),
                edit('0:1', 'Cut page load time 45% using Next.js'), // adds a number and a tool
                edit('0:2', 'Mentored two junior engineers', false),
                edit('bogus', 'x'),
              ],
            },
          }
        ),
      },
    },
  };
  const bullets = [
    { id: '0:0', text: 'Built a React design system', role: 'Engineer' },
    { id: '0:1', text: 'Improved page load time', role: 'Engineer' },
    { id: '0:2', text: 'Mentored two junior engineers', role: 'Engineer' },
  ];
  const { edits, rejected } = await claude.polishBullets(client, { job: POSTINGS.seniorFrontend, bullets, documents: [{ name: 'r', text: 'Built a React design system' }], profile: {} });
  assert.deepEqual(edits.map((e) => e.id), ['0:0']);
  assert.deepEqual(rejected.map((e) => e.id), ['0:1']);
  assert.match(rejected[0].why, /45/);
  const content = requests[0].messages[0].content;
  assert.match(content, /<bullet id="0:1" role="Engineer">Improved page load time<\/bullet>/);
  assert.match(content, /Keep every fact, number, tool and the level of ownership exactly as written/);
});

test('Claude resume writing is given the bank by id and the hand-picked bullets', async () => {
  const claude = require('../src/main/claude');
  const draft = require('../src/main/draft');
  const bank = { experiences: [{ id: 'e1', title: 'Engineer', organization: 'Bloom Labs', dates: '2020 – Present' }], bullets: [{ id: 'b1', experienceId: 'e1', text: 'Built a design system' }, { id: 'b2', experienceId: 'e1', text: 'Ran on-call' }] };
  const ids = draft.promptIds(bank, [{ experienceId: 'e1', bullets: [{ bulletId: 'b1', text: 'Built a design system' }] }]);
  const requests = [];
  const client = { beta: { messages: { parse: async (p) => (requests.push(p), { stop_reason: 'end_turn', parsed_output: {} }) } } };
  await claude.generateResume(client, { job: POSTINGS.seniorFrontend, documents: [], profile: {}, roles: ids.roles, picked: ids.picked });
  const c = requests[0].messages[0].content;
  assert.match(c, /<role id="R1" kind="job" title="Engineer" organization="Bloom Labs"[^>]*>\n<bullet id="B1">Built a design system<\/bullet>\n<bullet id="B2">Ran on-call<\/bullet>/);
  assert.match(c, /<picked_bullets>\n<role id="R1">\n<bullet_ref id="B1"\/>\n<\/role>/);
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

test('an inline "Skills:" line is a skills list, not part of the last bullet', () => {
  const p = parseResume('Experience\nWeb Developer, Pine Studio, 2016 - 2019\n- Shipped JavaScript apps for 30+ clients\nSkills: JavaScript, TypeScript, React');
  assert.equal(p.experiences[0].bullets[0].text, 'Shipped JavaScript apps for 30+ clients');
  assert.deepEqual(p.skills, ['JavaScript', 'TypeScript', 'React']);
});

test('the baseline resume is the bank as it stands: every role, bullets in order, hidden ones left out', () => {
  const { bank } = mergeIntoBank(emptyBank(), parseResume(resume('a.txt')), { id: 'a', name: 'a.txt' });
  const hidden = bank.bullets[1];
  hidden.hidden = true;
  const doc = baselineDoc({ profile: { name: 'Jordan Rivera' }, bank, job: POSTINGS.seniorFrontend });
  assert.equal(doc.roles.length, bank.experiences.length);
  const first = bank.experiences.find((e) => e.id === doc.roles[0].experienceId);
  const expected = bank.bullets.filter((b) => b.experienceId === first.id && !b.hidden).map((b) => b.text);
  assert.deepEqual(doc.roles[0].bullets.map((b) => b.text), expected);
  assert.ok(!doc.roles.some((r) => r.bullets.some((b) => b.bulletId === hidden.id)));
  // Skills in your own order, not re-sorted for the posting.
  assert.deepEqual(doc.skills, bank.skills);
});

// ---------- fitting the page ----------

const ResumeDoc = require('../src/shared/resumeDoc');
const { buildDoc, pickSkills, fitDocToPages } = require('../src/main/bullets');

// A long career: 6 jobs, 8 bullets each, plenty to choose from.
function bigBank({ years = 12, extra = [], strongRoles = 2, perRole = 3, roles = 6 } = {}) {
  const bank = emptyBank();
  const now = new Date().getFullYear();
  const filler = [
    'Partnered with product managers to plan quarterly roadmaps and cut scope creep by 20%',
    'Ran weekly demos for 12 stakeholders and turned feedback into prioritized backlog items',
    'Wrote onboarding guides that brought new hires to their first shipped change in 5 days',
    'Reviewed 300+ pull requests a year, focusing on readability and test coverage',
    'Organized a quarterly hack week that produced 3 features later shipped to customers',
    'Reduced flaky CI failures by 60% by isolating slow integration tests into a nightly job',
  ];
  const strong = [
    'Built a React and TypeScript design system documented in Storybook, used by 40 engineers',
    'Designed GraphQL and REST APIs for the checkout flow serving 2M monthly users',
    'Cut page load time 35% with code splitting, caching and React Server Components',
    'Led accessibility audits to WCAG 2.1 AA across 14 React screens with the design team',
    'Migrated the marketing site to Next.js, raising Lighthouse performance scores from 62 to 95',
    'Wrote TypeScript types for 80 REST API endpoints, catching 30 bugs before release',
  ];
  for (let i = 0; i < roles; i++) {
    const end = i === 0 ? 'Present' : String(now - Math.round((i * years) / roles));
    const start = String(now - Math.round(((i + 1) * years) / roles));
    const e = { id: `e${i}`, title: i % 2 ? 'Frontend Engineer' : 'Senior Frontend Engineer', organization: `Company ${i}`, location: 'Portland, OR', start, end, dates: `${start} – ${end}` };
    bank.experiences.push(e);
    const texts = [...(i < strongRoles ? strong.slice(0, perRole).map((s) => `${s} (team ${i})`) : []), ...filler.map((f) => `${f} at Company ${i}`), ...(extra[i] || [])];
    texts.forEach((text, j) => bank.bullets.push({ id: `b${i}-${j}`, experienceId: e.id, text, variants: [] }));
  }
  bank.skills = ['JavaScript', 'TypeScript', 'React', 'GraphQL', 'Storybook', 'Figma', 'Jest', 'Git', 'CSS', 'Node.js', 'Docker', 'Kubernetes', 'Python', 'Go', 'Redis', 'Kafka', 'Terraform'];
  bank.summary = 'Frontend engineer who builds design systems and fast, accessible web apps.';
  bank.education = [{ school: 'Oregon State University', location: 'Corvallis, OR', degree: 'B.S. Computer Science', dates: '2012', details: '' }];
  return bank;
}

const PROFILE = { name: 'Jordan Rivera', email: 'jordan@example.com', phone: '(555) 123-4567', location: 'Portland, OR' };
const pagesOf = (job, bank, roles) => ResumeDoc.measure(buildDoc({ profile: PROFILE, bank, job, roles }).doc);

test('the free optimizer fills exactly one page when one page shows everything the posting asks for', () => {
  const bank = bigBank({ years: 6 });
  const job = POSTINGS.seniorFrontend;
  const sel = selectBullets(job, bank, { profile: PROFILE });
  const m = pagesOf(job, bank, sel.roles);
  assert.equal(sel.pages, 1, sel.why);
  assert.equal(m.pages, 1);
  assert.ok(m.lastPageFill > 0.85, `page only ${Math.round(m.lastPageFill * 100)}% full`);
  // The bullets that prove the requirements are the ones that made it.
  const texts = sel.roles.flatMap((r) => r.bullets.map((b) => b.text)).join('\n');
  for (const s of ['Storybook', 'GraphQL', 'TypeScript']) assert.match(texts, new RegExp(s));
  // Every role is still on the timeline.
  assert.equal(sel.roles.filter((r) => r.bullets.length).length, 6);
});

test('one page is a hard limit when asked for, and two pages is never exceeded', () => {
  // Relevant bullets on every role: more than one page's worth.
  const bank = bigBank({ years: 14, strongRoles: 6, perRole: 6 });
  const job = POSTINGS.seniorFrontend;
  const one = selectBullets(job, bank, { profile: PROFILE, pages: 1 });
  assert.equal(pagesOf(job, bank, one.roles).pages, 1);
  const two = selectBullets(job, bank, { profile: PROFILE, pages: 2 });
  assert.equal(two.pages, 2, two.why);
  assert.equal(pagesOf(job, bank, two.roles).pages, 2);
  const count = (s) => s.roles.reduce((n, r) => n + r.bullets.length, 0);
  assert.ok(count(two) > count(one));
  // "Up to two pages" stays on one when the extra bullets aren't relevant.
  assert.equal(selectBullets(job, bigBank({ years: 6 }), { profile: PROFILE, pages: 2 }).pages, 1);
  // A long career with lots of relevant bullets earns the second page on its own...
  const long = selectBullets(job, bigBank({ years: 20, strongRoles: 8, perRole: 6, roles: 8 }), { profile: PROFILE });
  assert.equal(long.pages, 2, long.why);
  assert.ok(long.fill >= 0.4);
  // ...but not when the second page would be a few lines of spill-over.
  const thin = selectBullets(job, bank, { profile: PROFILE });
  assert.ok(thin.pages === 1 || thin.fill >= 0.4, thin.why);
});

test('a second page only when it earns it: a required skill one page has no room for', () => {
  // The only Storybook bullet is on the oldest role, beyond what one page holds.
  const job = { ...POSTINGS.seniorFrontend, text: POSTINGS.seniorFrontend.text.replace('design systems and Storybook', 'design systems, Storybook and Cypress end-to-end testing') };
  const extra = { 5: ['Wrote the Cypress end-to-end test suite covering 120 checkout scenarios across browsers'] };
  const bank = bigBank({ years: 8, extra });
  // Make the Cypress bullet compete: lots of strong bullets ahead of it.
  const auto = selectBullets(job, bank, { profile: PROFILE });
  const texts = auto.roles.flatMap((r) => r.bullets.map((b) => b.text)).join('\n');
  assert.match(texts, /Cypress/);
  assert.ok(auto.pages <= 2);
  // Twenty jobs can't all fit on one page: the oldest are left off, and it says so.
  const many = bigBank({ years: 25, roles: 20 });
  const sel1 = selectBullets(job, many, { profile: PROFILE, pages: 1 });
  assert.equal(pagesOf(job, many, sel1.roles).pages, 1);
  assert.ok(sel1.roles.length < 20 && sel1.roles[0].experienceId === 'e0');
  assert.match(sel1.why, /oldest roles/);
  // Without that requirement, the same bank stays on one page.
  assert.equal(selectBullets(POSTINGS.seniorFrontend, bigBank({ years: 8 }), { profile: PROFILE }).pages, 1);
});

test('skills: the posting\'s asks you can back up first, in its wording, the grid filled out, nothing you don\'t have', () => {
  const bank = bigBank();
  bank.skills.push('Postgres');
  bank.bullets.push({ id: 'pg', experienceId: 'e0', text: 'Moved reporting from MySQL to PostgreSQL, cutting query time 40%', variants: [] });
  const job = { title: 'Frontend Engineer', company: 'Acme', text: 'Requirements\n- React and TypeScript\n- PostgreSQL\n- Experience with Storybook\nNice to have\n- Vue\n- Kubernetes' };
  const { relevant, all } = pickSkills(job, bank);
  assert.deepEqual(relevant.slice(0, 4), ['React', 'TypeScript', 'PostgreSQL', 'Storybook']);
  assert.ok(relevant.includes('Kubernetes'));
  assert.ok(!all.includes('Vue'), 'never a skill your documents lack');
  assert.ok(!all.includes('Postgres'), '"Postgres" is redundant next to "PostgreSQL"');
  assert.equal(all.length % 3, 0, 'complete rows of three');
  assert.ok(all.length >= 9 && all.length <= 15);
  // A posting asking for MySQL doesn't get "MySQL" from someone whose documents only say PostgreSQL.
  const b2 = bigBank();
  b2.bullets.push({ id: 'pg', experienceId: 'e0', text: 'Tuned PostgreSQL queries, cutting report time 40%', variants: [] });
  assert.ok(!pickSkills({ text: 'Requirements\n- MySQL' }, b2).all.includes('MySQL'));
});

test('trimming an edited resume to a page count drops the weakest bullets and keeps the only proof of each requirement', () => {
  const bank = bigBank({ years: 14, strongRoles: 6, perRole: 6 });
  const job = POSTINGS.seniorFrontend;
  // Everything in the bank on the page: far too long.
  const { doc } = buildDoc({ profile: PROFILE, bank, job, roles: bank.experiences.map((e) => ({ experienceId: e.id, bullets: bank.bullets.filter((b) => b.experienceId === e.id).map((b) => ({ bulletId: b.id, text: b.text })) })) });
  doc.roles[3].bullets.push({ bulletId: null, text: 'Wrote the Cypress end-to-end suite for checkout' });
  doc.skills.push('Gardening', 'Chess', 'Juggling');
  const cypressJob = { ...job, text: job.text.replace('Storybook', 'Storybook and Cypress') };
  assert.ok(ResumeDoc.measure(doc).pages > 2);
  const out = fitDocToPages(doc, cypressJob, bank, 1);
  assert.equal(out.pages, 1);
  assert.equal(ResumeDoc.measure(out.doc).pages, 1);
  assert.ok(out.removed.length > 10);
  assert.ok(out.doc.roles.every((r) => r.bullets.length >= 1), 'every role keeps a bullet');
  assert.ok(out.doc.roles.some((r) => r.bullets.some((b) => /Cypress/.test(b.text))), 'the only Cypress bullet stays');
  assert.ok(['Gardening', 'Chess', 'Juggling'].every((s) => out.skills.includes(s)), 'off-topic skills go first');
  assert.ok(out.doc.skills.includes('React'));
  // Too many roles for one page even at a bullet each: the oldest go.
  const many = bigBank({ years: 25, roles: 22 });
  const crowded = buildDoc({ profile: PROFILE, bank: many, job, roles: many.experiences.map((e) => ({ experienceId: e.id, bullets: many.bullets.filter((b) => b.experienceId === e.id).slice(0, 2).map((b) => ({ bulletId: b.id, text: b.text })) })) }).doc;
  const cut = fitDocToPages(crowded, job, many, 1);
  assert.equal(cut.pages, 1);
  assert.ok(cut.roles.length > 0);
  assert.equal(cut.doc.roles[0].organization, 'Company 0', 'the newest roles stay');
  // Already short enough: nothing changes.
  const again = fitDocToPages(out.doc, cypressJob, bank, 1);
  assert.equal(again.removed.length, 0);
});

test('trimming leaves half a line to spare, and sizes to how this computer draws the page', () => {
  const bank = bigBank({ years: 14, strongRoles: 6, perRole: 6 });
  const job = POSTINGS.seniorFrontend;
  const { doc } = buildDoc({ profile: PROFILE, bank, job, roles: bank.experiences.map((e) => ({ experienceId: e.id, bullets: bank.bullets.filter((b) => b.experienceId === e.id).map((b) => ({ bulletId: b.id, text: b.text })) })) });
  const out = fitDocToPages(doc, job, bank, 1);
  const m = ResumeDoc.measure(out.doc);
  assert.ok(m.height <= m.pageHeight - m.lineHeight / 2, `${m.height.toFixed(1)}pt leaves room on a ${m.pageHeight.toFixed(1)}pt page`);
  // A computer that draws the page 6% taller: the trim goes further, and fits there.
  const tall = fitDocToPages(doc, job, bank, 1, { scale: 1.06 });
  assert.ok(ResumeDoc.fits(tall.doc, 1, { scale: 1.06 }));
  assert.ok(tall.removed.length > out.removed.length);
  // The free optimizer sizes to it too.
  const sel = selectBullets(job, bank, { profile: PROFILE, pages: 1, scale: 1.06 });
  assert.ok(ResumeDoc.fits(buildDoc({ profile: PROFILE, bank, job, roles: sel.roles }).doc, 1, { scale: 1.06 }));
});
