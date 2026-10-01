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

test('recognises Recruitee, BambooHR and Oracle Cloud boards from their links', () => {
  const cases = [
    ['https://acme.recruitee.com/o/ops-manager', 'recruitee', 'acme'],
    ['https://acme.bamboohr.com/careers/12', 'bamboohr', 'acme'],
    ['https://acme.bamboohr.com/jobs/embed2.php', 'bamboohr', 'acme'],
    ['https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions', 'oracle', 'eeho'],
  ];
  for (const [url, ats, token] of cases) {
    const b = C.detectBoard(url);
    assert.ok(b, url);
    assert.deepEqual([b.ats, b.token], [ats, token], url);
  }
  const o = C.detectBoard('https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/123');
  assert.deepEqual([o.host, o.site], ['eeho.fa.us2.oraclecloud.com', 'CX_1']);
  assert.equal(C.detectBoard('https://www.bamboohr.com/pricing'), null);
  assert.equal(C.detectBoard('https://www.recruitee.com/'), null);
});

// A Phenom careers page, as careers.freddiemac.com/us/en/search-results serves it.
const phenomHtml = (jobs, total = jobs.length) => `<html><head><script src="https://cdn.phenompeople.com/CareerConnectResources/x.js"></script>
<script>var phApp = phApp || {"widgetApiEndpoint":"https://careers.acme.com/widgets","country":"us","locale":"en_US","refNum":"ACMEUS","baseUrl":"https://careers.acme.com/us/en/","pageName":"search-results"};
phApp.ddo = {"siteConfig":{"note":"a } in a string"},"eagerLoadRefineSearch":{"status":200,"hits":${jobs.length},"totalHits":${total},"data":{"jobs":${JSON.stringify(jobs)}}}}; phApp.experimentData = {};</script></head></html>`;

test('a Phenom careers page (on the company\'s own domain) is found from its HTML and read', async () => {
  const b = C.phenomFromPage(phenomHtml([]), 'https://careers.acme.com/us/en/search-results');
  assert.deepEqual([b.ats, b.host, b.site, b.refNum, b.url], ['phenom', 'careers.acme.com', 'us/en', 'ACMEUS', 'https://careers.acme.com/us/en/search-results']);
  assert.equal(C.phenomFromPage('<html>just a page</html>', 'https://acme.com/careers'), null);

  const job = { jobId: 'JR1', jobSeqNo: 'ACMEUSJR1EXTERNAL', title: 'Operations Manager', city: 'McLean', state: 'Virginia', country: 'United States', location: 'McLean, Virginia, United States', postedDate: '2026-09-28T00:00:00.000+0000', category: 'Operations', multi_location: ['McLean', 'Plano'] };
  // The widget API is down: the search page's own results are used instead.
  const f = fakeFetch([
    ['https://careers.acme.com/us/en/search-results', phenomHtml([])],
    ['https://careers.acme.com/widgets', 404],
    [/^https:\/\/careers\.acme\.com\/us\/en\/search-results\?keywords=Operations%20Manager&from=0/, phenomHtml([job])],
  ]);
  const found = await C.findBoard({ name: 'Acme', careersUrl: 'https://careers.acme.com/us/en/search-results' }, f);
  assert.equal(found.ats, 'phenom');
  const jobs = await C.listJobs(found, f, { searchTerms: ['Operations Manager'] });
  assert.deepEqual(jobs, [{ id: 'ACMEUSJR1EXTERNAL', title: 'Operations Manager', location: 'McLean, Virginia, United States +1 more', url: 'https://careers.acme.com/us/en/job/JR1/Operations-Manager', postedAt: '2026-09-28T00:00:00.000Z', department: 'Operations', jobId: 'JR1' }]);

  // With the widget API working, it pages 50 at a time.
  const many = Array.from({ length: 50 }, (_, i) => ({ ...job, jobId: `JR${i}`, jobSeqNo: `S${i}` }));
  const w = fakeFetch([['https://careers.acme.com/widgets', (url, opts) => ({ refineSearch: { totalHits: 60, data: { jobs: JSON.parse(opts.body).from === 0 ? many : [{ ...job, jobSeqNo: 'last' }] } } })]]);
  const all = await C.listJobs(found, w, { searchTerms: ['Operations Manager'] });
  assert.equal(all.length, 51);
  assert.equal(JSON.parse(w.calls[0].opts.body).keywords, 'Operations Manager');
  assert.equal(JSON.parse(w.calls[0].opts.body).refNum, 'ACMEUS');

  // A posting's description comes from its page.
  const d = fakeFetch([['https://careers.acme.com/us/en/job/JR1/Operations-Manager', `<script>phApp.ddo = {"jobDetail":{"data":{"job":{"description":"<p>Run the <b>operating cadence</b> for our teams and partners.</p>"}}}};</script>`]]);
  assert.equal(await C.jobDetail(found, jobs[0], d), 'Run the operating cadence for our teams and partners.');
});

