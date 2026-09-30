const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/main/careers');

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
    ['https://boards-api.greenhouse.io/v1/boards/gh/jobs', { jobs: [{ id: 1, title: 'Chief of Staff', location: { name: 'NYC' }, absolute_url: 'https://job-boards.greenhouse.io/gh/jobs/1', first_published: daysAgo(2), updated_at: daysAgo(1) }] }],
    ['https://api.lever.co/v0/postings/lv?mode=json', [{ id: 'a1', text: 'Ops Manager', categories: { location: 'Remote', team: 'Ops' }, hostedUrl: 'https://jobs.lever.co/lv/a1', createdAt: NOW - 86400000 }]],
    ['https://api.ashbyhq.com/posting-api/job-board/ab', { jobs: [{ id: 'x', title: 'BizOps Lead', location: 'SF', isRemote: true, jobUrl: 'https://jobs.ashbyhq.com/ab/x', publishedAt: daysAgo(5) }, { id: 'hidden', title: 'Secret', isListed: false }] }],
    ['https://apply.workable.com/api/v1/widget/accounts/wk', { jobs: [{ shortcode: 'S1', title: 'Chief of Staff', city: 'Austin', state: 'TX', country: 'US', url: 'https://apply.workable.com/wk/j/S1/', published_on: '2026-09-20' }] }],
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
    ['https://boards-api.greenhouse.io/v1/boards/octa/jobs', () => ({ jobs })],
  ]);
  const co = { id: 'c1', name: 'OCTA', careersUrl: 'https://octa.example.com/careers' };
  const first = await C.checkCompany(co, { fetchImpl: f, roles: ['Chief of Staff'], now: NOW });
  assert.equal(first.patch.board.ats, 'greenhouse');
  assert.equal(first.patch.board.via, 'page');
  assert.equal(first.patch.openCount, 2);
  assert.deepEqual(first.patch.jobs.map((j) => j.title), ['Chief of Staff']);
  assert.equal(first.patch.jobs[0].firstSeenAt, null, 'jobs already up on the first check are not "new"');
  assert.deepEqual(first.fresh, []);

  // A new matching role goes up, and a new non-matching one.
  jobs = [...jobs, { id: 3, title: 'Deputy Chief of Staff', location: { name: 'Remote' }, absolute_url: 'u3', first_published: daysAgo(0) }, { id: 4, title: 'Designer', absolute_url: 'u4' }];
  const later = NOW + 6 * 3600000;
  const second = await C.checkCompany({ ...co, ...first.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: later });
  assert.deepEqual(second.fresh.map((j) => j.title), ['Deputy Chief of Staff']);
  assert.deepEqual(second.patch.jobs.map((j) => j.title), ['Deputy Chief of Staff', 'Chief of Staff'], 'newest first');
  assert.equal(second.patch.jobs[0].firstSeenAt, new Date(later).toISOString());

  // The next check doesn't announce it again.
  const third = await C.checkCompany({ ...co, ...second.patch }, { fetchImpl: f, roles: ['Chief of Staff'], now: later + 3600000 });
  assert.deepEqual(third.fresh, []);
  assert.equal(third.patch.jobs[0].firstSeenAt, new Date(later).toISOString());
});

test('without a careers link, the company name is tried on the common boards', async () => {
  const f = fakeFetch([['https://api.ashbyhq.com/posting-api/job-board/ramp', { jobs: [{ id: 'j', title: 'Chief of Staff', jobUrl: 'u', publishedAt: daysAgo(1) }] }]]);
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
