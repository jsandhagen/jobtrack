const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { recognizeLines, terminate } = require('../src/main/ocr');
const { postingFromLines, cleanText, isNoise, isChrome } = require('../src/main/pageText');
const { localFitScore } = require('../src/main/localFit');

const screen = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'screens', `${name}.png`));

test.after(() => terminate());

test('OCR reads a LinkedIn-style split view and keeps only the posting column', { timeout: 60000 }, async () => {
  const { lines } = await recognizeLines(screen('split'));
  const p = postingFromLines(lines);
  assert.equal(p.is_job_posting, true);
  assert.equal(p.title, 'Senior Frontend Engineer');
  assert.equal(p.company, 'Acme Co.');
  assert.match(p.location, /Remote/);
  assert.match(p.posting_text, /GraphQL and REST APIs/);
  // Other jobs in the left-hand list and the site menu must not leak in.
  for (const other of ['Globex', 'Umbrella Health', 'Machine Learning Engineer', 'Messaging']) {
    assert.ok(!p.posting_text.includes(other), `leaked: ${other}`);
  }
});

test('OCR reads a single-column careers page', { timeout: 60000 }, async () => {
  const { lines } = await recognizeLines(screen('careers'));
  const p = postingFromLines(lines);
  assert.equal(p.is_job_posting, true);
  assert.equal(p.title, 'Registered Nurse - Telemetry');
  assert.equal(p.company, 'Providence Health');
  assert.match(p.posting_text, /BLS and ACLS/);
  assert.ok(!/Sign ?in/i.test(p.posting_text));
});

test('OCR text is good enough for the free fit score', { timeout: 60000 }, async () => {
  const { lines } = await recognizeLines(screen('careers'));
  const p = postingFromLines(lines);
  const nurse = [{ kind: 'resume', text: 'Registered Nurse, Telemetry Unit, 2018 – Present. RN license, BLS, ACLS, PCCN. Epic EHR. BSN 2015.' }];
  const r = localFitScore({ title: p.title, company: p.company, text: p.posting_text }, nurse, {});
  assert.ok(r.score >= 65, `score ${r.score}`);
  assert.ok(['RN', 'BLS', 'ACLS'].every((t) => r.matchedSkills.includes(t)), r.matchedSkills.join(','));
});

test('non-postings are rejected', () => {
  const lines = ['Inbox', 'Meeting notes from Tuesday', 'Lunch?'].map((text, i) => ({ text, confidence: 90, x0: 10, x1: 300, y0: i * 30, y1: i * 30 + 20, height: 12 }));
  assert.equal(postingFromLines(lines).is_job_posting, false);
  assert.equal(postingFromLines([]).is_job_posting, false);
});

test('text clean-up helpers', () => {
  assert.equal(cleanText('« Current RN license'), '- Current RN license');
  assert.equal(cleanText('o BSN'), '- BSN');
  assert.ok(isNoise('p i'));
  assert.ok(!isNoise('- BSN license'));
  assert.ok(isChrome('Easy Apply'));
  assert.ok(isChrome('Home My Network Jobs Messaging'));
  assert.ok(!isChrome('Requirements'));
});