test('reads Recruitee, BambooHR and Oracle Cloud boards', async () => {
  const f = fakeFetch([
    ['https://rc.recruitee.com/api/offers/', { offers: [{ id: 7, title: 'Chief of Staff', location: 'Berlin, Germany', remote: true, careers_url: 'https://rc.recruitee.com/o/cos', published_at: '2026-09-20 10:00:00 UTC', department: 'Office', description: '<p>Pay: €80,000 - €95,000</p>', status: 'published' }] }],
    ['https://bb.bamboohr.com/careers/list', { result: [{ id: '42', jobOpeningName: 'Ops Manager', departmentLabel: 'Ops', location: { city: 'Austin', state: 'Texas' }, isRemote: false }] }],
    ['https://bb.bamboohr.com/careers/42/detail', { result: { jobOpening: { description: '<p>Own planning and vendors for the whole company.</p>' } } }],
    [/^https:\/\/or\.fa\.us2\.oraclecloud\.com\/hcmRestApi\/resources\/latest\/recruitingCEJobRequisitions\?/, { items: [{ TotalJobsCount: 1, requisitionList: [{ Id: '900', Title: 'Operations Manager', PrimaryLocation: 'Reston, VA', PostedDate: '2026-09-25', WorkplaceType: 'Remote', secondaryLocations: [] }] }] }],
    [/recruitingCEJobRequisitionDetails\?/, { items: [{ ExternalDescriptionStr: '<p>Lead operations.</p>', ExternalQualificationsStr: '<ul><li>5 years</li></ul>' }] }],
  ]);
  const rc = await C.listJobs(C.detectBoard('https://rc.recruitee.com'), f);
  assert.deepEqual([rc[0].title, rc[0].location, rc[0].url, C.formatPay(rc[0].pay)], ['Chief of Staff', 'Berlin, Germany · Remote', 'https://rc.recruitee.com/o/cos', '€80K–€95K']);
  const bb = C.detectBoard('https://bb.bamboohr.com/careers');
  const bj = await C.listJobs(bb, f);
  assert.deepEqual(bj, [{ id: '42', title: 'Ops Manager', location: 'Austin, Texas', url: 'https://bb.bamboohr.com/careers/42', department: 'Ops' }]);
  assert.equal(await C.jobDetail(bb, bj[0], f), 'Own planning and vendors for the whole company.');
  const ob = C.detectBoard('https://or.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions');
  const oj = await C.listJobs(ob, f, { searchTerms: ['Operations Manager'] });
  assert.deepEqual([oj[0].id, oj[0].location, oj[0].url], ['900', 'Reston, VA · Remote', 'https://or.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/900']);
  assert.match(decodeURIComponent(f.calls.find((c) => /Requisitions\?/.test(c.url)).url), /siteNumber=CX_1.*keyword="Operations Manager"/);
  assert.equal(await C.jobDetail(ob, oj[0], f), 'Lead operations.\n\n- 5 years');
});

