// Renders common resume layouts to PDF with Chromium (real fonts, kerning and
// line wrapping, like a resume exported from a builder or a browser) and
// checks which ones the column detector flags.
// Run with: npm run test:browser
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { analyzePdf } = require('../../src/main/layout');

const bullets = (n) =>
  Array.from({ length: n }, (_, i) => `<li>Built a forecasting model in Python and SQL that cut reporting time by ${10 + i}% for ${i + 2} regional teams across finance</li>`).join('');
const job = (title, dates) => `<div class="row"><b>${title}</b><span>${dates}</span></div><ul>${bullets(4)}</ul>`;
const BASE = 'body{font:10.5pt Arial;margin:36px} .row{display:flex;justify-content:space-between} ul{margin:2px 0 8px 18px;padding:0}';
const page = (css, body) => `<style>${BASE} ${css}</style>${body}`;

// [name, html, should be flagged as multi-column]
const LAYOUTS = [
  [
    'single column, right-aligned dates, 3-across skills grid',
    page('', `<h1>Jordan Rivera</h1><p>jordan@example.com · (555) 123-4567</p><h2>Experience</h2>${job('Senior Analyst, Acme', 'Jan 2020 – Present')}${job('Analyst, Beta Corp', 'Mar 2017 – Dec 2019')}${job('Associate, Gamma LLC', 'Jun 2015 – Feb 2017')}<h2>Skills</h2><div style="display:grid;grid-template-columns:1fr 1fr 1fr">${['Credit Risk', 'Underwriting', 'Stakeholders', 'Risk Analysis', 'Modeling', 'Neural Networks'].map((s) => `<span>● ${s}</span>`).join('')}</div>`),
    false,
  ],
  [
    'single column, centered header',
    page('header{text-align:center}', `<header><h1>Jordan Rivera</h1><p>Portland, OR | jordan@example.com | (555) 123-4567 | linkedin.com/in/jordan</p></header><h2>Summary</h2><p>Quantitative analyst with eight years of experience in credit risk modeling and forecasting.</p><h2>Experience</h2>${job('Senior Analyst, Acme — Portland, OR', 'Jan 2020 – Present')}${job('Analyst, Beta — Seattle, WA', 'Mar 2017 – Dec 2019')}`),
    false,
  ],
  [
    'single column, long 3-across skills grid',
    page('', `<h1>Jordan Rivera</h1><h2>Experience</h2>${job('Senior Analyst, Acme', 'Jan 2020 – Present')}<h2>Skills</h2><div style="display:grid;grid-template-columns:1fr 1fr 1fr">${Array.from({ length: 24 }, (_, i) => `<span>Skill number ${i}</span>`).join('')}</div>`),
    false,
  ],
  [
    'single column, title / location / dates on one line',
    page('.r{display:grid;grid-template-columns:55% 25% 20%}', `<h1>Jordan Rivera</h1><h2>Experience</h2>${['Acme', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta'].map((c) => `<div class="r"><b>Analyst, ${c}</b><span>Portland, OR</span><span>2019 – 2021</span></div><ul>${bullets(2)}</ul>`).join('')}`),
    false,
  ],
  [
    'single column, hanging indent after dates',
    page('p{margin:0 0 4px 0;padding-left:120px;text-indent:-120px}', `<h1>Jordan Rivera</h1>${Array.from({ length: 12 }, (_, i) => `<p>2019 – 2021&nbsp;&nbsp;&nbsp;&nbsp;Senior Analyst at Company ${i}, where I built forecasting models in Python and SQL that cut reporting time</p>`).join('')}`),
    false,
  ],
  [
    'two-column grid',
    page('.g{display:grid;grid-template-columns:1fr 1fr;gap:24px}', `<h1>Jordan Rivera</h1><div class="g"><div><h2>Experience</h2>${job('Senior Analyst', '2020 – Present')}${job('Analyst', '2017 – 2019')}</div><div><h2>Projects</h2>${job('Forecasting', '2021')}${job('Dashboards', '2019')}</div></div>`),
    true,
  ],
  [
    'sidebar + main column',
    page('.g{display:grid;grid-template-columns:170px 1fr;gap:20px} aside p{margin:2px 0}', `<div class="g"><aside><h3>Contact</h3><p>jordan@example.com</p><p>(555) 123-4567</p><h3>Skills</h3>${['Python', 'SQL', 'Tableau', 'Excel', 'R', 'SAS', 'Leadership', 'Spanish', 'Stata', 'Git'].map((s) => `<p>${s}</p>`).join('')}<h3>Education</h3><p>BS Economics</p></aside><main><h1>Jordan Rivera</h1><h2>Experience</h2>${job('Senior Analyst, Acme', 'Jan 2020 – Present')}${job('Analyst, Beta', 'Mar 2017 – Dec 2019')}</main></div>`),
    true,
  ],
  [
    'table: role cell beside bullets cell',
    page('td{vertical-align:top;padding:4px}', `<h1>Jordan Rivera</h1><table><tr><td style="width:30%"><b>Senior Analyst</b><br>Acme<br>2020 – Present</td><td><ul>${bullets(5)}</ul></td></tr><tr><td><b>Analyst</b><br>Beta<br>2017 – 2019</td><td><ul>${bullets(5)}</ul></td></tr></table>`),
    true,
  ],
  [
    'CSS multi-column text',
    page('.c{column-count:2;column-gap:24px}', `<h1>Jordan Rivera</h1><div class="c">${job('Senior Analyst', '2020 – Present')}${job('Analyst', '2017 – 2019')}${job('Associate', '2015 – 2017')}</div>`),
    true,
  ],
];

test('column detection on Chromium-rendered resume layouts', async () => {
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage();
    const wrong = [];
    for (const [name, html, multi] of LAYOUTS) {
      await tab.setContent(html);
      const layout = await analyzePdf(await tab.pdf({ format: 'Letter' }));
      if (layout.columnPages.length > 0 !== multi) wrong.push(`${name}: expected ${multi ? 'columns' : 'single column'}`);
    }
    assert.deepEqual(wrong, []);
  } finally {
    await browser.close();
  }
});
