// The posting reader (browser-extension/extract.js) on the awkward pages real
// job sites serve: search pages that carry many postings' data, a teaser in
// the structured data and the full text on the page, a careers-site logo in
// the <h1>, "Show more" buttons, web components, and JSON-LD the way sites
// actually write it (nested under a WebPage, with raw line breaks in strings).
// Run with: npm run test:browser
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { chromium } = require('playwright');

const EXTRACT = path.resolve(__dirname, '../../browser-extension/extract.js');
let browser;
let ctx;
test.before(async () => {
  browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  ctx = await browser.newContext();
});
test.after(async () => browser && browser.close());

async function read(url, html) {
  const p = await ctx.newPage();
  await p.route(url, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await p.goto(url);
  await p.addScriptTag({ path: EXTRACT });
  const out = await p.evaluate(() => globalThis.sproutExtract());
  await p.close();
  return out;
}

const DUTIES = `<h3>Responsibilities</h3><ul>
<li>Run the annual technology planning process and quarterly business reviews</li>
<li>Evaluate emerging technologies and vendors and build business cases</li>
<li>Prepare executive presentations and board materials for the CTO</li></ul>
<h3>Qualifications</h3><ul>
<li>5+ years of experience in strategy, management consulting, or technology strategy</li>
<li>Strong financial modeling skills</li>
<li>Experience with SQL and Excel</li></ul>
<h3>Benefits</h3><p>Hybrid, full-time. Pay range: $135,000 - $165,000. We are an equal opportunity employer.</p>`;
const ld = (obj) => `<script type="application/ld+json">${typeof obj === 'string' ? obj : JSON.stringify(obj)}</script>`;
const job = (over = {}) => ({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Strategy & Operations Manager', hiringOrganization: { '@type': 'Organization', name: 'Brightpath' }, description: `<p>About the role</p>${DUTIES}`, ...over });

test('a search page carrying several postings\' data is not one posting', async () => {
  const many = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: [1, 2, 3].map((i) => ({ '@type': 'ListItem', position: i, item: job({ title: `Strategy Manager ${i}` }) })) };
  const r = await read('https://jobs.example.com/search?q=strategy', `<html><head><title>Strategy jobs</title>${ld(many)}${ld(job({ title: 'Other Role A' }))}${ld(job({ title: 'Other Role B' }))}</head><body><h1>128 strategy jobs</h1><ul><li>Strategy Manager 1</li><li>Strategy Manager 2</li></ul></body></html>`);
  assert.ok(!r.isPosting || !/Other Role|Strategy Manager \d/.test(r.title), JSON.stringify(r.title));
});

test('several postings\' data, and the page shows one of them: that one', async () => {
  const r = await read('https://careers.example.com/jobs/42', `<html><head><title>Corporate Strategy Manager | Caliber</title>${ld([job({ title: 'Account Executive' }), job({ title: 'Corporate Strategy Manager' })])}</head><body><h1>Corporate Strategy Manager</h1>${DUTIES}</body></html>`);
  assert.equal(r.title, 'Corporate Strategy Manager');
});

test('a JobPosting under a WebPage\'s mainEntity, with raw line breaks in its strings, is still read', async () => {
  const raw = `{"@context":"https://schema.org","@type":"WebPage","mainEntity":{"@type":"JobPosting","title":"Chief of Staff, Office of the CTO","hiringOrganization":"Learnwell","description":"<p>About the role</p>${DUTIES.replace(/"/g, '\\"').replace(/<\/li>/g, '</li>\n')}"}}`;
  const r = await read('https://learnwell.example/careers/cos', `<html><head>${ld(raw)}</head><body><div id="app"></div></body></html>`);
  assert.equal(r.title, 'Chief of Staff, Office of the CTO');
  assert.equal(r.company, 'Learnwell');
  assert.ok(r.isPosting && /quarterly business reviews/.test(r.text), r.text);
});

test('a teaser in the structured data and the whole posting on the page: the whole posting', async () => {
  const teaser = job({ description: '<p>The Office of the CTO sets direction for Brightpath\'s 1,200-person technology organization. As Manager, Strategy & Operations, you\'ll drive strategic planning and operational excellence for the CTO and the technology leadership team, and much more…</p>' });
  const r = await read('https://brightpath.example/careers/123', `<html><head>${ld(teaser)}</head><body><header><nav>Home · Jobs</nav></header><main><h1>Strategy & Operations Manager</h1><p>The Office of the CTO sets direction for Brightpath's technology organization.</p>${DUTIES}</main></body></html>`);
  assert.equal(r.company, 'Brightpath');
  assert.match(r.text, /Strong financial modeling skills/);
});

test('a careers site\'s name in the <h1>: the job title comes from the posting', async () => {
  const r = await read('https://careers.acme.example/job/77', `<html><head><title>Senior Manager, Product Strategy | Acme Careers</title><meta property="og:site_name" content="Acme"></head><body><header><h1>Careers at Acme</h1><nav><a>Teams</a><a>Locations</a></nav></header><section class="job"><h2>Senior Manager, Product Strategy</h2><p>Hybrid · New York, NY</p>${DUTIES}</section><footer>© Acme</footer></body></html>`);
  assert.equal(r.title, 'Senior Manager, Product Strategy');
  assert.equal(r.company, 'Acme');
});

test('no <h1>: the tab title gives the job and the company, without "Careers"', async () => {
  const r = await read('https://jobs.northwind.example/p/9', `<html><head><title>Director, Technology Strategy - Northwind Careers</title></head><body><div class="posting">${DUTIES}</div></body></html>`);
  assert.equal(r.title, 'Director, Technology Strategy');
  assert.equal(r.company, 'Northwind');
});

test('button text ("Show more", "Apply now", "Save") stays out of the posting', async () => {
  const r = await read('https://www.linkedin.com/jobs/view/4000000001/', `<html><body><h1 class="top-card-layout__title">Technology Strategy Manager</h1><div class="description__text"><div class="show-more-less-html__markup">${DUTIES}</div><button>Show more</button><button>Show less</button></div><button>Apply now</button><button>Save</button></body></html>`);
  assert.ok(r.isPosting);
  assert.ok(!/^(?:Show (?:more|less)|Apply now|Save)$/m.test(r.text), r.text);
});

test('a posting drawn inside a web component (open shadow root) is found', async () => {
  const html = `<html><head><title>Emerging Technology Strategist | Keystone</title></head><body><job-detail></job-detail><script>
    customElements.define('job-detail', class extends HTMLElement { connectedCallback() { const s = this.attachShadow({ mode: 'open' }); s.innerHTML = ${JSON.stringify(`<h1>Emerging Technology Strategist</h1>${DUTIES}`)}; } });
  </script></body></html>`;
  const r = await read('https://careers.keystone.example/job/5', html);
  assert.ok(r.isPosting, JSON.stringify(r));
  assert.equal(r.title, 'Emerging Technology Strategist');
});

test('a remote posting\'s location says remote and where applicants can live', async () => {
  const r = await read('https://jobs.ashbyhq.com/clearwater/1', `<html><head>${ld(job({ jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'United States' } }))}</head><body></body></html>`);
  assert.match(r.location, /Remote/);
  assert.match(r.location, /United States/);
});

test('an article about writing job descriptions is not a posting', async () => {
  const r = await read('https://blog.example.com/how-to-write-a-job-description', `<html><head><title>How to write a job description (with template)</title></head><body><article><h1>How to write a job description</h1><p>A good job description lists responsibilities, qualifications and benefits. Say whether the role is remote, hybrid or on-site, and include the pay range: candidates are 30% more likely to apply. Requirements should be short.</p><h2>Responsibilities</h2><p>List 5-7 responsibilities. Use "you will" phrasing. Years of experience: keep it honest.</p><h2>Qualifications</h2><p>Separate required from preferred qualifications. Mention equal opportunity. Full-time or part-time?</p><h2>Template</h2><p>Copy our free template below.</p></article></body></html>`);
  assert.equal(r.isPosting, false, r.title);
});

test('LinkedIn profiles: the mobile site and Person data under mainEntity are read', async () => {
  const PERSON = path.resolve(__dirname, '../../browser-extension/person.js');
  const p = await ctx.newPage();
  const url = 'https://m.linkedin.com/in/priya-shah';
  await p.route(url, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head><title>Priya Shah | LinkedIn</title>${ld({ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: 'Priya Shah', jobTitle: 'Chief of Staff to the CTO', worksFor: [{ '@type': 'Organization', name: 'Capital One' }], alumniOf: [{ '@type': 'EducationalOrganization', name: 'University of Virginia' }, { '@type': 'Organization', name: 'Deloitte' }] } })}</head><body></body></html>` }));
  await p.goto(url);
  await p.addScriptTag({ path: PERSON });
  const r = await p.evaluate(() => globalThis.sproutPerson());
  await p.close();
  assert.ok(r.isProfile);
  assert.equal(r.company, 'Capital One');
  assert.deepEqual(r.schools, ['University of Virginia']);
  assert.ok(r.employers.includes('Deloitte'), JSON.stringify(r.employers));
});
