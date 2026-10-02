const test = require('node:test');
const assert = require('node:assert/strict');
const { isEvidenceDoc, isFictionalSample } = require('../src/main/sourceEvidence');
const { libraryBlock } = require('../src/main/prompts');
const { guessKind } = require('../src/main/documents');

test('a fictional M&A work sample cannot become employment evidence or quoted candidate facts', () => {
  const real = { name: 'Resume.pdf', kind: 'resume', text: 'Managed seven technology partnerships and $3M+ in sponsorship funding.' };
  const sample = { name: 'Sample M&A Project.pdf', kind: 'project', text: 'DISCLAIMER: This is an entirely fictional scenario created solely as a work sample. Acquired Veridoc AI and retained all 10 employees.' };
  assert.equal(isFictionalSample(sample), true);
  assert.equal(isEvidenceDoc(sample), false);
  assert.equal(isEvidenceDoc(real), true);
  const prompt = libraryBlock([sample, real]);
  assert.match(prompt, /seven technology partnerships/);
  assert.doesNotMatch(prompt, /Veridoc|retained all 10/);
});

test('academic papers teach writing style and do not count as career accomplishments', () => {
  assert.equal(guessKind('Academic_History_Paper.docx.pdf', 'The implications of coffee houses'), 'writing-sample');
  assert.equal(isEvidenceDoc({ kind: 'writing-sample', text: 'An academic essay' }), false);
  assert.equal(isEvidenceDoc({ kind: 'project', text: 'Built a reporting tool for our team' }), true);
});
