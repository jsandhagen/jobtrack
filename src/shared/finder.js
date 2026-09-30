// Company finder: what you're looking for in an employer, and how well each
// company Claude found matches it.
//
// Claude finds the companies and their employee ratings (src/main/claude.js,
// findCompanies); the match score is worked out here, on your computer, so
// changing what matters to you re-ranks the list without another Claude call.
// The same companies with the same preferences always get the same score.
//
// Loaded with require() in tests and the app, and as a plain <script> in the
// dashboard (window.SproutFinder).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SproutFinder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const splitList = (s) =>
    (Array.isArray(s) ? s : String(s || '').split(/[,;\n·|]+/))
      .map(clean)
      .filter(Boolean);
  const words = (s) =>
    clean(s)
      .toLowerCase()
      .replace(/&/g, ' and ')
      // Two-word names for one thing, so "learning" alone doesn't mean AI.
      .replace(/\bmachine[\s-]+learning\b/g, 'ml')
      .replace(/\bartificial[\s-]+intelligence\b/g, 'ai')
      .replace(/\blife[\s-]+sciences?\b/g, 'biotech')
      .replace(/\bnon[\s-]+profit/g, 'nonprofit')
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 1 && !STOP.has(w));
  const STOP = new Set(['and', 'the', 'of', 'for', 'in', 'tech', 'technology', 'services', 'industry', 'company', 'companies', 'sector', 'public', 'non', 'profit']);

  // Industries offered as one-click chips; any other text works too.
  const INDUSTRIES = [
    'AI / machine learning',
    'Fintech',
    'Healthcare',
    'Climate & energy',
    'Education',
    'Enterprise software',
    'Developer tools',
    'Consumer',
    'E-commerce',
    'Media & entertainment',
    'Gaming',
    'Cybersecurity',
    'Biotech',
    'Government & public sector',
    'Nonprofit',
    'Consulting',
    'Manufacturing',
    'Transportation',
  ];

  // Words that mean the same industry, so "Fintech" matches "Financial services".
  const ALIASES = {
    ai: ['ml', 'llm', 'llms', 'genai'],
    fintech: ['financial', 'finance', 'banking', 'payments', 'insurance', 'insurtech'],
    healthcare: ['health', 'medical', 'healthtech', 'hospital', 'clinical'],
    climate: ['energy', 'cleantech', 'sustainability', 'renewable', 'solar'],
    education: ['edtech', 'school', 'schools', 'university', 'universities'],
    enterprise: ['saas', 'b2b', 'software'],
    developer: ['devtools', 'infrastructure', 'cloud'],
    consumer: ['b2c', 'retail'],
    commerce: ['ecommerce', 'retail', 'marketplace'],
    media: ['entertainment', 'publishing', 'streaming', 'news'],
    gaming: ['games', 'game'],
    cybersecurity: ['security', 'infosec'],
    biotech: ['biotechnology', 'pharma', 'pharmaceutical', 'pharmaceuticals'],
    government: ['govtech', 'federal', 'defense', 'civic'],
    nonprofit: ['nonprofits', 'ngo', 'charity', 'philanthropy'],
    transportation: ['logistics', 'mobility', 'automotive'],
  };
  const expand = (ws) => {
    const out = new Set(ws);
    for (const w of ws) for (const [k, list] of Object.entries(ALIASES)) if (w === k || list.includes(w)) [k, ...list].forEach((x) => out.add(x));
    return out;
  };

  const SIZES = [
    ['startup', 'Startup (under 200)'],
    ['mid', 'Mid-size (200–2,000)'],
    ['large', 'Large (2,000+)'],
  ];

  // What can matter most, and the rating each one reads.
  const PRIORITIES = [
    ['work_life', 'Work-life balance'],
    ['pay', 'Pay & benefits'],
    ['culture', 'Culture & values'],
    ['growth', 'Career growth'],
    ['leadership', 'Leadership'],
  ];
  const RATING_KEYS = ['overall', ...PRIORITIES.map(([k]) => k)];
  const RATING_LABEL = { overall: 'Overall', ...Object.fromEntries(PRIORITIES) };
  const MAX_PRIORITIES = 3;

  const DEFAULT_PREFS = { industries: [], sizes: [], location: '', remote: false, minRating: 0, priorities: [], notes: '' };

  function normalizePrefs(p = {}) {
    const sizes = SIZES.map(([k]) => k);
    const prio = PRIORITIES.map(([k]) => k);
    return {
      industries: splitList(p.industries).slice(0, 12),
      sizes: (p.sizes || []).filter((s) => sizes.includes(s)),
      location: clean(p.location),
      remote: !!p.remote,
      minRating: Math.min(5, Math.max(0, Number(p.minRating) || 0)),
      priorities: [...new Set((p.priorities || []).filter((k) => prio.includes(k)))].slice(0, MAX_PRIORITIES),
      notes: clean(p.notes).slice(0, 400),
    };
  }

  // One rating per key from all the sources that have it, weighted by how many
  // reviews each has (a source without a count counts as 50). 0 = unknown.
  function combinedRatings(ratings = []) {
    const out = {};
    for (const k of RATING_KEYS) {
      let sum = 0;
      let w = 0;
      for (const r of ratings) {
        const v = Number(r[k]);
        if (!(v >= 1 && v <= 5)) continue;
        const weight = Math.max(1, Math.min(5000, Number(r.reviewCount) || 50));
        sum += v * weight;
        w += weight;
      }
      out[k] = w ? Math.round((sum / w) * 10) / 10 : 0;
    }
    return out;
  }

  // 2.5 stars or less counts for nothing, 4.5 or more for everything.
  const stars = (v) => Math.max(0, Math.min(1, (v - 2.5) / 2));

  function industryMatch(prefs, company) {
    if (!prefs.industries.length) return null;
    const theirs = expand(words(company.industry));
    return prefs.industries.find((ind) => [...expand(words(ind))].some((w) => theirs.has(w))) || '';
  }

  function locationMatch(prefs, company) {
    const remoteOk = ['remote', 'hybrid'].includes(company.remotePolicy);
    if (prefs.remote && company.remotePolicy === 'remote') return { ok: true, why: 'Remote-friendly' };
    if (prefs.location) {
      const place = words(prefs.location).filter((w) => !['usa', 'us', 'area', 'metro', 'greater'].includes(w));
      const where = words(`${company.headquarters || ''} ${(company.offices || []).join(' ')}`);
      if (place.length && place.some((w) => where.includes(w))) return { ok: true, why: `Office near ${prefs.location}` };
    }
    if (prefs.remote && remoteOk) return { ok: true, why: 'Hybrid, some remote' };
    if (!prefs.remote && !prefs.location) return { ok: true, why: '' };
    if (company.remotePolicy === 'unknown' && !company.headquarters) return { ok: null, why: 'Location not known' };
    return { ok: false, why: prefs.remote ? 'Not known to hire remotely' : `No office near ${prefs.location} found` };
  }

  /**
   * How well a company matches what you're looking for, 0–100, with the parts
   * that make it up. `ctx.connections` is how many LinkedIn connections and
   * people on your list work there; `ctx.avoid` is Profile's avoid keywords.
   *
   *   employee ratings  50  (overall 30, the things that matter most to you 20)
   *   industry          20
   *   size              10
   *   location/remote   10
   *   people you know   10
   */
  function matchScore(company, prefsIn = {}, ctx = {}) {
    const prefs = normalizePrefs(prefsIn);
    const r = combinedRatings(company.ratings);
    const parts = [];
    const flags = [];

    // Ratings: unknown ones count as middling, so a company isn't buried for
    // having no reviews, nor lifted by it.
    const overall = r.overall ? stars(r.overall) : 0.5;
    parts.push({ key: 'overall', label: r.overall ? `Rated ${r.overall.toFixed(1)} overall` : 'No overall rating found', pts: Math.round(overall * 30), max: 30 });
    const prio = prefs.priorities.length ? prefs.priorities : [];
    if (prio.length) {
      const vals = prio.map((k) => r[k]);
      const known = vals.filter(Boolean);
      const v = known.length ? known.reduce((a, b) => a + stars(b), 0) / known.length : overall;
      const label = known.length ? prio.filter((k) => r[k]).map((k) => `${RATING_LABEL[k]} ${r[k].toFixed(1)}`).join(', ') : 'No ratings found for what matters most to you';
      parts.push({ key: 'priorities', label, pts: Math.round(v * 20), max: 20 });
    } else parts.push({ key: 'priorities', label: r.overall ? 'Overall rating (pick what matters most for more)' : 'No ratings found', pts: Math.round(overall * 20), max: 20 });

    const ind = industryMatch(prefs, company);
    parts.push({ key: 'industry', label: ind === null ? 'Any industry' : ind ? `In ${ind}` : `${company.industry || 'Industry'} isn't one you picked`, pts: ind === null ? 15 : ind ? 20 : 4, max: 20 });

    const size = company.size || 'unknown';
    const sizeOk = !prefs.sizes.length || prefs.sizes.includes(size);
    const sizeLabel = (SIZES.find(([k]) => k === size) || [, 'Size not known'])[1];
    parts.push({ key: 'size', label: !prefs.sizes.length ? 'Any size' : size === 'unknown' ? 'Size not known' : sizeOk ? sizeLabel : `${sizeLabel}, not a size you picked`, pts: sizeOk && (size !== 'unknown' || !prefs.sizes.length) ? 10 : size === 'unknown' ? 5 : 0, max: 10 });

    const loc = locationMatch(prefs, company);
    parts.push({ key: 'location', label: loc.why || 'Anywhere', pts: loc.ok ? 10 : loc.ok === null ? 5 : 0, max: 10 });

    const n = Number(ctx.connections) || 0;
    parts.push({ key: 'network', label: n ? `You know ${n} ${n === 1 ? 'person' : 'people'} there` : 'No one you know there yet', pts: n >= 3 ? 10 : n ? 6 : 0, max: 10 });

    let score = parts.reduce((a, p) => a + p.pts, 0);
    if (prefs.minRating && r.overall && r.overall < prefs.minRating) {
      flags.push({ kind: 'below', text: `Rated ${r.overall.toFixed(1)}, under your ${prefs.minRating.toFixed(1)} minimum` });
      score = Math.min(score, 40);
    }
    const avoid = splitList(ctx.avoid).find((a) => {
      const aw = words(a);
      const text = words(`${company.industry || ''} ${company.summary || ''}`);
      return aw.length && aw.every((w) => text.includes(w));
    });
    if (avoid) {
      flags.push({ kind: 'avoid', text: `Mentions "${avoid}", which you want to avoid` });
      score = Math.min(score, 25);
    }
    return { score: Math.max(0, Math.min(100, score)), parts, flags, ratings: r };
  }

  const matchLabel = (score) => (score >= 75 ? 'Great match' : score >= 60 ? 'Good match' : score >= 45 ? 'Some match' : 'Weak match');

  // Where to read the reviews yourself. Searches, so they never point at the wrong page.
  function reviewLinks(name) {
    const q = encodeURIComponent(clean(name));
    return [
      ['Glassdoor', `https://www.glassdoor.com/Search/results.htm?keyword=${q}`],
      ['Indeed', `https://www.indeed.com/cmp?q=${q}`],
      ['Comparably', `https://www.google.com/search?q=${encodeURIComponent(`site:comparably.com ${clean(name)}`)}`],
      ['Blind', `https://www.teamblind.com/search/${q}`],
    ];
  }

  // Results sorted for the list.
  function sortResults(list, sort = 'match') {
    const by = {
      match: (a, b) => b.match.score - a.match.score,
      rating: (a, b) => (b.match.ratings.overall || 0) - (a.match.ratings.overall || 0) || b.match.score - a.match.score,
      name: (a, b) => a.company.name.localeCompare(b.company.name),
    }[sort] || ((a, b) => b.match.score - a.match.score);
    return [...list].sort((a, b) => by(a, b) || a.company.name.localeCompare(b.company.name));
  }

  return { INDUSTRIES, SIZES, PRIORITIES, RATING_KEYS, RATING_LABEL, MAX_PRIORITIES, DEFAULT_PREFS, normalizePrefs, combinedRatings, matchScore, matchLabel, reviewLinks, sortResults, industryMatch };
});
