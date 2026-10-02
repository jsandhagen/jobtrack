const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const O = require('../src/shared/outreach');

const titleKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const scan = (applications, checked, co, job) => [...applications, ...checked].find((a) =>
  (a.url && a.url === job.url) || (O.sameCompany(a.job.company, co.name) && titleKey(a.job.title) === titleKey(job.title)));

test('indexed job lookups preserve URL/title precedence, company normalization and checked-job order', () => {
  const applications = [
    { id: 'role-first', url: '', job: { company: 'Acme, Inc.', title: 'Senior Analyst' } },
    { id: 'url-second', url: 'https://acme.example/jobs/1', job: { company: 'Another employer', title: 'Another title' } },
    { id: 'url-first', url: 'https://beta.example/jobs/2', job: { company: 'Gamma', title: 'Engineer' } },
    { id: 'role-second', url: '', job: { company: 'Beta LLC', title: 'Engineer' } },
    { id: 'blank', url: '', job: { company: '', title: '' } },
  ];
  const checked = [{ id: 'checked', saved: false, url: 'https://checked.example/1', job: { company: 'Delta', title: 'Director' } }];
  const lookup = O.applicationLookup(applications, checked);
  for (const [co, job] of [
    [{ name: 'ACME' }, { title: 'Senior-Analyst', url: 'https://acme.example/jobs/1' }],
    [{ name: 'Beta' }, { title: 'Engineer', url: 'https://beta.example/jobs/2' }],
    [{ name: 'Delta Inc.' }, { title: 'Director' }],
    [{ name: 'Other' }, { title: 'Other', url: 'https://checked.example/1' }],
    [{ name: '' }, { title: '' }],
    [{ name: 'Missing' }, { title: 'Director' }],
  ]) assert.equal(lookup(co, job), scan(applications, checked, co, job));
  assert.equal(lookup({ name: 'ACME' }, { title: 'Senior Analyst', url: 'https://acme.example/jobs/1' }).id, 'role-first');
  assert.equal(lookup({ name: 'Beta' }, { title: 'Engineer', url: 'https://beta.example/jobs/2' }).id, 'url-first');
});

test('large job boards return exactly the same matches with indexed lookups', (t) => {
  const applications = Array.from({ length: 600 }, (_, i) => ({ id: `a${i}`, url: `https://jobs.example/${i}`, job: { company: `Employer ${i % 100}`, title: `Analyst ${i}` } }));
  const checked = applications.splice(400);
  const jobs = Array.from({ length: 2000 }, (_, i) => ({ co: { name: `Employer ${i % 100} Inc.` }, job: { title: `Analyst ${i}`, url: `https://jobs.example/${i}` } }));
  const start = performance.now();
  const expected = jobs.map(({ co, job }) => scan(applications, checked, co, job)?.id);
  const scanMs = performance.now() - start;
  const indexedStart = performance.now();
  const lookup = O.applicationLookup(applications, checked);
  const actual = jobs.map(({ co, job }) => lookup(co, job)?.id);
  const indexedMs = performance.now() - indexedStart;
  assert.deepEqual(actual, expected);
  t.diagnostic(`600 applications, 2,000 board jobs: scan ${Math.round(scanMs)}ms; indexed ${Math.round(indexedMs)}ms including index construction`);
});
