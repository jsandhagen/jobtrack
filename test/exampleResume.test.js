// Optional integration coverage of the user's supplied PDFs. These files may
// be absent in a clean checkout; the PDF geometry unit tests always run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../src/main/documents');
const B = require('../src/main/bullets');
const { isEvidenceDoc } = require('../src/main/sourceEvidence');
const files = [
  ['Resume - WEX.pdf', [5, 3, 1]], ['Sadia Taieba Resume - Evlo.pdf', [5, 2]],
  ['Sadia Taieba Resume - Haven Energy.pdf', [5, 2]], ['Sadia Taieba Resume - IFS.pdf', [5, 2]],
  ['Sadia Taieba Resume - Mews-1.pdf', [5, 2]], ['Sadia Taieba Resume.pdf', [4, 2]],
];
const folder = path.resolve(__dirname, '../examples');
const present = files.every(([name]) => fs.existsSync(path.join(folder, name)));

test('the supplied strategy PDFs preserve all 43 source bullets, education and complete skill cells', { skip: !present }, async () => {
  let bank = B.emptyBank();
  for (const [name, counts] of files) {
    const doc = await D.importFile(path.join(folder, name));
    const parsed = B.parseResume(doc.text);
    assert.deepEqual(parsed.experiences.map((e) => e.bullets.length), counts, name);
    assert.deepEqual(parsed.experiences.slice(0, 2).map((e) => e.organization), ['Appian', 'KCIC'], name);
    assert.equal(parsed.education[0].school, 'University of Richmond', name);
    assert.equal(parsed.education[0].details, '', name + ': no work bullets leak into education');
    if (name.includes('IFS')) assert.match(parsed.experiences[0].bullets.at(-1).text, /Sales, Marketing, Product, Finance, and Legal$/);
    assert.ok(!parsed.skills.some((s) => ['Strategy', 'Execution', 'Management', 'Python)', 'Forecasting', 'Research'].includes(s)), name + ': no wrapped skill fragments');
    bank = B.mergeIntoBank(bank, parsed, { name }).bank;
  }
  assert.equal(bank.experiences.length, 3, 'resume variants merge under the same employer and dates');
  assert.equal(bank.education.length, 1);
  assert.ok(bank.bullets.some((b) => /220\+/.test(b.text)));
  assert.ok(bank.bullets.some((b) => /\$9M/.test(b.text)));
});

test('the supplied fictional portfolio project is excluded from qualification evidence', { skip: !fs.existsSync(path.join(folder, 'Sample M&A Project.pdf')) }, async () => {
  const doc = await D.importFile(path.join(folder, 'Sample M&A Project.pdf'));
  assert.equal(doc.kind, 'project');
  assert.equal(isEvidenceDoc(doc), false);
});
