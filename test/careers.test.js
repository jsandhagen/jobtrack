const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/main/careers');

C.http.retryDelays = [0, 0]; // retry at once in tests

const NOW = Date.parse('2026-09-30T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// A fake fetch that serves canned responses by URL (and records the calls).
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    for (const [pattern, body] of routes) {
      if (typeof pattern === 'string' ? url === pattern : pattern.test(url)) {
        const value = typeof body === 'function' ? body(url, opts) : body;
        if (value === 404) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        return { ok: true, status: 200, json: async () => value, text: async () => (typeof value === 'string' ? value : JSON.stringify(value)) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  fn.calls = calls;
  return fn;
}

test('recognises each job board from its links', () => {
  const cases = [
    ['https://boards.greenhouse.io/octa', 'greenhouse', 'octa'],
    ['https://job-boards.greenhouse.io/octa/jobs/12345', 'greenhouse', 'octa'],
    ['https://boards.greenhouse.io/embed/job_board?for=octa&b=https://octa.com', 'greenhouse', 'octa'],
    ['https://jobs.lever.co/plaid/abc-123', 'lever', 'plaid'],
    ['https://jobs.ashbyhq.com/ramp', 'ashby', 'ramp'],
    ['https://apply.workable.com/acme/j/ABC123/', 'workable', 'acme'],
    ['https://acme.workable.com/', 'workable', 'acme'],
    ['https://careers.smartrecruiters.com/Visa', 'smartrecruiters', 'Visa'],
    ['https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x', 'workday', 'nvidia'],
    ['https://wd3.myworkdaysite.com/recruiting/acme/External', 'workday', 'acme'],
  ];
  for (const [url, ats, token] of cases) {
    const b = C.detectBoard(url);
    assert.ok(b, url);
    assert.equal(b.ats, ats, url);
    assert.equal(b.token, token, url);
    assert.match(b.url, /^https:\/\//);
  }
  assert.equal(C.detectBoard('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite').site, 'NVIDIAExternalCareerSite');
  assert.equal(C.detectBoard('https://octa.example.com/careers'), null);
  assert.equal(C.detectBoard('https://jobs.lever.co/plaid').url, 'https://jobs.lever.co/plaid');
});

test('finds the board embedded in a company careers page', () => {
  const html = `<html><a href="/about">About</a><script src="https://boards.greenhouse.io/embed/job_board/js?for=octa"></script></html>`;
  assert.deepEqual([C.boardFromHtml(html).ats, C.boardFromHtml(html).token], ['greenhouse', 'octa']);
  assert.equal(C.boardFromHtml('<a href="https://jobs.ashbyhq.com/acme/123">Apply</a>').token, 'acme');
  assert.equal(C.boardFromHtml('{"url":"https:\\/\\/jobs.lever.co\\/acme"}').token, 'acme');
  assert.equal(C.boardFromHtml('<a href="https://linkedin.com/company/acme">'), null);
});

test('names to try for a company', () => {
  assert.deepEqual(C.slugsFor('Ramp'), ['ramp']);
  assert.deepEqual(C.slugsFor('Scale AI, Inc.'), ['scaleai', 'scale-ai']);
  assert.deepEqual(C.slugsFor(''), []);
});

test('titles match target roles by their words, in any order, with common abbreviations', () => {
  const roles = ['Chief of Staff', 'Operations Manager'];
  assert.ok(C.titleMatches('Chief of Staff to the CEO', roles));
  assert.ok(C.titleMatches('Manager, Business Operations', roles));
  assert.ok(C.titleMatches('Sr. Ops Manager', roles));
  assert.ok(!C.titleMatches('Staff Software Engineer', roles));
  assert.ok(!C.titleMatches('Office Manager', roles));
  assert.ok(C.titleMatches('Strategy & BizOps Associate', [], ['business operations']));
  assert.ok(!C.titleMatches('', roles));
});

test('Workday "posted" text becomes a date', () => {
  assert.equal(C.workdayPosted('Posted Today', NOW), daysAgo(0));
  assert.equal(C.workdayPosted('Posted Yesterday', NOW), daysAgo(1));
  assert.equal(C.workdayPosted('Posted 3 Days Ago', NOW), daysAgo(3));
  assert.equal(C.workdayPosted('Posted 30+ Days Ago', NOW), daysAgo(30));
  assert.equal(C.workdayPosted('', NOW), null);
});

test('reads jobs from each kind of board', async () => {
  const f = fakeFetch([
    ['https://boards-api.greenhouse.io/v1/boards/gh/jobs?content=true', { jobs: [{ id: 1, title: 'Chief of Staff', location: { name: 'NYC' }, absolute_url: 'https://job-boards.greenhouse.io/gh/jobs/1', first_published: daysAgo(2), updated_at: daysAgo(1) }] }],
    ['https://api.lever.co/v0/postings/lv?mode=json', [{ id: 'a1', text: 'Ops Manager', categories: { location: 'Remote', team: 'Ops' }, hostedUrl: 'https://jobs.lever.co/lv/a1', createdAt: NOW - 86400000 }]],
    ['https://api.ashbyhq.com/posting-api/job-board/ab?includeCompensation=true', { jobs: [{ id: 'x', title: 'BizOps Lead', location: 'SF', isRemote: true, jobUrl: 'https://jobs.ashbyhq.com/ab/x', publishedAt: daysAgo(5) }, { id: 'hidden', title: 'Secret', isListed: false }] }],
    ['https://apply.workable.com/api/v1/widget/accounts/wk?details=true', { jobs: [{ shortcode: 'S1', title: 'Chief of Staff', city: 'Austin', state: 'TX', country: 'US', url: 'https://apply.workable.com/wk/j/S1/', published_on: '2026-09-20' }] }],
    [/smartrecruiters\.com\/v1\/companies\/sr\/postings\?/, { totalFound: 1, content: [{ id: 'p1', name: 'Operations Manager', location: { city: 'Denver', region: 'CO', country: 'us' }, releasedDate: daysAgo(3) }] }],
    ['https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Ext/jobs', (url, opts) => ({ total: 1, jobPostings: [{ title: `Chief of Staff (${JSON.parse(opts.body).searchText})`, externalPath: '/job/NYC/Chief-of-Staff_R1', locationsText: 'New York', postedOn: 'Posted 2 Days Ago' }] })],
  ]);
  const gh = await C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), f);
  assert.deepEqual(gh, [{ id: '1', title: 'Chief of Staff', location: 'NYC', url: 'https://job-boards.greenhouse.io/gh/jobs/1', postedAt: daysAgo(2) }]);
  const lv = await C.listJobs(C.detectBoard('https://jobs.lever.co/lv'), f);
  assert.equal(lv[0].postedAt, daysAgo(1));
  assert.equal(lv[0].location, 'Remote');
  const ab = await C.listJobs(C.detectBoard('https://jobs.ashbyhq.com/ab'), f);
  assert.deepEqual(ab.map((j) => [j.title, j.location]), [['BizOps Lead', 'SF · Remote']]);
  const wk = await C.listJobs(C.detectBoard('https://apply.workable.com/wk'), f);
  assert.equal(wk[0].location, 'Austin, TX, US');
  const sr = await C.listJobs(C.detectBoard('https://careers.smartrecruiters.com/sr'), f);
  assert.equal(sr[0].url, 'https://jobs.smartrecruiters.com/sr/p1');
  const wd = await C.listJobs(C.detectBoard('https://acme.wd5.myworkdayjobs.com/en-US/Ext'), f, { searchTerms: ['Chief of Staff', 'strategy'], now: NOW });
  // Searched once per term; the same posting found twice is listed once.
  assert.equal(wd.length, 1);
  assert.equal(wd[0].url, 'https://acme.wd5.myworkdayjobs.com/Ext/job/NYC/Chief-of-Staff_R1');
  assert.equal(wd[0].postedAt, daysAgo(2));
  assert.equal(f.calls.filter((c) => /myworkdayjobs/.test(c.url)).length, 2);
});

test('reads a posting description for scoring', async () => {
  const f = fakeFetch([
    ['https://boards-api.greenhouse.io/v1/boards/gh/jobs/1', { content: '&lt;p&gt;You will &amp;amp; lead ops.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;5 years&lt;/li&gt;&lt;/ul&gt;' }],
    ['https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Ext/job/NYC/R1', { jobPostingInfo: { jobDescription: '<p>Own the <b>operating cadence</b>.</p>' } }],
  ]);
  const gh = await C.jobDetail(C.detectBoard('https://boards.greenhouse.io/gh'), { id: '1' }, f);
  assert.equal(gh, 'You will & lead ops.\n\n- 5 years');
  const wd = await C.jobDetail(C.detectBoard('https://acme.wd5.myworkdayjobs.com/Ext'), { id: '/job/NYC/R1', path: '/job/NYC/R1' }, f);
  assert.equal(wd, 'Own the operating cadence.');
});

test('checking a company: finds its board, keeps matching roles, and flags only jobs new since last time', async () => {
  let jobs = [
    { id: 1, title: 'Chief of Staff', location: { name: 'DC' }, absolute_url: 'u1', first_published: daysAgo(10) },
    { id: 2, title: 'Software Engineer', location: { name: 'DC' }, absolute_url: 'u2', first_published: daysAgo(1) },
  ];
  const f = fakeFetch([
    ['https://octa.example.com/careers', '<iframe src="https://boards.greenhouse.io/embed/job_board?for=octa"></iframe>'],
    ['https://boards-api.greenhouse.io/v1/boards/octa/jobs?content=true', () => ({ jobs })],
  ]);
  const co = { id: 'c1', name: 'OCTA', careersUrl: 'https://octa.example.com/careers' };
  const first = await C.checkCompany(co, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.equal(first.patch.board.ats, 'greenhouse');
  assert.equal(first.patch.board.via, 'page');
  assert.equal(first.patch.openCount, 2);
  assert.deepEqual(first.patch.jobs.map((j) => j.title), ['Chief of Staff']);
  assert.equal(first.patch.jobs[0].firstSeenAt, null, 'jobs already up on the first check are not "new"');
  assert.deepEqual(first.fresh, []);
  assert.equal(first.firstLook, true, 'the first look at a company is flagged');
  assert.equal(first.patch.firstCheckedAt, new Date(NOW).toISOString());

  // A new matching role goes up, and a new non-matching one.
  jobs = [...jobs, { id: 3, title: 'Deputy Chief of Staff', location: { name: 'Remote' }, absolute_url: 'u3', first_published: daysAgo(0) }, { id: 4, title: 'Designer', absolute_url: 'u4' }];
  const later = NOW + 6 * 3600000;
  const second = await C.checkCompany({ ...co, ...first.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: later });
  assert.deepEqual(second.fresh.map((j) => j.title), ['Deputy Chief of Staff']);
  assert.deepEqual(second.patch.jobs.map((j) => j.title), ['Deputy Chief of Staff', 'Chief of Staff'], 'newest first');
  assert.equal(second.patch.jobs[0].firstSeenAt, new Date(later).toISOString());
  assert.equal(second.firstLook, false);
  assert.equal(second.patch.firstCheckedAt, undefined, 'the first check time is kept, not moved');

  // The next check doesn't announce it again.
  const third = await C.checkCompany({ ...co, ...second.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: later + 3600000 });
  assert.deepEqual(third.fresh, []);
  assert.equal(third.patch.jobs[0].firstSeenAt, new Date(later).toISOString());
});

test('without a careers link, the company name is tried on the common boards', async () => {
  const f = fakeFetch([['https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true', { jobs: [{ id: 'j', title: 'Chief of Staff', jobUrl: 'u', publishedAt: daysAgo(1) }] }]]);
  const r = await C.checkCompany({ name: 'Ramp' }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.equal(r.patch.board.ats, 'ashby');
  assert.equal(r.patch.board.guessed, true);
  assert.equal(r.patch.jobs.length, 1);
});

test('a company with no readable board says so; "not them" stops the guessing', async () => {
  const f = fakeFetch([]);
  const r = await C.checkCompany({ name: 'Deloitte', careersUrl: 'https://www.deloitte.com/careers' }, { fetchImpl: f, roles: ['x'], now: NOW });
  assert.equal(r.patch.checkError, 'no-board');
  assert.equal(r.patch.board, null);
  const calls = f.calls.length;
  const again = await C.checkCompany({ name: 'Deloitte', board: { ats: 'none' } }, { fetchImpl: f, roles: ['x'], now: NOW });
  assert.equal(again.patch.checkError, 'no-board');
  assert.equal(f.calls.length, calls, 'no requests once you said the guess was wrong');
});

test('a board that fails to answer is an error, not an empty list', async () => {
  const f = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(C.checkCompany({ name: 'X', board: C.detectBoard('https://jobs.lever.co/x') }, { fetchImpl: f, roles: ['a'] }), /answered 503/);
});

test('board links as people paste them, embeds and API addresses', () => {
  const cases = [
    ['jobs.lever.co/plaid', 'lever', 'plaid'],
    ['<https://jobs.ashbyhq.com/ramp>', 'ashby', 'ramp'],
    ['https://jobs.lever.co/plaid.', 'lever', 'plaid'],
    ['https://boards.greenhouse.io/embed/job_app?for=octa&token=123', 'greenhouse', 'octa'],
    ['https://boards.greenhouse.io/embed/job_board?b=x&amp;for=octa', 'greenhouse', 'octa'],
    ['https://boards-api.greenhouse.io/v1/boards/octa/jobs?content=true', 'greenhouse', 'octa'],
    ['https://api.lever.co/v0/postings/plaid?mode=json', 'lever', 'plaid'],
    ['https://api.ashbyhq.com/posting-api/job-board/ramp', 'ashby', 'ramp'],
    ['https://api.smartrecruiters.com/v1/companies/Visa/postings', 'smartrecruiters', 'Visa'],
    ['https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/External/jobs', 'workday', 'acme'],
    ['https://acme.wd1.myworkdayjobs.com/External', 'workday', 'acme'],
  ];
  for (const [url, ats, token] of cases) {
    const b = C.detectBoard(url);
    assert.ok(b, url);
    assert.deepEqual([b.ats, b.token], [ats, token], url);
  }
  assert.equal(C.detectBoard('https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/External/jobs').site, 'External');
  assert.equal(C.detectBoard('https://jobs.workable.com/search'), null);
  assert.equal(C.detectBoard(''), null);
});

test('a careers page linking to several boards gives the one it uses most', () => {
  const html = `<a href="https://jobs.lever.co/partner">Our partner is hiring</a>
    <a href="//jobs.ashbyhq.com/acme/1">Job 1</a><a href="//jobs.ashbyhq.com/acme/2">Job 2</a>`;
  assert.equal(C.boardFromHtml(html).token, 'acme');
  assert.equal(C.boardFromHtml('<a href="https:&#x2F;&#x2F;jobs.lever.co&#x2F;acme">').token, 'acme');
});

test('more names to try: accents, "formerly", and the full name after the short one', () => {
  assert.deepEqual(C.slugsFor('Mercury Technologies, Inc.'), ['mercury', 'mercurytechnologies', 'mercury-technologies']);
  assert.deepEqual(C.slugsFor('Block (formerly Square)'), ['block']);
  assert.deepEqual(C.slugsFor('Café Labs'), ['cafe', 'cafelabs', 'cafe-labs']);
  assert.ok(C.slugsFor('A Very Long Company Name Holdings').length <= 4);
});

test('titles: close together, plurals, more abbreviations, and no internships unless asked', () => {
  const roles = ['Chief of Staff', 'Operations Manager', 'Head of Operations'];
  assert.ok(!C.titleMatches('Staff Engineer, Office of the Chief Scientist', roles), 'the words are there but far apart and out of order');
  assert.ok(C.titleMatches('Head of Global Business Operations', roles));
  assert.ok(C.titleMatches('Operations Managers', roles));
  assert.ok(C.titleMatches('Senior Manager, Sales Operations & Strategy', roles));
  assert.ok(!C.titleMatches('Chief of Staff Intern', roles));
  assert.ok(!C.titleMatches('Operations Manager (Co-op)', roles));
  assert.ok(C.titleMatches('Operations Intern', ['Operations Internship']));
  assert.ok(C.titleMatches('VP, Finance', ['Vice President of Finance']));
  assert.ok(C.titleMatches('SWE II, Payments', ['Software Engineer']));
  assert.ok(C.titleMatches('Front-End Engineer', ['Frontend Engineer']));
  assert.ok(C.titleMatches('Gérant des opérations', ['gerant']));
});

test('dates: seconds or milliseconds, and nonsense counts as unknown', async () => {
  const f = fakeFetch([
    [
      'https://api.lever.co/v0/postings/lv?mode=json',
      [
        { id: 'ms', text: 'A', hostedUrl: 'https://x/ms', createdAt: NOW - 86400000 },
        { id: 's', text: 'B', hostedUrl: 'https://x/s', createdAt: Math.floor((NOW - 86400000) / 1000) },
        { id: 'zero', text: 'C', hostedUrl: 'https://x/0', createdAt: 0 },
        { id: 'future', text: 'D', hostedUrl: 'https://x/f', createdAt: Date.now() + 30 * 86400000 },
      ],
    ],
  ]);
  const jobs = await C.listJobs(C.detectBoard('https://jobs.lever.co/lv'), f);
  assert.deepEqual(
    jobs.map((j) => [j.id, j.postedAt]),
    [
      ['ms', daysAgo(1)],
      ['s', daysAgo(1)],
      ['zero', null],
      ['future', null],
    ],
  );
  assert.equal(C.workdayPosted('Posted 2 Weeks Ago', NOW), daysAgo(14));
});

test('listed jobs are tidied: no blank titles or ids, entities decoded, each id once, a link always', async () => {
  const f = fakeFetch([
    [
      'https://boards-api.greenhouse.io/v1/boards/gh/jobs?content=true',
      {
        jobs: [
          { id: 1, title: '  R&amp;D   Operations Manager ', location: { name: 'NYC' } },
          { id: 1, title: 'duplicate' },
          { id: 2, title: '' },
          { title: 'no id' },
        ],
      },
    ],
  ]);
  const jobs = await C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), f);
  assert.deepEqual(jobs.map((j) => [j.id, j.title, j.url]), [['1', 'R&D Operations Manager', 'https://job-boards.greenhouse.io/gh/jobs/1']]);
});

test('Workday: pages past the first (which say total 0) are still read, and one failing search keeps the others', async () => {
  const posting = (n) => ({ title: `Operations Manager ${n}`, externalPath: `/job/R${n}`, postedOn: 'Posted Today' });
  const f = fakeFetch([
    [
      'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Ext/jobs',
      (url, opts) => {
        const { offset, searchText } = JSON.parse(opts.body);
        if (searchText === 'bad') return { __status: 400 };
        const all = Array.from({ length: 45 }, (_, i) => posting(i));
        return { total: offset === 0 ? 45 : 0, jobPostings: all.slice(offset, offset + 20) };
      },
    ],
  ]);
  const wrapped = async (url, opts) => {
    const r = await f(url, opts);
    const body = await r.json();
    return body && body.__status ? { ok: false, status: body.__status, json: async () => ({}) } : { ...r, json: async () => body };
  };
  const jobs = await C.listJobs(C.detectBoard('https://acme.wd5.myworkdayjobs.com/Ext'), wrapped, { searchTerms: ['Operations Manager', 'bad'], now: NOW });
  assert.equal(jobs.length, 45);
});

test('busy or flaky careers sites are retried; a page instead of JSON is a readable error', async () => {
  let n = 0;
  const flaky = async () => (++n < 3 ? { ok: false, status: n === 1 ? 503 : 429, headers: { get: () => null } } : { ok: true, status: 200, json: async () => ({ jobs: [{ id: 1, title: 'Ops Manager', absolute_url: 'https://x/1' }] }) });
  const jobs = await C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), flaky);
  assert.equal(jobs.length, 1);
  assert.equal(n, 3);

  let offline = 0;
  await assert.rejects(
    C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), async () => {
      offline++;
      throw new TypeError('fetch failed');
    }),
    /couldn't reach/,
  );
  assert.equal(offline, 3, 'tried three times');

  const html = async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') });
  await assert.rejects(C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), html), /page instead of its job list/);

  let forbidden = 0;
  await assert.rejects(
    C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), async () => {
      forbidden++;
      return { ok: false, status: 403 };
    }),
    /answered 403/,
  );
  assert.equal(forbidden, 1, 'a refusal is not retried');
});

