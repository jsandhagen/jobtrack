const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const F = require('../src/shared/finder');
const P = require('../src/main/prompts');
const claude = require('../src/main/claude');
const { Store } = require('../src/main/store');

const co = (over = {}) => ({
  name: 'Acme',
  industry: 'Financial services: payments',
  size: 'mid',
  remotePolicy: 'remote',
  headquarters: 'New York, NY',
  summary: 'Payments for small businesses.',
  ratings: [{ source: 'Glassdoor', url: 'https://www.glassdoor.com/Reviews/Acme-Reviews-E1.htm', reviewCount: 800, overall: 4.4, work_life: 4.2, pay: 4.5, culture: 4.3, growth: 3.9, leadership: 4.0 }],
  ...over,
});
const PREFS = { industries: ['Fintech'], sizes: ['mid'], remote: true, priorities: ['pay', 'work_life'] };

test('a well-rated company in your industry, size and remote gets a high score; each part is explained', () => {
  const m = F.matchScore(co(), PREFS, { connections: 3 });
  assert.ok(m.score >= 85, `score ${m.score}`);
  assert.equal(m.parts.reduce((a, p) => a + p.max, 0), 100);
  assert.equal(m.parts.reduce((a, p) => a + p.pts, 0), m.score);
  assert.match(m.parts.find((p) => p.key === 'priorities').label, /Pay & benefits 4\.5/);
  assert.match(m.parts.find((p) => p.key === 'industry').label, /Fintech/);
  assert.deepEqual(m.flags, []);
});

test('low ratings, the wrong industry and on-site work score lower; the same input always scores the same', () => {
  const good = F.matchScore(co(), PREFS).score;
  const low = F.matchScore(co({ ratings: [{ source: 'Indeed', url: 'https://x.com/a', overall: 2.9, pay: 2.6 }] }), PREFS).score;
  const other = F.matchScore(co({ industry: 'Video games', remotePolicy: 'onsite' }), PREFS).score;
  assert.ok(low < good && other < good);
  assert.equal(F.matchScore(co(), PREFS).score, good);
});

test('the things that matter most read their own ratings', () => {
  const lifeBad = co({ ratings: [{ source: 'G', url: 'https://g.com/a', overall: 4.2, work_life: 2.6, pay: 4.6 }] });
  assert.ok(F.matchScore(lifeBad, { priorities: ['pay'] }).score > F.matchScore(lifeBad, { priorities: ['work_life'] }).score);
});

test('no ratings found counts as middling, not zero', () => {
  const m = F.matchScore(co({ ratings: [] }), PREFS);
  assert.equal(m.parts.find((p) => p.key === 'overall').pts, 15);
  assert.match(m.parts.find((p) => p.key === 'overall').label, /No overall rating/);
});

test('below your minimum rating, or something you avoid, is flagged and capped', () => {
  const below = F.matchScore(co(), { ...PREFS, minRating: 4.5 });
  assert.equal(below.flags[0].kind, 'below');
  assert.ok(below.score <= 40);
  const avoid = F.matchScore(co({ industry: 'Crypto trading' }), PREFS, { avoid: 'crypto, gambling' });
  assert.equal(avoid.flags[0].kind, 'avoid');
  assert.ok(avoid.score <= 25);
});

test('industries match by meaning, not by stray words', () => {
  const prefs = F.normalizePrefs({ industries: ['Fintech', 'AI / machine learning'] });
  assert.equal(F.industryMatch(prefs, { industry: 'Banking software' }), 'Fintech');
  assert.equal(F.industryMatch(prefs, { industry: 'Artificial intelligence' }), 'AI / machine learning');
  assert.equal(F.industryMatch(prefs, { industry: 'Edtech: online learning' }), '');
  assert.equal(F.industryMatch(F.normalizePrefs({ industries: ['Government & public sector'] }), { industry: 'Public company, consumer retail' }), '');
  assert.equal(F.industryMatch(F.normalizePrefs({}), { industry: 'Anything' }), null);
});

test('ratings from several sites are combined by how many reviews each has', () => {
  const r = F.combinedRatings([
    { overall: 4.0, reviewCount: 900, pay: 0 },
    { overall: 3.0, reviewCount: 100, pay: 3.5 },
  ]);
  assert.equal(r.overall, 3.9);
  assert.equal(r.pay, 3.5);
  assert.equal(r.culture, 0);
});

test('preferences are cleaned: known sizes and priorities only, at most three priorities', () => {
  const p = F.normalizePrefs({ industries: 'Fintech, Climate', sizes: ['mid', 'huge'], priorities: ['pay', 'culture', 'growth', 'leadership', 'nope'], minRating: '9' });
  assert.deepEqual(p.industries, ['Fintech', 'Climate']);
  assert.deepEqual(p.sizes, ['mid']);
  assert.deepEqual(p.priorities, ['pay', 'culture', 'growth']);
  assert.equal(p.minRating, 5);
});

