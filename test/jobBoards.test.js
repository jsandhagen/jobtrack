const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/main/careers');
const JB = require('../src/main/jobBoards');

C.http.retryDelays = [0, 0]; // retry at once in tests
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    for (const [pattern, body] of routes) {
      if (pattern.test(url)) {
        const value = typeof body === 'function' ? body(url, opts) : body;
        if (typeof value === 'number') return { ok: false, status: value, json: async () => ({}), text: async () => '' };
        return { ok: true, status: 200, json: async () => value, text: async () => JSON.stringify(value) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  fn.calls = calls;
  return fn;
}

const { POSTINGS, RESUMES } = require('./fixtures/techPostings');
const strategy = POSTINGS.techStrategySenior.text;
const engineering = POSTINGS.backendEngineer.text;
const docs = [{ kind: 'resume', text: RESUMES.techStrategyConsultant }];
const scoreJob = (job) => {
  const { localFitScore } = require('../src/main/localFit');
  const q = localFitScore(job, docs);
  return { score: q.score, label: q.label, dealbreakers: q.dealbreakers };
};

const ROUTES = [
  [/remotive\.com\/api\/remote-jobs\?search=Technology%20Strategy%20Consultant/, { jobs: [
    { id: 11, url: 'https://remotive.com/remote-jobs/x/11', title: 'Technology Strategy Consultant', company_name: 'Halcyon Advisory Inc.', candidate_required_location: 'USA', publication_date: daysAgo(2), salary: '$140k - $170k', description: `<p>${strategy}</p>` },
    { id: 12, url: 'https://remotive.com/remote-jobs/x/12', title: 'Senior Software Engineer', company_name: 'Fernwood', candidate_required_location: 'Worldwide', publication_date: daysAgo(1), description: engineering },
  ] }],
  [/himalayas\.app\/jobs\/api\/search/, { jobs: [
    // The same posting as on Remotive, with less text: listed once.
    { guid: 'https://himalayas.app/companies/halcyon/jobs/tsc', title: 'Technology Strategy Consultant', companyName: 'Halcyon Advisory', locationRestrictions: ['United States'], pubDate: Math.floor(Date.now() / 1000) - 86400, excerpt: 'Short.' },
    { guid: 'https://himalayas.app/companies/brio/jobs/dsc', title: 'Digital Strategy Consultant', companyName: 'Brio', locationRestrictions: [], pubDate: Math.floor(Date.now() / 1000) - 3 * 86400, minSalary: 150000, maxSalary: 180000, currency: 'USD', description: strategy },
  ] }],
  [/jobicy\.com/, 500],
  [/api\.adzuna\.com\/v1\/api\/jobs\/us\/search\/1/, (url) => {
    const q = new URL(url).searchParams;
    assert.equal(q.get('app_id'), 'id1');
    assert.equal(q.get('title_only'), 'Technology Strategy Consultant');
    assert.equal(q.get('where'), 'Washington, DC');
    return { results: [
      { id: '901', title: 'Consultant, <strong>Technology Strategy</strong>', company: { display_name: 'Northgate' }, location: { display_name: 'Washington, DC' }, redirect_url: 'https://www.adzuna.com/land/ad/901', created: daysAgo(4), salary_min: 120000, salary_max: 120000, salary_is_predicted: '1', description: strategy.slice(0, 500) },
      { id: '902', title: 'Technology Strategy Consultant', company: { display_name: 'Faraway' }, location: { display_name: 'Austin, TX' }, redirect_url: 'https://www.adzuna.com/land/ad/902', created: daysAgo(4), description: strategy.slice(0, 500) },
    ] };
  }],
];

test('job boards: one role across public boards, each posting once, similar titles only with a high fit', async () => {
  const f = fakeFetch(ROUTES);
  const progress = [];
  const r = await JB.searchBoards({
    role: 'Technology Strategy Consultant',
    place: 'Washington, DC',
    boards: ['remotive', 'himalayas', 'jobicy', 'adzuna', 'usajobs'],
    keys: { adzunaId: 'id1', adzunaKey: 'k1' },
    fetchImpl: f,
    scoreJob,
    onProgress: (p) => progress.push(p.done),
  });
  const got = r.results.map((x) => [x.source, x.company.name, x.job.title, x.match]).sort();
  assert.deepEqual(got, [
    ['adzuna', 'Northgate', 'Consultant, Technology Strategy', 'exact'],
    ['himalayas', 'Brio', 'Digital Strategy Consultant', 'similar'],
    ['remotive', 'Halcyon Advisory Inc.', 'Technology Strategy Consultant', 'exact'],
  ]);
  const halcyon = r.results.find((x) => x.source === 'remotive');
  assert.deepEqual(halcyon.job.also, ['himalayas']);
  assert.equal(halcyon.job.location, 'Remote · USA');
  assert.deepEqual(halcyon.job.pay, { min: 140000, max: 170000, currency: 'USD', interval: 'year' });
  assert.equal(halcyon.full, true);
  // Adzuna's guessed pay isn't pay; its text is only the start of the posting.
  const adz = r.results.find((x) => x.source === 'adzuna');
  assert.equal(adz.job.pay, undefined);
  assert.equal(adz.full, false);
  assert.ok(r.results.find((x) => x.match === 'similar').fit.score >= 70);
  // USAJOBS has no key, so it isn't searched; Jobicy failed and says so.
  assert.ok(!f.calls.some((c) => /usajobs/.test(c.url)));
  assert.deepEqual(r.searched.sort(), ['adzuna', 'himalayas', 'remotive']);
  assert.deepEqual(r.failed.map((x) => x.board), ['jobicy']);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});

test('job boards: feeds without search are filtered by title, remote only keeps remote jobs', async () => {
  const f = fakeFetch([
    [/remoteok\.com\/api/, [
      { legal: 'API terms' },
      { id: 'r1', position: 'Product Manager', company: 'Acme', location: 'Worldwide', date: daysAgo(1), url: 'https://remoteok.com/remote-jobs/r1', salary_min: 120000, salary_max: 150000, description: 'Own the roadmap.' },
      { id: 'r2', position: 'Backend Engineer', company: 'Acme', location: '', date: daysAgo(1), url: 'https://remoteok.com/remote-jobs/r2' },
    ]],
    [/arbeitnow\.com\/api\/job-board-api\?page=1/, { data: [
      { slug: 'pm-berlin', title: 'Senior Product Manager', company_name: 'Berlin GmbH', location: 'Berlin', remote: false, url: 'https://www.arbeitnow.com/jobs/pm-berlin', created_at: Math.floor(Date.now() / 1000) },
      { slug: 'pm-remote', title: 'Product Manager (m/w/d)', company_name: 'Hamburg GmbH', location: 'Hamburg', remote: true, url: 'https://www.arbeitnow.com/jobs/pm-remote', created_at: Math.floor(Date.now() / 1000) },
    ] }],
    [/arbeitnow\.com\/api\/job-board-api\?page=[23]/, { data: [] }],
  ]);
  const r = await JB.searchBoards({ role: 'Product Manager', remoteOnly: true, boards: ['remoteok', 'arbeitnow'], fetchImpl: f });
  assert.deepEqual(r.results.map((x) => x.job.title).sort(), ['Product Manager', 'Product Manager (m/w/d)']);
  assert.equal(r.results.find((x) => x.source === 'remoteok').job.location, 'Remote');
  assert.equal(r.results.find((x) => x.source === 'arbeitnow').company.id, 'jb:hamburg');
});

test('job boards: USAJOBS sends its key and reads federal postings', async () => {
  const f = fakeFetch([
    [/data\.usajobs\.gov\/api\/search/, (url, opts) => {
      assert.equal(opts.headers['Authorization-Key'], 'KEY');
      assert.equal(opts.headers['User-Agent'], 'me@example.com');
      assert.equal(new URL(url).searchParams.get('Keyword'), 'IT Specialist');
      return { SearchResult: { SearchResultItems: [{ MatchedObjectDescriptor: {
        PositionID: 'VA-1', PositionTitle: 'IT Specialist (INFOSEC)', PositionURI: 'https://www.usajobs.gov/job/1', PositionLocationDisplay: 'Washington, District of Columbia',
        OrganizationName: 'Veterans Affairs', DepartmentName: 'Department of Veterans Affairs', PublicationStartDate: daysAgo(3),
        PositionRemuneration: [{ MinimumRange: '99000', MaximumRange: '129000', RateIntervalCode: 'PA' }],
        UserArea: { Details: { JobSummary: 'Protects systems.', RemoteIndicator: false } },
      } }] } };
    }],
  ]);
  const r = await JB.searchBoards({ role: 'IT Specialist', boards: ['usajobs'], keys: { usajobsKey: 'KEY', usajobsEmail: 'me@example.com' }, fetchImpl: f });
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].company.name, 'Veterans Affairs');
  assert.equal(r.results[0].match, 'title');
  assert.deepEqual(r.results[0].job.pay, { min: 99000, max: 129000, currency: 'USD', interval: 'year' });
});

test('job boards that need a key are skipped without one', () => {
  assert.deepEqual(JB.usableBoards(['remotive', 'adzuna', 'usajobs'], { adzunaId: 'a' }), ['remotive']);
  assert.ok(!JB.DEFAULT_BOARDS.includes('adzuna'));
  assert.equal(JB.remoteIn('Worldwide'), 'Remote');
  assert.equal(JB.remoteIn('Europe'), 'Remote · Europe');
});