test('a careers link that redirects to its board is followed', async () => {
  const f = async (url) => {
    if (url === 'https://acme.com/careers') return { ok: true, status: 200, url: 'https://jobs.ashbyhq.com/acme', text: async () => '<div id="app"></div>' };
    if (url === 'https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true') return { ok: true, status: 200, json: async () => ({ jobs: [{ id: 'j', title: 'Chief of Staff', jobUrl: 'https://jobs.ashbyhq.com/acme/j' }] }) };
    return { ok: false, status: 404 };
  };
  const r = await C.checkCompany({ name: 'Acme', careersUrl: 'acme.com/careers' }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.equal(r.patch.board.ats, 'ashby');
  assert.equal(r.patch.board.via, 'page');
  assert.equal(r.patch.jobs.length, 1);
});

test('being offline is an error to retry later, not "no careers site"', async () => {
  const f = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(C.checkCompany({ name: 'Ramp' }, { fetchImpl: f, roles: ['x'], now: NOW }), /couldn't reach/);
});

test('a board Sprout found that disappears is looked for again; the new board is not all "new"', async () => {
  let where = 'lever';
  const f = fakeFetch([
    ['https://api.lever.co/v0/postings/ramp?mode=json', () => (where === 'lever' ? [{ id: 'a', text: 'Chief of Staff', hostedUrl: 'https://x/a', createdAt: NOW }] : 404)],
    ['https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true', () => (where === 'ashby' ? { jobs: [{ id: 'b', title: 'Chief of Staff', jobUrl: 'https://x/b', publishedAt: daysAgo(40) }] } : 404)],
  ]);
  const first = await C.checkCompany({ name: 'Ramp' }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.equal(first.patch.board.ats, 'lever');
  where = 'ashby';
  const second = await C.checkCompany({ name: 'Ramp', ...first.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW + 3600000 });
  assert.equal(second.patch.board.ats, 'ashby');
  assert.deepEqual(second.fresh, [], 'switching boards does not announce every job as new');
  assert.equal(second.patch.jobs[0].firstSeenAt, null);

  // A board you linked to that disappears says so.
  await assert.rejects(C.checkCompany({ name: 'X', careersUrl: 'https://jobs.lever.co/gone', board: C.detectBoard('https://jobs.lever.co/gone') }, { fetchImpl: fakeFetch([]), roles: ['a'] }), /isn't there anymore/);
});

test('descriptions: numeric entities, and the posting page when the API has nothing', async () => {
  assert.equal(C.htmlToPlain('<p>We&#8217;re &#x201C;hiring&#x201D;&nbsp;now &mdash; apply</p>'), 'We\u2019re \u201chiring\u201d now \u2014 apply');
  const long = 'Lead our operating cadence across every team, run planning, and own the metrics that matter to the business.';
  const page = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"Chief of Staff","description":"<p>${long}</p>"}]}</script></html>`;
  const f = fakeFetch([['https://jobs.ashbyhq.com/ab/x', page]]);
  const text = await C.jobDetail(C.detectBoard('https://jobs.ashbyhq.com/ab'), { id: 'x', url: 'https://jobs.ashbyhq.com/ab/x' }, f);
  assert.equal(text, long);
});

test('pay: ranges written in postings, in the usual ways, and never funding amounts', () => {
  const cases = [
    ['Salary: $150,000 - $190,000 per year', '$150K–$190K'],
    ['The range is $150K–$190K + equity', '$150K–$190K'],
    ['£60k to £75k', '£60K–£75K'],
    ['$45-$60/hr', '$45–$60/hr'],
    ['USD 120,000 – 140,000', '$120K–$140K'],
    ['CA$90,000 - CA$110,000', 'CA$90K–CA$110K'],
    ['€55.000 - €70.000', '€55K–€70K'],
    ['$150 - 190k', '$150K–$190K'],
    ['$5,000 - $6,000 per month', '$5K–$6K/mo'],
    ['We raised $20 - $30 million', ''],
    ['Series B $50M - $100M', ''],
    ['401k and 3 - 5 weeks off', ''],
  ];
  for (const [text, want] of cases) assert.equal(C.formatPay(C.payFromText(text)), want, text);
  assert.equal(C.yearlyPay(C.payFromText('$50 - $60/hr')), 60 * 2080);
});

test('pay from the boards\' own fields (Lever, Ashby) and from Greenhouse descriptions', async () => {
  const f = fakeFetch([
    ['https://api.lever.co/v0/postings/lv?mode=json', [{ id: 'a', text: 'Ops Manager', hostedUrl: 'https://x/a', salaryRange: { min: 120000, max: 150000, currency: 'USD', interval: 'per-year-salary' }, descriptionPlain: 'Run ops.' }]],
    ['https://api.ashbyhq.com/posting-api/job-board/ab?includeCompensation=true', { jobs: [{ id: 'x', title: 'Chief of Staff', jobUrl: 'https://x/x', compensation: { summaryComponents: [{ compensationType: 'EquityPercentage', minValue: 0.1 }, { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 180000, maxValue: 220000 }] } }] }],
    ['https://boards-api.greenhouse.io/v1/boards/gh/jobs?content=true', { jobs: [{ id: 1, title: 'Ops Lead', absolute_url: 'https://x/1', content: '&lt;p&gt;Pay range: $130,000&amp;nbsp;-&amp;nbsp;$160,000 USD&lt;/p&gt;' }] }],
  ]);
  const [lv] = await C.listJobs(C.detectBoard('https://jobs.lever.co/lv'), f);
  assert.equal(C.formatPay(lv.pay), '$120K–$150K');
  const [ab] = await C.listJobs(C.detectBoard('https://jobs.ashbyhq.com/ab'), f);
  assert.equal(C.formatPay(ab.pay), '$180K–$220K');
  const [gh] = await C.listJobs(C.detectBoard('https://boards.greenhouse.io/gh'), f);
  assert.equal(C.formatPay(gh.pay), '$130K–$160K');
  assert.match(gh.text, /Pay range/);
});

test('fit preview: scored from listed descriptions, read one by one where the list has none, and descriptions are not saved', async () => {
  const text = 'Operations Manager. You will run planning, budgets and vendors. Requirements: 5+ years operations, SQL. Pay: $120,000 - $140,000.';
  let scored = 0;
  const scoreJob = (job) => (scored++, { score: job.text.includes('SQL') ? 72 : 40, label: 'Good fit' });
  const f = fakeFetch([
    ['https://boards-api.greenhouse.io/v1/boards/gh/jobs?content=true', { jobs: [{ id: 1, title: 'Operations Manager', absolute_url: 'https://x/1', content: text }, { id: 2, title: 'Designer', absolute_url: 'https://x/2', content: text }] }],
  ]);
  const r = await C.checkCompany({ name: 'GH', board: C.detectBoard('https://boards.greenhouse.io/gh') }, { fetchImpl: f, roles: ['Operations Manager'], now: NOW, scoreJob });
  assert.equal(r.patch.jobs.length, 1);
  assert.deepEqual(r.patch.jobs[0].fit, { score: 72, label: 'Good fit' });
  assert.equal(C.formatPay(r.patch.jobs[0].pay), '$120K–$140K');
  assert.equal(r.patch.jobs[0].text, undefined, 'descriptions are not stored');
  assert.equal(scored, 1, 'only matching jobs are scored');

  // SmartRecruiters lists no descriptions: read the new matching ones, then keep their previews.
  const sr = fakeFetch([
    [/smartrecruiters\.com\/v1\/companies\/sr\/postings\?/, { totalFound: 2, content: [{ id: 'p1', name: 'Operations Manager', releasedDate: daysAgo(1) }, { id: 'p2', name: 'Operations Manager II', releasedDate: daysAgo(2) }] }],
    [/smartrecruiters\.com\/v1\/companies\/sr\/postings\/p\d$/, { jobAd: { sections: { jobDescription: { title: 'About', text: `<p>${text}</p>` } } } }],
  ]);
  const co = { name: 'SR', board: C.detectBoard('https://careers.smartrecruiters.com/sr') };
  const first = await C.checkCompany(co, { fetchImpl: sr, roles: ['Operations Manager'], now: NOW, scoreJob });
  assert.ok(first.patch.jobs.every((j) => j.fit && j.fit.score === 72 && j.pay));
  const reads = sr.calls.filter((c) => /postings\/p\d$/.test(c.url)).length;
  assert.equal(reads, 2);
  const again = await C.checkCompany({ ...co, ...first.patch }, { fetchImpl: sr, roles: ['Operations Manager'], now: NOW, scoreJob });
  assert.equal(sr.calls.filter((c) => /postings\/p\d$/.test(c.url)).length, reads, 'previews already made are kept, not re-read');
  assert.ok(again.patch.jobs.every((j) => j.fit && j.pay));
});