test('review links are searches on the review sites', () => {
  const links = F.reviewLinks('Acme & Co');
  assert.deepEqual(links.map(([n]) => n), ['Glassdoor', 'Indeed', 'Comparably', 'Blind']);
  assert.ok(links.every(([, u]) => /^https:\/\//.test(u) && u.includes('Acme')));
});

test('the finder prompt says what you want, who you are, and whom to leave out', () => {
  const block = P.finderBlock({ prefs: F.normalizePrefs(PREFS), profile: { targetRoles: 'Chief of Staff', avoidKeywords: 'crypto' }, exclude: ['Stripe'], sizes: Object.fromEntries(F.SIZES), priorities: Object.fromEntries(F.PRIORITIES) });
  assert.match(block, /Industries: Fintech/);
  assert.match(block, /Mid-size/);
  assert.match(block, /Cares most about: Pay & benefits, Work-life balance/);
  assert.match(block, /Target roles: Chief of Staff/);
  assert.match(block, /<exclude>\nStripe\n<\/exclude>/);
  assert.doesNotMatch(block, /<look_up>/);
  assert.match(P.finderBlock({ lookup: ['Notion'] }), /<look_up>\nNotion\n<\/look_up>/);
  for (const k of ['finderResearch', 'finderExtract']) assert.match(P.TASKS[k], /^<task>[\s\S]+<\/task>$/);
});

// A client whose web research pauses once, then finishes; the extraction step
// returns `extracted`.
function finderClient(extracted) {
  const creates = [];
  const parses = [];
  const search = (url) => ({ type: 'web_search_tool_result', tool_use_id: 't', content: [{ type: 'web_search_result', url, title: 'Reviews' }] });
  const turns = [
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 't1', name: 'web_search', input: { query: 'acme reviews', url: 'https://made-up.example/acme' } }, search('https://www.glassdoor.com/Reviews/Acme-Reviews-E1.htm?sort=new')] },
    { stop_reason: 'end_turn', content: [search('https://www.indeed.com/cmp/Beta-Inc/reviews'), { type: 'text', text: 'Acme: Glassdoor 4.4 …', citations: [{ type: 'web_search_result_location', url: 'https://www.comparably.com/companies/acme' }] }] },
  ];
  return {
    creates,
    parses,
    beta: {
      messages: {
        create: async (p) => (creates.push(JSON.parse(JSON.stringify(p))), { model: p.model, usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 2 } }, ...turns[creates.length - 1] }),
        parse: async (p) => (parses.push(p), { stop_reason: 'end_turn', parsed_output: extracted }),
      },
    },
  };
}

const rating = (url, overall) => ({ source: 'Glassdoor', source_url: url, as_of: 'Sep 2026', review_count: 812, overall, work_life: 4.1, pay: 0, culture: 0, growth: 0, leadership: 0 });
const found = (name, ratings, over = {}) => ({ name, website: 'https://acme.com', careers_url: 'not a link', industry: 'Fintech', size: 'mid', employees: 'about 900', headquarters: 'NYC', offices: [], remote_policy: 'remote', summary: 'Payments.', why_it_fits: 'You want fintech.', concerns: [], ratings, ...over });

test('company finder: resumes a paused search, keeps only ratings whose page the search returned, and drops excluded companies', async () => {
  const client = finderClient({
    companies: [
      found('Acme', [rating('https://glassdoor.com/Reviews/Acme-Reviews-E1.htm', 4.4), rating('https://made-up.example/acme', 4.9), rating('https://www.comparably.com/companies/acme', 7)]),
      found('Beta, Inc.', [rating('https://www.indeed.com/cmp/Beta-Inc/reviews/', 3.8)]),
      found('Stripe', []),
      found('acme inc', []),
    ],
  });
  const out = await claude.findCompanies(client, { prefs: F.normalizePrefs(PREFS), profile: {}, exclude: ['Stripe'] });

  // The paused turn is sent back as it was, with no extra user message.
  assert.equal(client.creates.length, 2);
  assert.deepEqual(client.creates[0].tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 15 }]);
  assert.deepEqual(client.creates[1].messages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(client.creates[1].messages[1].content[0].type, 'server_tool_use');
  assert.match(client.parses[0].messages[0].content, /<research_notes>\nAcme: Glassdoor 4\.4/);

  assert.deepEqual(out.companies.map((c) => c.name), ['Acme', 'Beta, Inc.']);
  const acme = out.companies[0];
  // The made-up page (only in Claude's own tool input) and the rating on another scale are dropped.
  assert.deepEqual(acme.ratings.map((r) => r.overall), [4.4]);
  assert.equal(acme.ratings[0].reviewCount, 812);
  assert.equal(acme.careersUrl, '');
  assert.equal(acme.website, 'https://acme.com');
  assert.equal(out.unverified, 2);
  assert.equal(out.companies[1].ratings[0].overall, 3.8);
});

test('older models get the web search tool they support', async () => {
  const client = finderClient({ companies: [] });
  await claude.findCompanies(client, { prefs: {}, profile: {}, model: 'claude-haiku-4-5' });
  assert.equal(client.creates[0].tools[0].type, 'web_search_20250305');
});

test('web searches count toward the cost estimate', () => {
  const base = claude.estimateCost('claude-opus-5-5', { input_tokens: 1000 });
  assert.equal(Math.round((claude.estimateCost('claude-opus-5-5', { input_tokens: 1000, server_tool_use: { web_search_requests: 3 } }) - base) * 100) / 100, 0.03);
});

test('the finder keeps its preferences, results and dismissed companies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-'));
  const s = new Store(dir);
  assert.deepEqual(s.getFinder(), { prefs: {}, results: [], dismissed: [], lastRun: null });
  s.updateFinder({ prefs: { industries: ['Fintech'] }, dismissed: ['Acme'] });
  const again = new Store(dir).getFinder();
  assert.deepEqual(again.prefs, { industries: ['Fintech'] });
  assert.deepEqual(again.dismissed, ['Acme']);
});
