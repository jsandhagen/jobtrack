const test = require('node:test');
const assert = require('node:assert');
const { analyzeLayout, layoutChecks } = require('../src/main/layout');
const { extractText } = require('../src/main/documents');
const { atsScore } = require('../src/main/atsScore');
const { makePdf, makeDocx, para } = require('./helpers/makeDocs');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rows = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, 740 - i * 14));
const failed = (layout) => layoutChecks(layout).filter((c) => !c.ok).map((c) => c.id);

test('a two-column PDF (sidebar + main column) is flagged', async () => {
  const pdf = makePdf([
    [
      ...rows(24, (i, y) => ({ x: 40, y, text: ['Python', 'SQL', 'Tableau', 'Excel', 'Leadership', 'Spanish'][i % 6] })),
      ...rows(30, (i, y) => ({ x: 210, y, text: `Built dashboards and data pipelines for the finance team, item ${i}` })),
    ],
  ]);
  const layout = await analyzeLayout('r.pdf', pdf);
  assert.deepEqual(layout.columnPages, [1]);
  assert.deepEqual(failed(layout), ['columns']);
});

test('one column with right-aligned dates and a short skills grid is not flagged', async () => {
  const dates = ['Jan 2020 – Present', 'Mar 2017 – Dec 2019', 'Jun 2015 – Feb 2017', 'May 2014 – May 2015'];
  const lines = [];
  let y = 740;
  dates.forEach((d, j) => {
    lines.push({ x: 50, y, text: `Senior Analyst, Company ${j}` }, { x: 560 - d.length * 5, y, text: d });
    y -= 14;
    for (let k = 0; k < 5; k++) lines.push({ x: 60, y: (y -= 14), text: `Led an analysis that cut reporting time by ${k + 2}0% across three regional teams` });
    y -= 14;
  });
  for (const [a, b, c] of [['Credit Risk', 'Underwriting', 'Stakeholders'], ['Risk Analysis', 'Modeling', 'Neural Networks'], ['Decisions', 'Compliance', 'Economics']]) {
    lines.push({ x: 50, y, text: a }, { x: 230, y, text: b }, { x: 410, y, text: c });
    y -= 14;
  }
  const layout = await analyzeLayout('r.pdf', makePdf([lines]));
  assert.deepEqual(layout.columnPages, []);
  assert.deepEqual(failed(layout), []);
});

test('a three-page PDF is flagged for length', async () => {
  const page = rows(20, (i, y) => ({ x: 50, y, text: `Line ${i} of experience detail` }));
  const layout = await analyzeLayout('r.pdf', makePdf([page, page, page]));
  assert.equal(layout.pages, 3);
  assert.deepEqual(failed(layout), ['pages']);
});

test('DOCX: contact details only in the header, tables, text boxes and icon glyphs are flagged', async () => {
  const body =
    para('Jordan Rivera') +
    para('Experience') +
    '<w:tbl><w:tr><w:tc>' + para('Analyst, Acme') + '</w:tc><w:tc>' + para('2020 – Present') + '</w:tc></w:tr></w:tbl>' +
    '<w:p><w:r><w:pict><w:txbxContent>' + para('Skills: SQL') + '</w:txbxContent></w:pict></w:r></w:p>' +
    para(' Portland, OR');
  const layout = await analyzeLayout('r.docx', await makeDocx({ body, header: 'jordan@example.com · (555) 123-4567' }));
  assert.deepEqual(layout.headerOnlyContact, ['email', 'phone']);
  assert.deepEqual(failed(layout).sort(), ['clean-text', 'header-contact', 'tables', 'text-boxes']);
});

test('DOCX: a plain one-column document with contact details in the body passes', async () => {
  const body = para('Jordan Rivera') + para('jordan@example.com · (555) 123-4567') + para('Experience') + para('Analyst, Acme, Jan 2020 – Present');
  const layout = await analyzeLayout('r.docx', await makeDocx({ body, header: 'jordan@example.com' }));
  assert.deepEqual(failed(layout), []);
});

test('mammoth text leaves out the Word header, as many ATS parsers do', async () => {
  const file = path.join(os.tmpdir(), `sprout-${process.pid}.docx`);
  fs.writeFileSync(file, await makeDocx({ body: para('Jordan Rivera') + para('Experience'), header: 'jordan@example.com' }));
  try {
    assert.ok(!/@/.test(await extractText(file)));
  } finally {
    fs.unlinkSync(file);
  }
});

test('ATS parse-readiness uses the stored layout, and says why', () => {
  const resume = 'Jordan Rivera\njordan@example.com (555) 123-4567\nExperience\nAnalyst Jan 2020 – Present\nEducation\nSkills';
  const plain = atsScore({ title: 'Analyst', text: 'Requirements\n- SQL' }, resume);
  const columns = atsScore({ title: 'Analyst', text: 'Requirements\n- SQL' }, resume, { layout: { type: 'pdf', pages: 1, columnPages: [1] } });
  assert.ok(columns.components.parseability < plain.components.parseability);
  assert.ok(columns.tips.some((t) => /side-by-side columns/.test(t)));
});
