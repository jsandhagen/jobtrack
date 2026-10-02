const test = require('node:test');
const assert = require('node:assert/strict');
const { readingOrder } = require('../src/main/pdfText');
const { parseResume } = require('../src/main/bullets');
const item = (str, x, y, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });

test('PDF reading order restores detached bullets under their employer instead of after education', () => {
  const items = [
    item('Experience', 72, 700), item('Acme', 72, 680), item('Analyst', 72, 665), item('2021 – Present', 450, 665),
    item('Education', 72, 610), item('State University', 72, 590), item('B.A. Economics', 72, 575),
    item('●', 72, 646), item('Built SQL reports for 12 clients', 90, 646), item('●', 72, 632), item('Reduced reporting time by 20%', 90, 632),
  ];
  const parsed = parseResume(readingOrder(items));
  assert.equal(parsed.experiences.length, 1);
  assert.deepEqual(parsed.experiences[0].bullets.map((b) => b.text), ['Built SQL reports for 12 clients', 'Reduced reporting time by 20%']);
  assert.equal(parsed.education[0].school, 'State University');
  assert.equal(parsed.education[0].details, '');
});

test('PDF skill columns keep wrapped cells and parenthesized tool lists intact', () => {
  const text = readingOrder([
    item('Relevant Skills', 72, 400),
    item('●', 72, 380), item('Program & Project', 90, 380), item('●', 245, 380), item('Data Analysis (Excel,', 263, 380),
    item('Management', 90, 366), item('SQL, Python)', 263, 366),
    item('●', 72, 352), item('Sales Strategy', 90, 352), item('●', 245, 352), item('Financial Modeling', 263, 352),
    item('Education', 72, 320), item('State University', 72, 300), item('B.A. Economics', 72, 285),
  ]);
  assert.deepEqual(parseResume(text).skills, ['Program & Project Management', 'Data Analysis (Excel, SQL, Python)', 'Sales Strategy', 'Financial Modeling']);
});