test('without a careers link, Recruitee and BambooHR are tried by name too', async () => {
  const f = fakeFetch([['https://brio.bamboohr.com/careers/list', { result: [{ id: '1', jobOpeningName: 'Chief of Staff', location: { city: 'Austin', state: 'Texas' } }] }]]);
  const r = await C.checkCompany({ name: 'Brio' }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.deepEqual([r.patch.board.ats, r.patch.board.token, r.patch.board.guessed], ['bamboohr', 'brio', true]);
  assert.ok(f.calls.some((c) => c.url === 'https://brio.recruitee.com/api/offers/'));
});

test('without a careers link, a Phenom site is found on careers.<name>.com, only when it names the company', async () => {
  const page = phenomHtml([]).replace(/careers\.acme\.com/g, 'careers.freddiemac.com').replace('<head>', '<head><title>Careers at Freddie Mac</title>');
  const f = fakeFetch([['https://careers.freddiemac.com/', page]]);
  const b = await C.findBoard({ name: 'Freddie Mac' }, f);
  assert.deepEqual([b.ats, b.host, b.site, b.guessed], ['phenom', 'careers.freddiemac.com', 'us/en', true]);

  // Someone else's site at the guessed address isn't taken.
  const other = fakeFetch([['https://careers.freddiemac.com/', phenomHtml([])]]);
  assert.equal(await C.findBoard({ name: 'Freddie Mac' }, other), null);

  // A website you set is trusted, and its own /careers page is read too.
  const site = fakeFetch([['https://acme.io/careers', '<a href="https://acme.wd5.myworkdayjobs.com/en-US/Ext">Jobs</a>']]);
  const w = await C.findBoard({ name: 'Acme', website: 'https://www.acme.io' }, site);
  assert.deepEqual([w.ats, w.via, w.guessed], ['workday', 'page', undefined]);
});

test('recognises the newer boards from their links, and not the ATS makers\' own sites', () => {
  const cases = [
    ['https://acme.breezy.hr/p/abc-chief-of-staff', 'breezy', 'acme'],
    ['https://acme.pinpointhq.com/en/postings/1', 'pinpoint', 'acme'],
    ['https://ats.rippling.com/acme/jobs/1b2c', 'rippling', 'acme'],
    ['https://jobs.gem.com/acme/abc', 'gem', 'acme'],
    ['https://acme.teamtailor.com/jobs/123-chief-of-staff', 'teamtailor', 'acme'],
    ['https://acme.jobs.personio.de/job/77', 'personio', 'acme'],
  ];
  for (const [url, ats, token] of cases) {
    const b = C.detectBoard(url);
    assert.ok(b, url);
    assert.deepEqual([b.ats, b.token], [ats, token], url);
    assert.match(b.url, /^https:\/\//);
  }
  assert.equal(C.detectBoard('https://acme.jobs.personio.com/').url, 'https://acme.jobs.personio.com/');
  for (const u of ['https://www.bamboohr.com/pricing', 'https://app.recruitee.com/', 'https://help.breezy.hr/x', 'https://www.teamtailor.com/en/']) assert.equal(C.detectBoard(u), null, u);
  // "Powered by" links don't outvote the company's own board.
  assert.equal(C.boardFromHtml('<script src="https://acme.bamboohr.com/js/embed.js"></script><a href="https://www.bamboohr.com">Powered by BambooHR</a>').ats, 'bamboohr');
});

test('reads jobs from the newer boards', async () => {
  const rss = `<?xml version="1.0"?><rss xmlns:tt="https://teamtailor.com/locations"><channel>
    <item><title>Chief of Staff</title><link>https://acme.teamtailor.com/jobs/1-chief-of-staff</link><guid>tt-1</guid><pubDate>Sun, 27 Sep 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[<p>Run the <b>operating cadence</b>.</p>]]></description><remoteStatus>hybrid</remoteStatus>
      <tt:department>Ops</tt:department><tt:locations><tt:location><tt:city>Berlin</tt:city><tt:country>Germany</tt:country></tt:location></tt:locations></item>
  </channel></rss>`;
  const xml = `<?xml version="1.0"?><workzag-jobs><position><id>77</id><office>Munich</office><additionalOffices><office>Berlin</office></additionalOffices><department>Ops</department><name>Head of Operations &amp; Strategy</name>
    <jobDescriptions><jobDescription><name>Your role</name><value><![CDATA[<p>Lead ops.</p>]]></value></jobDescription></jobDescriptions><createdAt>2026-09-25T08:00:00+00:00</createdAt></position></workzag-jobs>`;
  const f = fakeFetch([
    ['https://acme.breezy.hr/json', [{ id: 'b1', name: 'BizOps Lead', url: 'https://acme.breezy.hr/p/b1', location: { name: 'Denver, CO', is_remote: true }, published_date: daysAgo(3), salary: '$120,000 - $150,000' }]],
    ['https://acme.pinpointhq.com/postings.json', { data: [{ id: 9, title: 'Chief of Staff', url: 'https://acme.pinpointhq.com/postings/9', location: { name: 'London' }, workplace_type: 'remote', description: '<p>Hello</p>' }] }],
    ['https://api.rippling.com/platform/api/ats/v1/board/acme/jobs', [{ uuid: 'r1', name: 'Ops Manager', url: 'https://ats.rippling.com/acme/jobs/r1', workLocation: { label: 'New York, NY' }, department: { label: 'Ops' } }]],
    ['https://api.gem.com/job_board/v0/acme/job_posts/', [{ id: 3, title: 'Chief of Staff', absolute_url: 'https://jobs.gem.com/acme/3', location: { name: 'SF' }, first_published_at: daysAgo(1), content: '<p>Own it</p>' }]],
    ['https://acme.teamtailor.com/jobs.rss', rss],
    ['https://acme.jobs.personio.de/xml?language=en', xml],
  ]);
  const read = (u) => C.listJobs(C.detectBoard(u), f, { now: NOW });
  const bz = await read('https://acme.breezy.hr');
  assert.deepEqual([bz[0].location, bz[0].pay.min, bz[0].postedAt], ['Denver, CO · Remote', 120000, daysAgo(3)]);
  assert.equal((await read('https://acme.pinpointhq.com'))[0].location, 'London · Remote');
  assert.equal((await read('https://ats.rippling.com/acme/jobs'))[0].id, 'r1');
  assert.equal((await read('https://jobs.gem.com/acme'))[0].text, 'Own it');
  const tt = await read('https://acme.teamtailor.com');
  assert.deepEqual([tt[0].id, tt[0].title, tt[0].location, tt[0].department, tt[0].text], ['tt-1', 'Chief of Staff', 'Berlin, Germany', 'Ops', 'Run the operating cadence.']);
  assert.equal(tt[0].postedAt, '2026-09-27T10:00:00.000Z');
  const ps = await read('https://acme.jobs.personio.de');
  assert.deepEqual([ps[0].title, ps[0].location, ps[0].url, ps[0].text], ['Head of Operations & Strategy', 'Munich · Berlin', 'https://acme.jobs.personio.de/job/77', 'Your role\nLead ops.']);
});

test('a Teamtailor careers site on the company\'s own domain is read through its feed', async () => {
  const f = fakeFetch([
    ['https://careers.acme.com/', '<html><link href="https://teamtailor-cdn.com/assets/app.css"></html>'],
    ['https://careers.acme.com/jobs.rss', '<rss><channel><item><title>Chief of Staff</title><link>https://careers.acme.com/jobs/1</link><guid>1</guid></item></channel></rss>'],
  ]);
  const r = await C.checkCompany({ name: 'Acme', careersUrl: 'https://careers.acme.com/' }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.deepEqual([r.patch.board.ats, r.patch.board.token, r.patch.board.url], ['teamtailor', 'careers.acme.com', 'https://careers.acme.com/jobs']);
  assert.equal(r.patch.jobs[0].url, 'https://careers.acme.com/jobs/1');
});

test('own careers site: the jobs it describes for search engines', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
    {"@type":"ListItem","item":{"@type":"JobPosting","title":"Chief of Staff","url":"/careers/chief-of-staff-4471","datePosted":"2026-09-28",
      "jobLocation":{"@type":"Place","address":{"addressLocality":"Arlington","addressRegion":"VA","addressCountry":{"name":"US"}}},
      "baseSalary":{"currency":"USD","value":{"minValue":150000,"maxValue":190000,"unitText":"YEAR"}},"description":"&lt;p&gt;Run the CEO's office.&lt;/p&gt;"}},
    {"@type":"ListItem","item":{"@type":"JobPosting","title":"Ops Manager","url":"https://acme.com/careers/ops-manager-12","jobLocationType":"TELECOMMUTE"}}]}</script>`;
  const jobs = C.siteJobs(html, 'https://acme.com/careers');
  assert.deepEqual(jobs.map((j) => [j.title, j.url, j.location]), [
    ['Chief of Staff', 'https://acme.com/careers/chief-of-staff-4471', 'Arlington, VA, US'],
    ['Ops Manager', 'https://acme.com/careers/ops-manager-12', 'Remote'],
  ]);
  assert.deepEqual([jobs[0].postedAt, jobs[0].pay.min, jobs[0].text], ['2026-09-28T00:00:00.000Z', 150000, "Run the CEO's office."]);
});

test('own careers site: links to postings, not to sections, other sites or "Apply"', () => {
  const html = `<nav><a href="/careers/benefits">Benefits</a><a href="/careers/life-at-acme">Life at Acme</a><a href="/careers/early-careers">Early careers</a><a href="/careers/students-and-graduates">Students and graduates</a></nav>
    <a href="/careers/jobs/4471"><h3>Chief of Staff</h3><span>Engineering</span><span>Arlington, VA</span></a>
    <a href="https://jobs.acme.com/job/operations-manager-remote-us">Operations Manager</a>
    <a href="/careers/jobs/4471">Apply</a>
    <a href="https://other.com/jobs/123">Someone else's job</a>
    <a href="/blog/2026/how-we-hire-1234">How we hire</a>`;
  const jobs = C.siteJobs(html, 'https://www.acme.com/careers');
  assert.deepEqual(jobs.map((j) => [j.title, j.url, j.location]), [
    ['Chief of Staff', 'https://www.acme.com/careers/jobs/4471', 'Arlington, VA'],
    ['Operations Manager', 'https://jobs.acme.com/job/operations-manager-remote-us', ''],
  ]);
  // A menu of sections under /careers/ isn't a job list, but /careers/jobs/<title> is.
  assert.deepEqual(C.siteJobs('<a href="/careers/students-and-graduates">Students and graduates</a><a href="/careers/our-hiring-process">Our hiring process</a>', 'https://acme.com/careers'), []);
  assert.equal(C.siteJobs('<a href="/careers/jobs/chief-of-staff">Chief of Staff</a><a href="/careers/jobs/ops-manager">Ops Manager</a>', 'https://acme.com/careers').length, 2);
  // One stray link isn't a job list.
  assert.deepEqual(C.siteJobs('<a href="/jobs/12345">Chief of Staff</a>', 'https://acme.com/'), []);
  assert.deepEqual(C.listingLinks('<a href="/careers/open-roles">See open roles</a><a href="/about">About</a><a href="https://x.com/jobs">Elsewhere</a>', 'https://acme.com/careers'), ['https://acme.com/careers/open-roles']);
});

test('checking a company with its own careers site: follows "See open roles", reads the postings, and scores them from their pages', async () => {
  let listing = `<a href="/careers/jobs/101-chief-of-staff">Chief of Staff</a><a href="/careers/jobs/102-data-engineer">Data Engineer</a>`;
  const f = fakeFetch([
    ['https://acme.com/careers', '<h1>Join us</h1><a href="/careers/benefits">Benefits</a><a href="/careers/openings">See open roles</a>'],
    ['https://acme.com/careers/openings', () => listing],
    ['https://acme.com/careers/jobs/101-chief-of-staff', '<script type="application/ld+json">{"@type":"JobPosting","title":"Chief of Staff","description":"<p>Partner with the CEO on strategy, planning and the operating cadence. 5+ years of experience.</p>"}</script>'],
  ]);
  const co = { name: 'Acme', careersUrl: 'https://acme.com/careers' };
  const scored = [];
  const scoreJob = (j) => (scored.push(j.title), { score: 70 });
  const r = await C.checkCompany(co, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW, scoreJob });
  assert.deepEqual([r.patch.board.ats, r.patch.board.url, r.patch.board.via], ['site', 'https://acme.com/careers/openings', 'page']);
  assert.equal(r.patch.openCount, 2);
  assert.deepEqual(r.patch.jobs.map((j) => [j.title, j.fit && j.fit.score]), [['Chief of Staff', 70]]);
  assert.deepEqual(scored, ['Chief of Staff']);

  // A new posting goes up on the site.
  listing += `<a href="/careers/jobs/103-deputy-chief-of-staff">Deputy Chief of Staff</a>`;
  const next = await C.checkCompany({ ...co, ...r.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW + 3600000 });
  assert.deepEqual(next.fresh.map((j) => j.title), ['Deputy Chief of Staff']);

  // The site stops listing jobs in its HTML: Sprout says it can't read it rather than "0 open".
  listing = '<div id="root"></div>';
  const gone = await C.checkCompany({ ...co, ...next.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW + 7200000 });
  assert.equal(gone.patch.checkError, 'no-board');
});

test('a careers page whose jobs are an ATS a click away is read through that ATS', async () => {
  const f = fakeFetch([
    ['https://acme.com/careers', '<a href="https://acme.com/careers/jobs">View all jobs</a>'],
    ['https://acme.com/careers/jobs', '<div id="BambooHR" data-domain="acme.bamboohr.com"></div><script src="https://acme.bamboohr.com/js/embed.js"></script>'],
    ['https://acme.bamboohr.com/careers/list', { result: [{ id: '1', jobOpeningName: 'Chief of Staff' }] }],
  ]);
  const r = await C.checkCompany({ name: 'Acme', careersUrl: 'https://acme.com/careers' }, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.deepEqual([r.patch.board.ats, r.patch.board.token], ['bamboohr', 'acme']);
  assert.equal(f.calls.find((c) => /careers\/list/.test(c.url)).opts.headers['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(r.patch.jobs.length, 1);
});
