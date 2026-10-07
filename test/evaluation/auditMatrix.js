// Semantic assertions complement source-preservation checks and score deltas.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { SKILLS, skillEvidence, classifyJobSkills } = require('../../src/main/fitScore');
const { strategyFocus } = require('../../src/main/strategyResume');
const dir = path.resolve(process.argv[2] || 'tmp/tech-strategy-evaluation');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'evaluation.json')));
const jobs = JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json')));
const tools = ['Python', 'TypeScript', 'SQL', 'AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'Terraform', 'ServiceNow', 'Salesforce', 'SAP', 'Workday'];
const checks = [];
const check = (id, passed, details) => checks.push({ id, passed: !!passed, ...(details ? { details } : {}) });
check('all-source-roles-bullets-and-bank-preserved', data.preservedSources);
for (const row of data.results) {
  const source = fs.readFileSync(path.join(dir, row.candidate, 'source.txt'), 'utf8');
  for (const tool of tools) {
    if (!row.skills.some(s => SKILLS[tool]?.some(p => p.test(s.toLowerCase())))) continue;
    check(`${row.candidate}/${row.job}: ${tool} has positive source evidence`, skillEvidence(source, tool));
  }
  if (row.candidate === 'commercial-strategist') check(`${row.candidate}/${row.job}: specialty tenure preserved`, !/with 7 years of experience in competitive intelligence/.test(row.summary));
  if (row.candidate === 'strategy-manager' && row.job === 'generated-cio-advisor') check('roadmaps do not trigger missing roadmapping warning', !row.warnings.some(w => /don.t yet show technology roadmapping/i.test(w)));
}
const emerging = jobs.find(j => j.key === 'generated-emerging-tech');
check('negated Kubernetes is not required', classifyJobSkills(emerging.text).get('Kubernetes')?.kind !== 'required');
const investment = jobs.find(j => j.key === 'generated-cio-investment');
for (const skill of ['Business Cases', 'Operating Model', 'IT Financial Management']) check(`${skill} retained in investment listing`, classifyJobSkills(investment.text).has(skill));
check('CIO advisor gets strategy tailoring', strategyFocus(jobs.find(j => j.key === 'generated-cio-advisor')).length > 0);
const losses = data.results.filter(r => r.lostRequirements.length).map(({candidate, job, lostRequirements}) => ({candidate, job, lostRequirements}));
const report = { commit: data.commit, runs: data.runs, profiles: data.profiles, jobs: data.jobs, checks: checks.length, failed: checks.filter(c => !c.passed), coverageLosses: losses, preservedSources: data.preservedSources, scope: 'Offline deterministic optimizer and semantic evidence checks; no live model calls.', results: checks };
fs.writeFileSync(path.join(dir, 'semantic-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({commit: report.commit, runs: report.runs, checks: report.checks, failed: report.failed, coverageLosses: report.coverageLosses}, null, 2));
assert.equal(report.failed.length, 0, 'Semantic matrix audit failed; inspect semantic-audit.json');
