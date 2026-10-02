// Checks the resume length estimate (ResumeDoc.measure) against Chromium's
// real layout of the same template, so the free optimizer's "fits on one
// page" holds in the exported PDF. Uses Liberation Serif, which has the same
// glyph widths as Times New Roman.
// Run with: npm run test:browser
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const ResumeDoc = require('../../src/shared/resumeDoc');

const WORDS = 'built led reduced designed shipped automated forecasting pipeline stakeholders quarterly revenue dashboards migrated cross-functional reporting latency onboarding customers analytics Python SQL Tableau experiments regional teams'.split(' ');
let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const sentence = (n) => {
  const w = Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]);
  return `${w[0][0].toUpperCase()}${w.join(' ').slice(1)} by ${Math.floor(rnd() * 90) + 5}%`;
};

function makeDoc(roles, bulletsPerRole, skills) {
  return {
    header: { name: 'Jordan Q. Rivera', line1: '12 Example Street, Portland, OR | (555) 010-0199', line2: 'jordan.rivera@example.com | linkedin.com/in/jordanrivera' },
    summary: sentence(38),
    titles: {},
    roles: Array.from({ length: roles }, (_, i) => ({
      organization: `Company Number ${i + 1}`,
      location: 'Portland, OR',
      title: i % 2 ? 'Senior Data Analyst' : 'Analytics Engineer, Platform Team',
      dates: `March ${2024 - i * 2} – ${i ? `June ${2025 - i * 2}` : 'Present'}`,
      bullets: Array.from({ length: bulletsPerRole }, () => ({ text: sentence(8 + Math.floor(rnd() * 26)) })),
    })),
    skills: Array.from({ length: skills }, (_, i) => (i % 4 ? WORDS[i % WORDS.length] : 'Stakeholder communication and storytelling')),
    education: [{ school: 'Oregon State University', location: 'Corvallis, OR', degree: 'B.S. Economics, GPA: 3.7', dates: 'May 2016', lines: [{ label: 'Relevant Courses', text: sentence(20) }] }],
    certifications: [],
  };
}

test('the length estimate matches the browser to within a line', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 624, height: 1000 } }); // 6.5in content width
    for (const [roles, per, skills] of [[2, 3, 6], [3, 4, 9], [4, 5, 12], [5, 5, 15], [6, 6, 12]]) {
      const doc = makeDoc(roles, per, skills);
      const css = ResumeDoc.CSS.replace(/"Times New Roman", Tinos, /, '');
      await page.setContent(`<style>html,body{margin:0} ${css}</style><div class="rs-page">${ResumeDoc.renderBody(ResumeDoc.compact(doc))}</div>`);
      const real = (await page.$eval('.rs-body', (el) => el.getBoundingClientRect().height)) * 0.75; // px -> pt
      const est = ResumeDoc.measure(doc);
      assert.ok(Math.abs(est.height - real) <= est.lineHeight, `${roles}×${per}, ${skills} skills: estimated ${est.height.toFixed(0)}pt, browser ${real.toFixed(0)}pt`);
    }
  } finally {
    await browser.close();
  }
});

test('long skills: the estimate still matches and the columns stay even', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 624, height: 1000 } });
    for (const extra of [['Cross-functional stakeholder management and executive communication'], ['AWS/Kubernetes/Terraform/CloudFormation/Datadog', 'Microsoft Power BI (DAX, Power Query, M)']]) {
      const doc = makeDoc(3, 4, 7);
      doc.skills.push(...extra);
      const css = ResumeDoc.CSS.replace(/"Times New Roman", Tinos, /, '');
      await page.setContent(`<style>html,body{margin:0} ${css}</style><div class="rs-page">${ResumeDoc.renderBody(ResumeDoc.compact(doc))}</div>`);
      const real = (await page.$eval('.rs-body', (el) => el.getBoundingClientRect().height)) * 0.75;
      const est = ResumeDoc.measure(doc);
      assert.ok(Math.abs(est.height - real) <= est.lineHeight, `${extra[0]}: estimated ${est.height.toFixed(0)}pt, browser ${real.toFixed(0)}pt`);
      const widths = await page.$$eval('.rs-skills > li', (els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
      assert.equal(new Set(widths).size, 1, `columns: ${widths.join(', ')}`);
      assert.equal(await page.$eval('.rs-page', (el) => el.scrollWidth), 624);
    }
  } finally {
    await browser.close();
  }
});

