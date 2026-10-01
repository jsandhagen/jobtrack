// Why did a resume get its fit score on a posting? Prints the components and
// every requirement with how well the documents meet it. For tuning the
// offline fit score against the fixtures:
//   node scripts/fit-explain.js <resume key> <posting key>
const { localFitScore, requirementUnits } = require('../src/main/localFit');
const fixtures = ['fitCases', 'techPostings', 'techStrategyDeep', 'techStrategyHoldout', 'techStrategyNearMiss', 'quantPostings', 'quantNearMiss', 'quantHoldout', 'fitHoldout2', 'realWorld', 'randomJobs', 'ctoOfficePersona'].map((f) => {
  try {
    return require(`../test/fixtures/${f}`);
  } catch {
    return {};
  }
});
const POSTINGS = Object.assign({}, ...fixtures.map((f) => f.POSTINGS || {}));
const RESUMES = Object.assign({}, ...fixtures.map((f) => f.RESUMES || {}));
for (const [k, c] of Object.entries(Object.assign({}, ...fixtures.map((f) => f.CANDIDATES || {})))) RESUMES[k] = c.documents[0].text;

const [r, p] = process.argv.slice(2);
if (!RESUMES[r] || !POSTINGS[p]) {
  console.log(`Resumes: ${Object.keys(RESUMES).join(', ')}\nPostings: ${Object.keys(POSTINGS).join(', ')}`);
  process.exit(1);
}
const out = localFitScore(POSTINGS[p], [{ kind: 'resume', text: RESUMES[r] }]);
console.log(`${r} → ${p}: ${out.score} (${out.label}, ${out.confidence})`);
if (out.headline) console.log(out.headline);
console.log(out.components);
console.log(`years: need ${out.requiredYears}, have ${out.estimatedYears}; level: posting ${out.postingLevel}, you ${out.yourLevel}`);
const { units } = requirementUnits(POSTINGS[p]);
const met = new Map([...out.matchedSkills.map((s) => [s, '✓']), ...out.partialSkills.map((s) => [s, '~']), ...out.missingSkills.map((s) => [s, '✗']), ...out.matchedPreferred.map((s) => [s, '✓']), ...out.missingPreferred.map((s) => [s, '✗'])]);
for (const u of units) console.log(`  ${met.get(u.label) || ' '} ${u.kind.padEnd(9)} ${u.label}${u.core ? ' [core]' : ''}`);
console.log('concerns:', out.concerns);
