const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WEIGHTS: ATS } = require('../src/main/atsScore');

// Load the renderer script the way the page does, with a stand-in window.
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/scoreInfo.js'), 'utf8'), { window });
const { TOPICS } = window.SproutInfo;
const localFitSrc = fs.readFileSync(path.join(__dirname, '../src/main/localFit.js'), 'utf8');
const FIT = eval(`(${localFitSrc.match(/const WEIGHTS = (\{[^}]+\})/)[1]})`);
const pct = (w) => `${Math.round(w * 100)}%`;

// The ⓘ explanations quote the weights; keep them in step with the scorers.
test('fit explanation matches the fit score weights', () => {
  const said = { required: 'Required qualifications', experience: 'Years of experience', role: 'role match', vocabulary: 'shared vocabulary', preferred: 'Preferred qualifications', seniority: 'seniority' };
  for (const [k, w] of Object.entries(FIT)) assert.match(TOPICS.fit.body, new RegExp(`${said[k]} ${pct(w)}`), k);
});

test('ATS explanation matches the ATS score weights', () => {
  const said = { hardSkills: 'Hard skills', parseability: 'parse-ready format', jobTitle: 'Job title', experience: 'years', education: 'education', keywords: 'other keywords', softSkills: 'Soft skills' };
  for (const [k, w] of Object.entries(ATS)) assert.match(TOPICS.ats.body, new RegExp(`${said[k]} ${pct(w)}`), k);
});