test('a resume the optimizer sized to one page prints on one page', async () => {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const { selectBullets, buildDoc } = require('../../src/main/bullets');
  const { POSTINGS } = require('../fixtures/fitCases');
  const job = POSTINGS.seniorFrontend;
  // A bank with far more than a page of bullets, several of them relevant.
  const bank = { experiences: [], bullets: [], skills: ['JavaScript', 'TypeScript', 'React', 'GraphQL', 'Storybook', 'Jest', 'CSS', 'Git', 'Figma', 'Node.js'], summary: sentence(30), education: [{ school: 'Oregon State University', location: 'Corvallis, OR', degree: 'B.S. Computer Science', dates: '2012', details: '' }] };
  const now = new Date().getFullYear();
  for (let i = 0; i < 7; i++) {
    const end = i ? String(now - i * 2) : 'Present';
    bank.experiences.push({ id: `e${i}`, title: 'Frontend Engineer', organization: `Company ${i}`, location: 'Portland, OR', start: String(now - i * 2 - 2), end, dates: `${now - i * 2 - 2} – ${end}` });
    for (let j = 0; j < 7; j++) bank.bullets.push({ id: `b${i}${j}`, experienceId: `e${i}`, text: j < 3 ? `Built React and TypeScript features with GraphQL and Storybook for team ${i}, ${sentence(10)}` : sentence(14 + j * 2), variants: [] });
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const pages of [1, 2]) {
      const sel = selectBullets(job, bank, { profile: { name: 'Jordan Rivera', email: 'j@example.com', phone: '555-010-0199' }, pages });
      const { doc } = buildDoc({ profile: { name: 'Jordan Rivera', email: 'j@example.com', phone: '555-010-0199' }, bank, job, roles: sel.roles });
      await page.setContent(ResumeDoc.renderHtml(ResumeDoc.compact(doc)).replace('"Times New Roman", Tinos, ', ''));
      let printed = 0;
      await pdfParse(await page.pdf({ preferCSSPageSize: true, printBackground: true }), { pagerender: async () => (printed++, '') });
      assert.equal(printed, sel.pages, `asked for ${pages}: estimated ${sel.pages} page(s), printed ${printed}`);
      assert.ok(sel.pages <= pages);
    }
  } finally {
    await browser.close();
  }
});

test('a page break never strands a role header away from its first bullet', async () => {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [roles, per] of [[6, 5], [7, 4], [5, 6], [8, 3], [6, 6]]) {
      const doc = makeDoc(roles, per, 6);
      doc.roles.forEach((r, i) => {
        r.organization = `Employer${i}`;
        r.title = `Title${i}`;
        r.bullets[0].text = `First${i} ${r.bullets[0].text}`;
      });
      await page.setContent(ResumeDoc.renderHtml(ResumeDoc.compact(doc)).replace('"Times New Roman", Tinos, ', ''));
      const texts = [];
      await pdfParse(await page.pdf({ preferCSSPageSize: true }), { pagerender: (p) => p.getTextContent().then((t) => (texts.push(t.items.map((x) => x.str).join(' ')), '')) });
      const pageOf = (s) => texts.findIndex((t) => t.includes(s));
      for (let i = 0; i < roles; i++) {
        const at = [`Employer${i}`, `Title${i}`, `First${i}`].map(pageOf);
        assert.ok(at[0] >= 0 && at.every((p) => p === at[0]), `${roles}×${per}: role ${i}'s employer, title and first bullet print on pages ${at.join(', ')}`);
      }
    }
  } finally {
    await browser.close();
  }
});
