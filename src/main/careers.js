// Reads open jobs straight from the careers sites of companies you watch.
//
// Most companies' careers pages are hosted by an applicant tracking system
// that also publishes the jobs as data, meant for exactly this: Greenhouse,
// Lever, Ashby, Workable, SmartRecruiters, Workday, Recruitee, BambooHR,
// Breezy, Pinpoint, Rippling, Gem, Teamtailor, Personio, Oracle Cloud and
// Phenom (the careers.company.com/us/en/search-results sites many large
// companies run). So Sprout works out
// which one a company uses (from its careers link, from the careers page's
// HTML, or by trying the company's name on the common ones), lists the open
// jobs, keeps the ones whose titles match the roles you want, and notices
// new ones on each check.
//
// A company that runs its own careers site gets read straight from that
// site: the jobs it describes for search engines (schema.org JobPosting),
// or failing that, the links to its postings.
//
// Every network call goes through the fetch passed in (Electron's net.fetch
// in the app, a fake in tests).

const ATS_LABEL = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  smartrecruiters: 'SmartRecruiters',
  workday: 'Workday',
  recruitee: 'Recruitee',
  bamboohr: 'BambooHR',
  oracle: 'Oracle',
  phenom: 'Phenom',
  breezy: 'Breezy',
  pinpoint: 'Pinpoint',
  rippling: 'Rippling',
  gem: 'Gem',
  teamtailor: 'Teamtailor',
  personio: 'Personio',
  site: 'careers page',
};

const DAY = 86400000;
const TIMEOUT_MS = 20000;
const WORKDAY_MAX = 100; // postings read per search on a Workday board
const SEARCH_MAX = 100; // the same for Oracle and Phenom boards

// ---------------- which careers site is this? ----------------

// A link as people paste it: no scheme, wrapped in <>, trailing punctuation.
function normalizeLink(url) {
  let u = String(url || '')
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[.,;:!?)\]]+$/, '');
  if (u.startsWith('//')) u = `https:${u}`;
  else if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(u)) u = `https://${u}`;
  return u;
}

// A board from any link to it (a careers page URL, one found in its HTML, or
// the board's own API address).
function detectBoard(url) {
  const u = normalizeLink(url);
  let m;
  // Greenhouse: boards/job-boards pages, embeds (job_board, job_app) and the API.
  if ((m = u.match(/greenhouse\.io\/embed\/job_(?:board|app)(?:\/js)?\?(?:[^#\s]*&)?for=([A-Za-z0-9_-]+)/i))) return board('greenhouse', m[1]);
  if ((m = u.match(/boards-api(?:\.eu)?\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/i))) return board('greenhouse', m[1]);
  if ((m = u.match(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9_-]+)/i)) && !/^(embed|v1|api)$/i.test(m[1])) return board('greenhouse', m[1]);
  if ((m = u.match(/(?:jobs|api)\.(eu\.)?lever\.co\/(?:v0\/postings\/)?([A-Za-z0-9_.-]+)/i)) && !/^v0$/i.test(m[2])) return board('lever', m[2].replace(/\.+$/, ''), { region: m[1] ? 'eu' : '' });
  if ((m = u.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([A-Za-z0-9_.%-]+)/i))) return board('ashby', safeDecode(m[1]));
  if ((m = u.match(/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i)) && !/^api$/i.test(m[1])) return board('ashby', safeDecode(m[1]).replace(/\.+$/, ''));
  if ((m = u.match(/apply\.workable\.com\/(?:api\/v\d\/(?:widget\/)?accounts\/)?([A-Za-z0-9_-]+)/i)) && !/^(api|j)$/i.test(m[1])) return board('workable', m[1]);
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.workable\.com/i)) && !/^(apply|www|jobs|help|resources)$/i.test(m[1])) return board('workable', m[1]);
  if ((m = u.match(/api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/i))) return board('smartrecruiters', m[1]);
  if ((m = u.match(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i))) return board('smartrecruiters', m[1]);
  // Workday: tenant.wd5.myworkdayjobs.com/en-US/Site, its API (/wday/cxs/tenant/Site),
  // or wd3.myworkdaysite.com/recruiting/tenant/Site
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/wday\/cxs\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/i))) return board('workday', m[3], { host: `${m[1]}.${m[2]}.myworkdayjobs.com`, site: m[4] });
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?([A-Za-z0-9_-]+)/i)) && !/^(wday|job|details)$/i.test(m[3])) return board('workday', m[1], { host: `${m[1]}.${m[2]}.myworkdayjobs.com`, site: m[3] });
  if ((m = u.match(/\/\/(wd\d+)\.myworkdaysite\.com\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?recruiting\/([A-Za-z0-9-]+)\/([A-Za-z0-9_-]+)/i))) return board('workday', m[2], { host: `${m[1]}.myworkdaysite.com`, site: m[3] });
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.recruitee\.com/i)) && !/^(www|api|app|blog|support|docs)$/i.test(m[1])) return board('recruitee', m[1].toLowerCase());
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.bamboohr\.com/i)) && !/^(www|api|app|help|partners|marketplace)$/i.test(m[1])) return board('bamboohr', m[1].toLowerCase());
  // Oracle Cloud: host.fa.region.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/...
  if ((m = u.match(/\/\/(([A-Za-z0-9-]+)\.fa(?:\.[A-Za-z0-9-]+)*\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?sites\/([A-Za-z0-9_-]+)/i))) return board('oracle', m[2].toLowerCase(), { host: m[1].toLowerCase(), site: m[3] });
  // Boards on the company's own subdomain of the ATS: acme.recruitee.com and the like.
  // The ATS's own sites (www, app, help…) aren't anyone's board.
  const sub = (domain, not = /^(www|app|api|help|support|docs|status|blog|marketplace|developers?|careers?)$/i) => {
    const x = u.match(new RegExp(`//([A-Za-z0-9-]+)\\.${domain.replace(/\./g, '\\.')}(?=[/:?#]|$)`, 'i'));
    return x && !not.test(x[1]) ? x[1] : null;
  };
  let t;
  if ((t = sub('breezy.hr'))) return board('breezy', t);
  if ((t = sub('pinpointhq.com'))) return board('pinpoint', t);
  if ((t = sub('teamtailor.com'))) return board('teamtailor', t);
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.jobs\.personio\.(de|com)(?=[/:?#]|$)/i))) return board('personio', m[1], { tld: m[2].toLowerCase() });
  if ((m = u.match(/api\.rippling\.com\/platform\/api\/ats\/v1\/board\/([A-Za-z0-9_-]+)/i))) return board('rippling', m[1]);
  if ((m = u.match(/ats\.rippling\.com\/(?:[a-z]{2}-[A-Za-z]{2}\/)?([A-Za-z0-9_-]+)(?:\/jobs|\/?$)/i)) && !/^(api|jobs)$/i.test(m[1])) return board('rippling', m[1]);
  if ((m = u.match(/api\.gem\.com\/job_board\/v0\/([A-Za-z0-9_-]+)/i))) return board('gem', m[1]);
  if ((m = u.match(/jobs\.gem\.com\/([A-Za-z0-9_-]+)/i)) && !/^(api|embed)$/i.test(m[1])) return board('gem', m[1]);
  return null;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const boardKey = (b) => `${b.ats}:${String(b.token).toLowerCase()}:${b.host || ''}:${b.site || ''}`;

function board(ats, token, extra = {}) {
  const b = { ats, token, ...extra };
  b.url = boardUrl(b);
  return b;
}

// Where a person would browse this board.
function boardUrl(b) {
  switch (b.ats) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${b.token}`;
    case 'lever':
      return `https://jobs.${b.region === 'eu' ? 'eu.' : ''}lever.co/${b.token}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${encodeURIComponent(b.token)}`;
    case 'workable':
      return `https://apply.workable.com/${b.token}/`;
    case 'smartrecruiters':
      return `https://careers.smartrecruiters.com/${b.token}`;
    case 'workday':
      return `https://${b.host}/${b.site}`;
    case 'recruitee':
      return `https://${b.token}.recruitee.com/`;
    case 'bamboohr':
      return `https://${b.token}.bamboohr.com/careers`;
    case 'oracle':
      return `https://${b.host}/hcmUI/CandidateExperience/en/sites/${b.site}/requisitions`;
    case 'phenom':
      return `https://${b.host}/${b.site}/search-results`;
    case 'breezy':
      return `https://${b.token}.breezy.hr/`;
    case 'pinpoint':
      return `https://${b.token}.pinpointhq.com/`;
    case 'rippling':
      return `https://ats.rippling.com/${b.token}/jobs`;
    case 'gem':
      return `https://jobs.gem.com/${b.token}`;
    case 'teamtailor':
      return `https://${teamtailorHost(b)}/jobs`;
    case 'personio':
      return `https://${b.token}.jobs.personio.${b.tld || 'de'}/`;
    case 'site':
      return b.token;
    default:
      return '';
  }
}

// Teamtailor sites live on acme.teamtailor.com or on the company's own domain.
const teamtailorHost = (b) => (String(b.token).includes('.') ? b.token : `${b.token}.teamtailor.com`);

// ---------------- Phenom ----------------
//
// Phenom sites live on the company's own domain (careers.freddiemac.com/us/en/
// search-results), so there's nothing in the link to go on. The page gives
// itself away: it loads from phenompeople.com and carries its data in a
// `phApp` script object, including the jobs for the search in its address.

// The value of the object literal assigned after `marker` ("phApp.ddo = {...}").
function scriptObject(html, marker) {
  const text = String(html || '');
  let at = text.indexOf(marker);
  while (at >= 0) {
    const start = text.indexOf('{', at + marker.length);
    if (start < 0) return null;
    if (/^\s*=?\s*$/.test(text.slice(at + marker.length, start))) {
      let depth = 0;
      let quote = null;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (quote) {
          if (c === '\\') i++;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
      return null;
    }
    at = text.indexOf(marker, at + marker.length);
  }
  return null;
}

// A Phenom board from a careers page: { ats: 'phenom', host, site: 'us/en' }.
function phenomFromPage(html, pageUrl) {
  const text = String(html || '');
  if (!/phenompeople\.com|phApp\.(ddo|pageName|baseUrl)|"widgetApiEndpoint"/i.test(text)) return null;
  const fromBase = text.match(/["']baseUrl["']\s*:\s*["'](https?:\/\/[^"'\s]+?)\/?["']/i);
  let u;
  try {
    u = new URL(fromBase ? fromBase[1].replace(/\\\//g, '/') : normalizeLink(pageUrl));
  } catch {
    return null;
  }
  // The locale is the first two parts of the path (/us/en/...), when there.
  const parts = u.pathname.split('/').filter(Boolean);
  const site = parts.length >= 2 && /^[a-z]{2,3}$/i.test(parts[0]) && /^[a-z]{2}(?:[-_][a-z]{2})?$/i.test(parts[1]) ? `${parts[0]}/${parts[1]}`.toLowerCase() : parts.length === 1 && /^[a-z]{2}(?:[-_][a-z]{2})?$/i.test(parts[0]) ? parts[0].toLowerCase() : 'us/en';
  const ref = text.match(/["']refNum["']\s*:\s*["']([A-Za-z0-9_-]+)["']/);
  return board('phenom', u.hostname.toLowerCase(), { host: u.hostname.toLowerCase(), site, ...(ref ? { refNum: ref[1] } : {}) });
}

const slugTitle = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'job';

function phenomJob(b, j) {
  const id = j.jobSeqNo || j.jobId || j.reqId;
  const loc = j.location || j.cityStateCountry || joinLoc(j.city, j.state, j.country);
  const more = Array.isArray(j.multi_location) && j.multi_location.length > 1 ? ` +${j.multi_location.length - 1} more` : '';
  return {
    id: id == null ? '' : String(id),
    title: j.title,
    location: loc ? loc + more : '',
    url: j.jobId ? `https://${b.host}/${b.site}/job/${encodeURIComponent(j.jobId)}/${slugTitle(j.title)}` : j.applyUrl,
    postedAt: iso(j.postedDate || j.dateCreated),
    department: j.category || (Array.isArray(j.multi_category) && j.multi_category[0]) || '',
    jobId: j.jobId ? String(j.jobId) : undefined,
  };
}

// One page of a Phenom search: { jobs, total }. The site's own widget API
// first (50 at a time), then the search page's built-in results (10 at a time).
async function phenomPage(b, term, from, fetchImpl) {
  const lang = b.site.split('/').reverse().join('_');
  const country = b.site.split('/')[0];
  try {
    const d = await getJson(fetchImpl, `https://${b.host}/widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, deviceType: 'desktop', country, pageName: 'search-results', ddoKey: 'refineSearch', sortBy: 'Most recent', subsearch: '', from, jobs: true, counts: true, all_fields: [], size: 50, clearAll: false, jdsource: 'facets', isSliderEnable: false, pageId: 'page1', siteType: 'external', keywords: term, global: true, selected_fields: {}, ...(b.refNum ? { refNum: b.refNum } : {}) }),
    });
    const r = d && d.refineSearch;
    if (r && r.data && Array.isArray(r.data.jobs)) return { jobs: r.data.jobs, total: Number(r.totalHits) || 0, size: 50 };
  } catch (err) {
    if (err.status === undefined && !err.notFound && !/sent back a page/.test(err.message)) throw err; // offline
  }
  const q = `keywords=${encodeURIComponent(term)}&from=${from}&s=1`;
  const page = await getText(fetchImpl, `https://${b.host}/${b.site}/search-results?${q}`);
  const ddo = scriptObject(page.text, 'phApp.ddo') || {};
  const r = ddo.eagerLoadRefineSearch || ddo.refineSearch;
  if (!r || !r.data || !Array.isArray(r.data.jobs)) throw failure("that careers site didn't list its jobs the way I expected.");
  return { jobs: r.data.jobs, total: Number(r.totalHits) || 0, size: 10 };
}

// Searching a big board once per role (Workday, Oracle, Phenom): one search
// failing shouldn't lose the others.
async function searchEach(searchTerms, run) {
  const terms = [...new Set((searchTerms.length ? searchTerms : ['']).map((t) => String(t).trim()))];
  let failed = null;
  let worked = 0;
  for (const term of terms) {
    try {
      await run(term);
      worked++;
    } catch (err) {
      if (err.notFound) throw err;
      failed = failed || err;
    }
  }
  if (!worked && failed) throw failed;
}

const oracleApi = (b) => `https://${b.host}/hcmRestApi/resources/latest`;

// A careers page on the company's own site usually embeds or links to its
// board. It may also link to other boards (a partner's, a portfolio
// company's), so take the one it points to most often.
function boardFromHtml(html) {
  const text = String(html || '')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;|&#47;/gi, '/');
  const re = /(?:https?:)?\/\/[^\s"'<>)\\]+|(?:boards|job-boards)\.greenhouse\.io\/embed\/job_(?:board|app)(?:\/js)?\?for=[A-Za-z0-9_-]+/gi;
  const found = new Map();
  for (const m of text.matchAll(re)) {
    const b = detectBoard(/^(https?:)?\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`);
    if (!b) continue;
    const k = boardKey(b);
    const f = found.get(k) || { b, n: 0 };
    f.n++;
    found.set(k, f);
  }
  let best = null;
  for (const f of found.values()) if (!best || f.n > best.n) best = f; // ties go to the first seen
  return best ? best.b : null;
}

// Names to try when there's no careers link: "Ramp" -> ramp; "Scale AI" -> scaleai,
// scale-ai; "Mercury Technologies" -> mercury, then mercurytechnologies.
function slugsFor(name) {
  const plain = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\([^)]*\)/g, ' ') // "Block (formerly Square)"
      .replace(/[\u2019']/g, '');
  const tidy = (s) => s.replace(/[^a-z0-9]+/g, ' ').trim();
  const full = tidy(plain(name).replace(/\b(inc|llc|ltd|corp|co|plc|gmbh)\b\.?/g, ' '));
  const base = tidy(plain(name).replace(/\b(inc|llc|ltd|plc|gmbh|corp|corporation|co|company|the|technologies|technology|labs|hq)\b\.?/g, ' '));
  const out = [];
  for (const b of [base, full]) if (b) out.push(b.replace(/ /g, ''), b.replace(/ /g, '-'));
  return [...new Set(out)].slice(0, 4);
}

// ---------------- HTTP ----------------

// Careers sites rate limit and have bad minutes. Retry what's worth
// retrying (no connection, 429, 5xx) a couple of times, then give up with a
// message a person can read. Tests set the delays to 0.
const http = { retryDelays: [1500, 5000], maxRetryAfterMs: 15000 };
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function failure(message, props = {}) {
  return Object.assign(new Error(message), props);
}

async function request(fetchImpl, url, init = {}, what = 'the careers site') {
  let lastErr;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      lastErr =
        err && (err.name === 'TimeoutError' || err.name === 'AbortError')
          ? failure(`${what} took too long to answer.`, { name: 'TimeoutError', transient: true })
          : failure(`I couldn't reach ${what}. Are you online?`, { transient: true, cause: err });
    }
    if (res) {
      if (res.ok) return res;
      if (res.status === 404 || res.status === 410) throw failure('not found', { notFound: true, status: res.status });
      const transient = res.status === 429 || res.status >= 500;
      lastErr = failure(res.status === 429 ? `${what} asked me to slow down. I'll try again later.` : `${what} answered ${res.status}`, { status: res.status, transient });
      if (!transient) throw lastErr;
    }
    // A site that took 20 seconds once won't be quicker straight away.
    if (attempt >= http.retryDelays.length || lastErr.name === 'TimeoutError') throw lastErr;
    const after = res && res.headers && typeof res.headers.get === 'function' ? Number(res.headers.get('retry-after')) : NaN;
    await sleep(Number.isFinite(after) && after >= 0 ? Math.min(after * 1000, http.maxRetryAfterMs) : http.retryDelays[attempt]);
  }
}

async function getJson(fetchImpl, url, init = {}) {
  const res = await request(fetchImpl, url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
  try {
    return await res.json();
  } catch {
    // A login wall, a bot check or a maintenance page instead of job data.
    throw failure("the careers site sent back a page instead of its job list. It may be blocking automated reads right now.", { transient: true });
  }
}

async function getText(fetchImpl, url, accept = 'text/html') {
  const res = await request(fetchImpl, url, { headers: { Accept: accept } }, 'the careers page');
  return { text: await res.text(), url: res.url || url };
}

// ---------------- reading jobs ----------------

// A date as ISO text. Seconds or milliseconds since 1970, or date text.
// Nonsense (before 2000, or days in the future) counts as unknown.
const iso = (v) => {
  if (v === null || v === undefined || v === '') return null;
  let t = typeof v === 'number' || /^\d{9,13}$/.test(String(v)) ? Number(v) : Date.parse(v);
  if (Number.isFinite(t) && t < 1e11) t *= 1000; // seconds
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.now() + 2 * DAY) return null;
  return new Date(t).toISOString();
};

// Workday says "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago".
function workdayPosted(text, now = Date.now()) {
  const s = String(text || '').toLowerCase();
  if (/today|just posted|hours? ago/.test(s)) return new Date(now).toISOString();
  if (/yesterday/.test(s)) return new Date(now - DAY).toISOString();
  const m = s.match(/(\d+)\+?\s*(days?|weeks?|months?)/);
  if (!m) return null;
  const unit = /^w/.test(m[2]) ? 7 : /^m/.test(m[2]) ? 30 : 1;
  return new Date(now - Number(m[1]) * unit * DAY).toISOString();
}

function joinLoc(...parts) {
  return parts.filter(Boolean).join(', ');
}

// Every open job on a board: [{ id, title, location, url, postedAt, department }].
// Workday boards can hold thousands of jobs, so those are searched by your
// roles instead of listed in full. Entries without a title or id are
// dropped, titles are tidied, and each job is listed once.
async function listJobs(b, fetchImpl, opts = {}) {
  const out = new Map();
  for (const j of await rawJobs(b, fetchImpl, opts)) {
    const id = j.id == null ? '' : String(j.id).trim();
    const title = tidyTitle(j.title);
    if (!id || id === 'undefined' || !title || out.has(id)) continue;
    const job = { ...j, id, title, location: tidyTitle(j.location), url: /^https?:\/\//i.test(j.url || '') ? j.url : b.url || '' };
    if (!job.pay && job.text) job.pay = payFromText(job.text);
    for (const k of Object.keys(job)) if (job[k] === undefined) delete job[k];
    out.set(id, job);
  }
  return [...out.values()];
}

function tidyTitle(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

async function rawJobs(b, fetchImpl, { searchTerms = [], now = Date.now() } = {}) {
  switch (b.ats) {
    case 'greenhouse': {
      // content=true: every description in one request (for pay and a fit preview).
      const d = await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs?content=true`);
      return (d.jobs || []).map((j) => ({ id: String(j.id), title: j.title, location: (j.location && j.location.name) || '', url: j.absolute_url || `${boardUrl(b)}/jobs/${j.id}`, postedAt: iso(j.first_published || j.updated_at), text: j.content ? htmlToPlain(j.content) : undefined }));
    }
    case 'lever': {
      const d = await getJson(fetchImpl, `https://api.${b.region === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${encodeURIComponent(b.token)}?mode=json`);
      return (Array.isArray(d) ? d : []).map((j) => ({
        id: String(j.id),
        title: j.text,
        location: (j.categories && (j.categories.allLocations || []).join(' · ')) || (j.categories && j.categories.location) || '',
        url: j.hostedUrl,
        postedAt: iso(j.createdAt),
        department: (j.categories && (j.categories.team || j.categories.department)) || '',
        workplace: j.workplaceType || '',
        pay: leverPay(j.salaryRange),
        text: leverText(j) || undefined,
      }));
    }
    case 'ashby': {
      const d = await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}?includeCompensation=true`);
      return (d.jobs || [])
        .filter((j) => j.isListed !== false)
        .map((j) => ({ id: String(j.id), title: j.title, location: [j.location, j.isRemote ? 'Remote' : ''].filter(Boolean).join(' · '), url: j.jobUrl, postedAt: iso(j.publishedAt), department: j.department || j.team || '', pay: ashbyPay(j.compensation), text: j.descriptionPlain || (j.descriptionHtml ? htmlToPlain(j.descriptionHtml) : undefined) }));
    }
    case 'workable': {
      const d = await getJson(fetchImpl, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(b.token)}?details=true`);
      return (d.jobs || []).map((j) => ({
        id: String(j.shortcode || j.id),
        title: j.title,
        location: joinLoc(j.city, j.state, j.country) + (j.telecommuting ? ' · Remote' : ''),
        url: j.url || j.shortlink || `https://apply.workable.com/${b.token}/j/${j.shortcode}/`,
        postedAt: iso(j.published_on || j.created_at),
        department: j.department || '',
        text: j.description ? htmlToPlain([j.description, j.requirements, j.benefits].filter(Boolean).join('\n')) : undefined,
      }));
    }
    case 'smartrecruiters': {
      const out = [];
      for (let offset = 0; offset < 500; offset += 100) {
        const d = await getJson(fetchImpl, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings?limit=100&offset=${offset}`);
        for (const j of d.content || []) {
          const l = j.location || {};
          out.push({ id: String(j.id), title: j.name, location: joinLoc(l.city, l.region, l.country) + (l.remote ? ' · Remote' : ''), url: `https://jobs.smartrecruiters.com/${b.token}/${j.id}`, postedAt: iso(j.releasedDate), department: (j.department && j.department.label) || '' });
        }
        if (!d.content || d.content.length < 100 || out.length >= (d.totalFound || 0)) break;
      }
      return out;
    }
    case 'workday': {
      // Workday pages hold at most 20, and only the first page says how many
      // there are. One search failing (Workday rejects some search text)
      // shouldn't lose the others.
      const api = `https://${b.host}/wday/cxs/${b.token}/${b.site}/jobs`;
      const seen = new Map();
      await searchEach(searchTerms, async (term) => {
        let total = Infinity;
        for (let offset = 0; offset < WORKDAY_MAX; offset += 20) {
          const d = await getJson(fetchImpl, api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: term }) });
          if (offset === 0 && Number.isFinite(d.total)) total = d.total;
          const page = d.jobPostings || [];
          for (const j of page) {
            if (!j.externalPath || seen.has(j.externalPath)) continue;
            seen.set(j.externalPath, { id: j.externalPath, title: j.title, location: j.locationsText || '', url: `https://${b.host}/${b.site}${j.externalPath}`, postedAt: workdayPosted(j.postedOn, now), path: j.externalPath });
          }
          if (page.length < 20 || offset + 20 >= total) break;
        }
      });
      return [...seen.values()];
    }
    case 'recruitee': {
      const d = await getJson(fetchImpl, `https://${b.token}.recruitee.com/api/offers/`);
      return (d.offers || [])
        .filter((j) => !j.status || j.status === 'published')
        .map((j) => ({
          id: String(j.id),
          title: j.title,
          location: [j.location || joinLoc(j.city, j.country), j.remote ? 'Remote' : ''].filter(Boolean).join(' · '),
          url: j.careers_url || `https://${b.token}.recruitee.com/o/${j.slug}`,
          postedAt: iso(j.published_at || j.created_at),
          department: j.department || '',
          text: j.description ? htmlToPlain([j.description, j.requirements].filter(Boolean).join('\n')) : undefined,
        }));
    }
    case 'bamboohr': {
      const d = await getJson(fetchImpl, `https://${b.token}.bamboohr.com/careers/list`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      return (d.result || []).map((j) => {
        const l = j.location || j.atsLocation || {};
        return { id: String(j.id), title: j.jobOpeningName, location: [joinLoc(l.city, l.state), j.isRemote || /remote/i.test(j.locationType || '') ? 'Remote' : ''].filter(Boolean).join(' · '), url: `https://${b.token}.bamboohr.com/careers/${j.id}`, department: j.departmentLabel || '' };
      });
    }
    case 'oracle': {
      // Oracle boards can be as big as Workday ones, so they're searched by role too.
      const seen = new Map();
      await searchEach(searchTerms, async (term) => {
        let total = Infinity;
        for (let offset = 0; offset < SEARCH_MAX; offset += 25) {
          const finder = `findReqs;siteNumber=${b.site},limit=25,offset=${offset},sortBy=POSTING_DATES_DESC${term ? `,keyword="${term.replace(/[",;]/g, ' ')}"` : ''}`;
          const d = await getJson(fetchImpl, `${oracleApi(b)}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${encodeURIComponent(finder)}`);
          const item = (d.items || [])[0] || {};
          if (offset === 0 && Number.isFinite(item.TotalJobsCount)) total = item.TotalJobsCount;
          const page = item.requisitionList || [];
          for (const j of page) {
            if (j.Id == null || seen.has(String(j.Id))) continue;
            const more = (j.secondaryLocations || []).length ? ` +${j.secondaryLocations.length} more` : '';
            seen.set(String(j.Id), { id: String(j.Id), title: j.Title, location: (j.PrimaryLocation || '') + (j.PrimaryLocation ? more : '') + (/remote/i.test(j.WorkplaceType || '') ? ' · Remote' : ''), url: `https://${b.host}/hcmUI/CandidateExperience/en/sites/${b.site}/job/${j.Id}`, postedAt: iso(j.PostedDate), department: j.Organization || j.JobFamily || '' });
          }
          if (page.length < 25 || offset + 25 >= total) break;
        }
      });
      return [...seen.values()];
    }
    case 'phenom': {
      const seen = new Map();
      await searchEach(searchTerms, async (term) => {
        for (let from = 0; from < SEARCH_MAX; ) {
          const { jobs, total, size } = await phenomPage(b, term, from, fetchImpl);
          for (const j of jobs) {
            const job = phenomJob(b, j);
            if (job.id && !seen.has(job.id)) seen.set(job.id, job);
          }
          from += size;
          if (jobs.length < size || from >= total) break;
        }
      });
      return [...seen.values()];
    }
    case 'breezy': {
      const d = await getJson(fetchImpl, `https://${b.token}.breezy.hr/json`);
      return (Array.isArray(d) ? d : []).map((j) => {
        const locs = [j.location, ...(j.locations || [])].filter(Boolean);
        return {
          id: String(j.id),
          title: j.name,
          location: [...new Set(locs.map((l) => l.name).filter(Boolean))].join(' · ') + (locs.some((l) => l.is_remote) ? ' · Remote' : ''),
          url: j.url,
          postedAt: iso(j.published_date),
          department: j.department || '',
          pay: typeof j.salary === 'string' ? payFromText(j.salary) : undefined,
        };
      });
    }
    case 'pinpoint': {
      const d = await getJson(fetchImpl, `https://${b.token}.pinpointhq.com/postings.json`);
      return (d.data || []).map((j) => {
        const l = j.location || {};
        return {
          id: String(j.id),
          title: j.title,
          location: (l.name || joinLoc(l.city, l.province)) + (j.workplace_type === 'remote' ? ' · Remote' : ''),
          url: j.url,
          department: (j.job && j.job.department && j.job.department.name) || '',
          text: j.description ? htmlToPlain([j.description, j.key_responsibilities, j.skills_knowledge_expertise].filter(Boolean).join('\n')) : undefined,
        };
      });
    }
    case 'rippling': {
      const d = await getJson(fetchImpl, `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(b.token)}/jobs`);
      return (Array.isArray(d) ? d : []).map((j) => ({ id: String(j.uuid || j.id), title: j.name, location: (j.workLocation && j.workLocation.label) || '', url: j.url, department: (j.department && j.department.label) || '' }));
    }
    case 'gem': {
      const d = await getJson(fetchImpl, `https://api.gem.com/job_board/v0/${encodeURIComponent(b.token)}/job_posts/`);
      return (Array.isArray(d) ? d : []).map((j) => ({
        id: String(j.id),
        title: j.title,
        location: [...new Set([j.location && j.location.name, ...(j.offices || []).map((o) => o.location && o.location.name)].filter(Boolean))].join(' · ') + (j.location_type === 'remote' ? ' · Remote' : ''),
        url: j.absolute_url,
        postedAt: iso(j.first_published_at),
        department: ((j.departments || [])[0] || {}).name || '',
        text: j.content ? htmlToPlain(j.content) : undefined,
      }));
    }
    case 'teamtailor': {
      const { text } = await getText(fetchImpl, `https://${teamtailorHost(b)}/jobs.rss`, 'application/rss+xml');
      return xmlBlocks(text, 'item').map((it) => {
        const locs = xmlBlocks(it, 'location').map((l) => joinLoc(xmlText(l, 'city'), xmlText(l, 'country')) || xmlText(l, 'name'));
        const remote = /^(fully|remote)$/i.test(xmlText(it, 'remoteStatus'));
        return {
          id: xmlText(it, 'guid') || xmlText(it, 'link'),
          title: xmlText(it, 'title'),
          location: [...new Set(locs.filter(Boolean))].join(' · ') + (remote ? ' · Remote' : ''),
          url: xmlText(it, 'link'),
          postedAt: iso(xmlText(it, 'pubDate')),
          department: xmlText(it, 'department'),
          text: xmlText(it, 'description') ? htmlToPlain(xmlText(it, 'description')) : undefined,
        };
      });
    }
    case 'personio': {
      const host = `${b.token}.jobs.personio.${b.tld || 'de'}`;
      const { text } = await getText(fetchImpl, `https://${host}/xml?language=en`, 'application/xml');
      return xmlBlocks(text, 'position').map((p) => {
        const offices = [xmlText(p, 'office'), ...xmlBlocks(xmlBlocks(p, 'additionalOffices')[0] || '', 'office').map((o) => xmlText(o, 'office') || htmlToPlain(o))];
        const sections = xmlBlocks(p, 'jobDescription').map((d) => `${xmlText(d, 'name')}\n${htmlToPlain(xmlText(d, 'value'))}`);
        const id = xmlText(p, 'id');
        return {
          id,
          title: xmlText(p, 'name'),
          location: [...new Set(offices.filter(Boolean))].join(' · '),
          url: `https://${host}/job/${id}`,
          postedAt: iso(xmlText(p, 'createdAt')),
          department: xmlText(p, 'department'),
          text: sections.length ? sections.join('\n\n') : undefined,
        };
      });
    }
    case 'site': {
      const page = await getText(fetchImpl, b.token);
      const jobs = siteJobs(page.text, page.url);
      // Nothing there anymore (the site moved its jobs, or now draws them
      // with JavaScript): look for its jobs again.
      if (!jobs.length) throw failure('not found', { notFound: true });
      return jobs;
    }
    default:
      throw new Error(`Unknown careers site: ${b.ats}`);
  }
}

// ---------------- feeds (RSS, XML) ----------------

// Just enough XML for job feeds: the blocks of one tag (with or without a
// namespace prefix like tt:), and one tag's text with CDATA unwrapped.
function xmlBlocks(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${tag}>`, 'g');
  return [...String(xml || '').matchAll(re)].map((m) => m[1]);
}
function xmlText(xml, tag) {
  const block = xmlBlocks(xml, tag)[0];
  if (block === undefined) return '';
  const cdata = block.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeEntities(block)).trim();
}

// ---------------- the company's own careers site ----------------

// The site a page belongs to: careers.acme.com and jobs.acme.com are acme.com's.
function siteOf(host) {
  const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.');
  const n = parts.length > 2 && parts[parts.length - 1].length === 2 && parts[parts.length - 2].length <= 3 ? 3 : 2; // acme.co.uk
  return parts.slice(-n).join('.');
}

function absolute(href, base) {
  try {
    const u = new URL(decodeEntities(href), base);
    u.hash = '';
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

// Jobs a page describes for search engines (schema.org JobPosting, the data
// behind Google's job listings), on a list page or a posting's own page.
function ldJobs(html, pageUrl) {
  const out = [];
  for (const m of String(html || '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    // In page order, so the list reads as the site shows it.
    const queue = [data];
    while (queue.length) {
      const x = queue.shift();
      if (!x || typeof x !== 'object') continue;
      if (Array.isArray(x)) {
        queue.unshift(...x);
        continue;
      }
      if ([].concat(x['@type'] || []).includes('JobPosting')) {
        const job = ldJob(x, pageUrl);
        if (job) out.push(job);
      }
      queue.unshift(...['@graph', 'itemListElement', 'item', 'mainEntity'].map((k) => x[k]).filter(Boolean));
    }
  }
  return out;
}

function ldJob(x, pageUrl) {
  const url = absolute(x.url || x.sameAs || '', pageUrl);
  const title = x.title || x.name;
  if (!title) return null;
  const places = [].concat(x.jobLocation || []).map((l) => {
    const a = (l && l.address) || {};
    const country = typeof a.addressCountry === 'object' ? a.addressCountry && a.addressCountry.name : a.addressCountry;
    return typeof a === 'string' ? a : joinLoc(a.addressLocality, a.addressRegion, country);
  });
  const remote = /telecommute/i.test([].concat(x.jobLocationType || []).join(' '));
  const ident = x.identifier && typeof x.identifier === 'object' ? x.identifier.value : x.identifier;
  const s = x.baseSalary && x.baseSalary.value ? x.baseSalary : null;
  const unit = s ? String(s.value.unitText || s.unitText || '') : '';
  return {
    id: String((url && url.href) || ident || title),
    title,
    location: [...new Set(places.filter(Boolean))].join(' · ') + (remote ? (places.some(Boolean) ? ' · Remote' : 'Remote') : ''),
    url: url ? url.href : pageUrl,
    postedAt: iso(x.datePosted),
    pay: s ? pay(s.value.minValue || s.value.value, s.value.maxValue || s.value.value, s.currency, /hour/i.test(unit) ? 'hour' : /month/i.test(unit) ? 'month' : 'year') : undefined,
    text: x.description ? htmlToPlain(x.description) : undefined,
  };
}

// A link to one posting: on the company's site, under a jobs-like path with
// something after it (/careers/chief-of-staff-4471, /jobs/chief-of-staff),
// and with text that reads like a job title rather than "Benefits" or
// "Apply". Under a general path like /careers/ it needs an id, since
// /careers/students-and-graduates is a section, not a job.
const JOB_PATH = /^.*\/(jobs?|careers?|positions?|openings?|vacanc(?:y|ies)|roles?|opportunit(?:y|ies)|requisitions?|postings?|join-us|work-with-us)\/(.+)$/i;
const JOBS_ONLY = /^(jobs?|positions?|openings?|vacanc(?:y|ies)|requisitions?|postings?)$/i;
const NOT_A_TITLE = /^(apply( now)?|learn more|read more|see (all|more)|view (all|more|details|job|role|position|opening)s?|more( info)?|details|benefits|perks|culture|our (values|culture|team|story)|life at\b.*|teams?|locations?|students?|university|early careers?|internships?|faq|events?|blog|news|about( us)?|careers?|jobs?|open (roles|positions|jobs)|all (jobs|roles|positions|openings)|search( jobs)?|back|next|previous|home|contact( us)?|privacy.*|cookies?.*|terms.*|sign (in|up)|log ?in|español|english|deutsch|français)$/i;

function linkJobs(html, pageUrl) {
  const base = absolute(pageUrl, pageUrl);
  if (!base) return [];
  const out = new Map();
  for (const m of String(html || '').matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = absolute(m[1], base.href);
    if (!u || siteOf(u.hostname) !== siteOf(base.hostname)) continue;
    const path = u.pathname.replace(/\/+$/, '');
    const pm = path.match(JOB_PATH);
    if (!pm || u.href.replace(/\/+$/, '') === base.href.replace(/\/+$/, '')) continue;
    // One posting, not a section: an id, or a title-like slug.
    const rest = pm[2];
    if (!/\d{3,}/.test(rest + u.search) && !(JOBS_ONLY.test(pm[1]) && /[a-z]+-[a-z0-9]+/i.test(rest))) continue;
    // The first piece of text in the link is the title; cards add the place and team after it.
    const pieces = m[2]
      .replace(/<\s*(script|style|svg)[\s\S]*?<\/\s*\1\s*>/gi, '')
      .split(/<[^>]+>/)
      .map((t) => decodeEntities(t).replace(/\s+/g, ' ').trim())
      .filter((t) => /[A-Za-z]/.test(t));
    const title = pieces[0] || '';
    const words = title.split(' ').length;
    if (title.length < 3 || title.length > 120 || words > 14 || NOT_A_TITLE.test(title)) continue;
    if (!out.has(u.href)) out.set(u.href, { id: u.href, title, location: pieces.slice(1).find((t) => t.length < 60 && /,|remote|hybrid|\b[A-Z]{2}\b/i.test(t)) || '', url: u.href });
  }
  return [...out.values()];
}

// The jobs on a careers page: what it describes for search engines, or else
// the links to its postings. A couple of links at least, so a page with a
// stray link to one blog post isn't mistaken for a job list.
function siteJobs(html, pageUrl) {
  const ld = ldJobs(html, pageUrl);
  if (ld.length) return ld;
  const links = linkJobs(html, pageUrl);
  return links.length >= 2 ? links : [];
}

// Links from a careers page to the page that lists its jobs ("See open
// roles", "/careers/jobs"), on the company's own site.
const LISTING_TEXT = /\b(open (roles|positions|jobs|opportunities)|(see|view|browse|search|explore|find) (all |our |open |current )*(roles|jobs|positions|openings|opportunities)|current (openings|opportunities|vacancies)|job (openings|board|search|listings)|all jobs|join (us|the team|our team)|we'?re hiring|work (with|at) us)\b/i;
function listingLinks(html, pageUrl) {
  const base = absolute(pageUrl, pageUrl);
  if (!base) return [];
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = absolute(m[1], base.href);
    if (!u || siteOf(u.hostname) !== siteOf(base.hostname) || u.href === base.href) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (LISTING_TEXT.test(text) || /\/(jobs|openings|positions|open-roles|search)\/?$/i.test(u.pathname)) out.push(u.href);
  }
  return [...new Set(out)];
}

// A careers site on the company's own domain that's really Teamtailor's.
function teamtailorOnOwnDomain(page) {
  if (!/teamtailor-cdn|cdn\.teamtailor|teamtailor\.com\/(?:assets|packs)/i.test(page.text)) return null;
  const u = absolute(page.url, page.url);
  return u ? board('teamtailor', u.hostname.toLowerCase()) : null;
}

// ---------------- pay ----------------
//
// { min, max, currency, interval: 'year' | 'month' | 'hour' } from a board's
// own pay fields (Lever, Ashby) or, failing that, from a range written in the
// posting ("$150,000 - $190,000", "$150K–$190K", "£60k to £75k", "$45-$60/hr").

const CURRENCY_OF = { $: 'USD', '£': 'GBP', '€': 'EUR' };
const SYMBOL_OF = { USD: '$', CAD: 'CA$', AUD: 'A$', GBP: '£', EUR: '€' };

function pay(min, max, currency, interval) {
  min = Number(min) || null;
  max = Number(max) || null;
  if (!min && !max) return null;
  if (min && max && max < min) [min, max] = [max, min];
  const hi = max || min;
  // Nonsense for the interval (funding amounts, typos) is no pay at all.
  const ok = interval === 'hour' ? hi >= 7 && hi <= 2000 : interval === 'month' ? hi >= 500 && hi <= 200000 : hi >= 10000 && hi <= 3000000;
  return ok ? { min: min || max, max: max || min, currency: String(currency || 'USD').toUpperCase(), interval } : null;
}

function leverPay(r) {
  if (!r || typeof r !== 'object') return null;
  const interval = /hour/i.test(r.interval || '') ? 'hour' : /month/i.test(r.interval || '') ? 'month' : 'year';
  return pay(r.min, r.max, r.currency, interval);
}

function ashbyPay(c) {
  if (!c) return null;
  const parts = [...(c.summaryComponents || []), ...((c.compensationTiers || []).flatMap((t) => t.components || []))];
  const salary = parts.find((x) => /salary|hourly/i.test(x.compensationType || '') && (x.minValue || x.maxValue));
  if (salary) {
    const iv = String(salary.interval || '');
    return pay(salary.minValue, salary.maxValue, salary.currencyCode, /HOUR/i.test(iv) ? 'hour' : /MONTH/i.test(iv) ? 'month' : 'year');
  }
  return payFromText(c.scrapeableCompensationSalarySummary || c.compensationTierSummary || '');
}

function leverText(j) {
  const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToPlain(l.content)}`).join('\n\n');
  return [j.descriptionPlain || htmlToPlain(j.description), lists, j.additionalPlain || htmlToPlain(j.additional)].filter(Boolean).join('\n\n');
}

const NUM = '(\\d{1,3}(?:[,.]\\d{3})+|\\d+(?:\\.\\d+)?)\\s?([kK])?';
const CODE = '(?:USD|CAD|AUD|GBP|EUR)';
// Groups: 1 code, 2 symbol after a code, 3 "CA"/"A" prefix, 4 symbol, 5-6 low (and k), 7-8 high (and k).
const RANGE_RE = new RegExp(`(?:\\b(${CODE})\\s?([$£€])?|(?:\\b(CA|A))?([$£€]))\\s?${NUM}\\s*${CODE}?\\s*(?:-|–|—|to)\\s*${CODE}?\\s?(?:CA|A)?[$£€]?\\s?${NUM}`, 'g');

function money(n, k) {
  const v = Number(String(n).replace(/[,.](?=\d{3}\b)/g, ''));
  return Number.isFinite(v) ? (k ? v * 1000 : v) : null;
}

function payFromText(text) {
  const t = String(text || '');
  for (const m of t.matchAll(RANGE_RE)) {
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (/^\s*(m\b|mm\b|million|b\b|bn\b|billion)/i.test(after)) continue; // funding, not pay
    const code = m[1] || (m[3] === 'CA' ? 'CAD' : m[3] === 'A' ? 'AUD' : '') || CURRENCY_OF[m[2] || m[4]] || 'USD';
    const interval = /^\s*(\/\s*h(ou)?r|per hour|an hour|hourly)/i.test(after) ? 'hour' : /^\s*(\/\s*mo|per month|a month|monthly)/i.test(after) ? 'month' : 'year';
    // "$150 - 190k": the k on the high end applies to both.
    const p = pay(money(m[5], m[6] || (m[8] && Number(m[5]) < 1000)), money(m[7], m[8]), code, interval);
    if (p) return p;
  }
  return null;
}

// "$150K–$190K", "£60K", "$45–$60/hr".
function formatPay(p) {
  if (!p) return '';
  const sym = SYMBOL_OF[p.currency] || `${p.currency} `;
  const one = (v) => (p.interval === 'hour' ? `${sym}${Math.round(v)}` : v >= 1000 ? `${sym}${Math.round(v / 100) / 10}K`.replace('.0K', 'K') : `${sym}${Math.round(v)}`);
  const unit = p.interval === 'hour' ? '/hr' : p.interval === 'month' ? '/mo' : '';
  return (p.min === p.max ? one(p.min) : `${one(p.min)}–${one(p.max)}`) + unit;
}

// Yearly figure for sorting and comparing (hourly at 2,080 hours).
function yearlyPay(p) {
  if (!p) return 0;
  const v = p.max || p.min || 0;
  return p.interval === 'hour' ? v * 2080 : p.interval === 'month' ? v * 12 : v;
}

// ---------------- one posting's full text, for scoring ----------------

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013', mdash: '\u2014', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', hellip: '\u2026', bull: '\u2022', middot: '\u00b7', trade: '\u2122', reg: '\u00ae', copy: '\u00a9', eacute: '\u00e9', amp: '&' };

// &amp; last, so "&amp;lt;" becomes "&lt;" and not "<".
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (m, n) => codePoint(Number(n), m))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(parseInt(n, 16), m))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() !== 'amp' && ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/&amp;/gi, '&');
}

function codePoint(n, fallback) {
  try {
    return n > 0 ? String.fromCodePoint(n) : fallback;
  } catch {
    return fallback;
  }
}

// Board descriptions come as HTML, sometimes escaped twice.
function htmlToPlain(html) {
  let s = String(html || '');
  for (let i = 0; i < 2 && /&lt;\/?[a-z]/i.test(s); i++) s = decodeEntities(s);
  return decodeEntities(
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, '')
      .replace(/<\s*li[^>]*>/gi, '\n- ')
      .replace(/<\s*(br|\/p|\/div|\/h\d|\/ul|\/ol|\/li|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// A posting page's own job data (schema.org JobPosting), for when a board's
// API won't give the description.
function descriptionFromPage(html) {
  for (const m of String(html || '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const x = stack.pop();
      if (!x || typeof x !== 'object') continue;
      if (Array.isArray(x)) stack.push(...x);
      else {
        const type = [].concat(x['@type'] || []);
        if (type.includes('JobPosting') && x.description) return htmlToPlain(x.description);
        if (x['@graph']) stack.push(x['@graph']);
      }
    }
  }
  return '';
}

// The full text of one posting: from the board's API, or failing that, from
// the posting's own page.
async function jobDetail(b, job, fetchImpl) {
  let text = '';
  let apiErr = null;
  try {
    text = await apiDetail(b, job, fetchImpl);
  } catch (err) {
    apiErr = err;
  }
  if (text.length >= 80 || !/^https?:\/\//i.test(job.url || '')) {
    if (!text && apiErr) throw apiErr;
    return text;
  }
  try {
    const page = await getText(fetchImpl, job.url);
    const fromPage = descriptionFromPage(page.text);
    if (fromPage.length > text.length) return fromPage;
  } catch {
    // keep what the API gave
  }
  if (!text && apiErr) throw apiErr;
  return text;
}

async function apiDetail(b, job, fetchImpl) {
  switch (b.ats) {
    case 'greenhouse': {
      const d = await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs/${encodeURIComponent(job.id)}`);
      return htmlToPlain(d.content);
    }
    case 'lever': {
      const d = await getJson(fetchImpl, `https://api.${b.region === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${encodeURIComponent(b.token)}/${encodeURIComponent(job.id)}`);
      const lists = (d.lists || []).map((l) => `${l.text}\n${htmlToPlain(l.content)}`).join('\n\n');
      return [d.descriptionPlain || htmlToPlain(d.description), lists, d.additionalPlain || htmlToPlain(d.additional)].filter(Boolean).join('\n\n');
    }
    case 'ashby': {
      const d = await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}`);
      const j = (d.jobs || []).find((x) => String(x.id) === job.id);
      return j ? j.descriptionPlain || htmlToPlain(j.descriptionHtml) : '';
    }
    case 'workable': {
      const d = await getJson(fetchImpl, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(b.token)}?details=true`);
      const j = (d.jobs || []).find((x) => String(x.shortcode || x.id) === job.id);
      return j ? htmlToPlain([j.description, j.requirements, j.benefits].filter(Boolean).join('\n')) : '';
    }
    case 'smartrecruiters': {
      const d = await getJson(fetchImpl, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings/${encodeURIComponent(job.id)}`);
      const s = (d.jobAd && d.jobAd.sections) || {};
      return ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
        .map((k) => s[k] && `${s[k].title || ''}\n${htmlToPlain(s[k].text)}`)
        .filter(Boolean)
        .join('\n\n');
    }
    case 'workday': {
      const d = await getJson(fetchImpl, `https://${b.host}/wday/cxs/${b.token}/${b.site}${job.path || job.id}`);
      return htmlToPlain(d.jobPostingInfo && d.jobPostingInfo.jobDescription);
    }
    case 'recruitee': {
      const d = await getJson(fetchImpl, `https://${b.token}.recruitee.com/api/offers/`);
      const j = (d.offers || []).find((x) => String(x.id) === job.id);
      return j ? htmlToPlain([j.description, j.requirements].filter(Boolean).join('\n')) : '';
    }
    case 'bamboohr': {
      const d = await getJson(fetchImpl, `https://${b.token}.bamboohr.com/careers/${encodeURIComponent(job.id)}/detail`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const j = (d.result && d.result.jobOpening) || {};
      return htmlToPlain(j.description);
    }
    case 'oracle': {
      const finder = `ById;Id="${String(job.id).replace(/"/g, '')}",siteNumber=${b.site}`;
      const d = await getJson(fetchImpl, `${oracleApi(b)}/recruitingCEJobRequisitionDetails?onlyData=true&expand=all&finder=${encodeURIComponent(finder)}`);
      const j = (d.items || [])[0] || {};
      return htmlToPlain([j.ExternalDescriptionStr, j.ExternalResponsibilitiesStr, j.ExternalQualificationsStr].filter(Boolean).join('\n'));
    }
    case 'phenom': {
      // The posting's page carries its description in the same phApp data.
      if (!/^https?:\/\//i.test(job.url || '')) return '';
      const page = await getText(fetchImpl, job.url);
      const ddo = scriptObject(page.text, 'phApp.ddo') || {};
      const j = (ddo.jobDetail && ddo.jobDetail.data && ddo.jobDetail.data.job) || {};
      return htmlToPlain(j.description || '') || descriptionFromPage(page.text);
    }
    default:
      return '';
  }
}

// ---------------- which jobs are relevant ----------------

const STOP = new Set(['of', 'the', 'and', 'or', 'a', 'an', 'to', 'for', 'in', 'at', 'on', 'with', 'senior', 'sr', 'junior', 'jr', 'lead', 'i', 'ii', 'iii', 'iv', 'v']);
// Abbreviations and spellings that mean the same thing in a job title.
const SAME = {
  ops: 'operations',
  mgr: 'manager',
  mngr: 'manager',
  mgmt: 'management',
  eng: 'engineer',
  engineering: 'engineer',
  engr: 'engineer',
  dev: 'developer',
  swe: 'software engineer',
  sde: 'software development engineer',
  pm: 'product manager',
  tpm: 'technical program manager',
  bizops: 'business operations',
  biz: 'business',
  bd: 'business development',
  bizdev: 'business development',
  cos: 'chief staff',
  strategic: 'strategy',
  vp: 'vice president',
  svp: 'vice president',
  evp: 'vice president',
  dir: 'director',
  assoc: 'associate',
  coord: 'coordinator',
  exec: 'executive',
  ea: 'executive assistant',
  gm: 'general manager',
  mktg: 'marketing',
  hr: 'human resources',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  ux: 'user experience',
  frontend: 'front end',
  backend: 'back end',
  fullstack: 'full stack',
  internship: 'intern',
};
const JUNIOR_TRACK = /\b(intern|internship|co-?op|apprentice(ship)?)\b/i;

// "Operations" and "Operation", "Sales" and "Sale" are the same word here.
const stem = (w) => (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w);

function words(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(front|back|full)-(end|stack)\b/g, '$1$2')
    .replace(/\bco-op\b/g, 'coop')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (SAME[w] || w).split(' '))
    .filter((w) => !STOP.has(w))
    .map(stem);
}

// Does `title` (a list of words) contain every word of `phrase`, close together?
// In the phrase's order a few words may sit between them ("Head of Global
// Business Operations" for "Head of Operations"); in another order they must
// sit almost side by side ("Manager, Business Operations" for "Operations
// Manager"), so "Staff Engineer, Office of the Chief Scientist" isn't a
// "Chief of Staff" job.
function phraseIn(t, phrase) {
  const want = [...new Set(phrase)];
  if (!want.length || !want.every((w) => t.includes(w))) return false;
  if (want.length === 1) return true;
  // The shortest run of title words holding all of them.
  let best = null;
  for (let i = 0; i < t.length; i++) {
    if (!want.includes(t[i])) continue;
    const need = new Set(want);
    for (let j = i; j < t.length; j++) {
      need.delete(t[j]);
      if (!need.size) {
        if (!best || j - i < best.end - best.start) best = { start: i, end: j };
        break;
      }
    }
  }
  if (!best) return false;
  const run = t.slice(best.start, best.end + 1);
  const order = want.map((w) => run.indexOf(w));
  const inOrder = order.every((x, k) => k === 0 || x > order[k - 1]);
  return run.length <= want.length + (inOrder ? 3 : 1);
}

// A title matches a role when it has every meaningful word of it, close
// together: "Operations Manager" matches "Manager, Business Operations" and
// "Sr. Ops Manager". Keywords match on their own ("chief of staff",
// "strategy"). Internships only match when you asked for one.
function titleMatches(title, roles = [], keywords = []) {
  const t = words(title);
  if (!t.length) return false;
  const junior = JUNIOR_TRACK.test(String(title));
  const fits = (phrase) => {
    const w = words(phrase);
    return w.length > 0 && phraseIn(t, w) && (!junior || JUNIOR_TRACK.test(String(phrase)));
  };
  return roles.some(fits) || keywords.some(fits);
}

// ---------------- checking a company ----------------

// Find a company's board: its careers link, then the careers page (where it
// redirects to, or what its HTML links to), then its name tried on the boards
// that live at predictable addresses, then the company's own site (its
// careers page, or a Phenom site on careers. or jobs.), then the same on
// sites named after it (acme.com). When nothing turns up only because the
// sites couldn't be reached, that's an error to retry, not "no board".
async function findBoard(company, fetchImpl) {
  const link = normalizeLink(company.careersUrl);
  const direct = detectBoard(link);
  if (direct) return direct;
  let unreachable = null;
  if (/^https?:\/\//i.test(link)) {
    try {
      const page = await getText(fetchImpl, link);
      const b = atsOnPage(page);
      if (b) return { ...b, via: 'page' };
      // Its jobs may be a click away ("See open roles"), on an ATS or on the site itself.
      const pages = [page];
      for (const next of listingLinks(page.text, page.url).slice(0, 2)) {
        try {
          const p = await getText(fetchImpl, next);
          const nb = atsOnPage(p);
          if (nb) return { ...nb, via: 'page' };
          pages.push(p);
        } catch {
          // try the next one
        }
      }
      for (const p of pages) if (siteJobs(p.text, p.url).length) return { ...board('site', p.url), via: 'page' };
    } catch (err) {
      if (err.transient) unreachable = err;
      // fall through to guessing
    }
  }
  let answered = false;
  const slugs = slugsFor(company.name);
  for (const slug of slugs) {
    for (const ats of ['greenhouse', 'lever', 'ashby', 'recruitee', 'bamboohr']) {
      const b = board(ats, slug);
      try {
        const jobs = await listJobs(b, fetchImpl);
        answered = true;
        if (jobs.length) return { ...b, guessed: true };
      } catch (err) {
        if (!err.transient) answered = true;
        // Unreachable before any board answered: offline, so stop guessing.
        else if (!answered) throw unreachable || err;
      }
    }
  }
  // The company's own site. One you set is trusted; one guessed from the
  // name must name the company on its careers page, and is marked guessed.
  const own = siteDomain(company.website);
  const guesses = [...new Set(slugs.filter((x) => !x.includes('-')).map((x) => `${x}.com`))].filter((d) => d !== own);
  for (const [domain, guessed] of [...(own ? [[own, false]] : []), ...guesses.map((d) => [d, true])]) {
    const pages = [`https://careers.${domain}/`, `https://jobs.${domain}/`, ...(guessed ? [] : [`https://${domain}/careers`])];
    for (const url of pages) {
      try {
        const page = await getText(fetchImpl, url);
        if (guessed && !namesCompany(page.text, company.name)) continue;
        const b = atsOnPage(page);
        if (b) return guessed ? { ...b, guessed: true } : { ...b, via: 'page' };
      } catch {
        // no such site, or nothing there: try the next
      }
    }
  }
  return null;
}

// The board a careers page is on, embeds or links to.
function atsOnPage(page) {
  return detectBoard(page.url) || boardFromHtml(page.text) || phenomFromPage(page.text, page.url) || teamtailorOnOwnDomain(page);
}

// acme.com from "https://www.acme.com/about", or null.
function siteDomain(url) {
  try {
    const host = new URL(normalizeLink(url)).hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') && !/^[\d.]+$/.test(host) && !detectBoard(url) ? host : null;
  } catch {
    return null;
  }
}

// Does a page name the company? "Freddie Mac" on careers.freddiemac.com,
// in its title, its text or its page data.
function namesCompany(html, name) {
  const plain = (x) =>
    ` ${String(x || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&amp;|&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()} `;
  // Anywhere on it: Phenom pages carry most of their text in script data.
  const text = plain(html);
  const want = plain(String(name || '').replace(/\([^)]*\)/g, ' ').replace(/\b(inc|llc|ltd|corp|corporation|co|company|plc|gmbh)\b\.?/gi, ' '));
  return want.trim().length >= 2 && text.includes(want);
}

const KEEP = 60; // matching jobs kept per company
const SEARCHED = new Set(['workday', 'oracle', 'phenom']); // boards too big to list in full
const SEEN = 3000; // job ids remembered per company

const splitKeywords = (s) => [
  ...new Set(
    String(s || '')
      .split(/[,;\n|·]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

// Check one company: returns the fields to save on it, and the matching
// jobs that are new since the last check.
//
// With `scoreJob` (the free local fit score), each matching job also gets a
// fit preview. Most boards list descriptions with the jobs; for the ones that
// don't (SmartRecruiters, Workday, BambooHR, Breezy, Rippling, Oracle, Phenom,
// companies' own sites), up to DETAIL_BUDGET new jobs per check are
// read one by one, and earlier previews are kept. Descriptions aren't saved.
const DETAIL_BUDGET = 8;

async function checkCompany(company, { fetchImpl, roles = [], now = Date.now(), scoreJob = null } = {}) {
  const at = new Date(now).toISOString();
  const saidNotThem = !!(company.board && company.board.ats === 'none');
  let b = company.board && company.board.ats && !saidNotThem ? company.board : null;
  if (!b && !saidNotThem) b = await findBoard(company, fetchImpl);
  if (!b) return { patch: { board: null, lastCheckedAt: at, checkError: 'no-board', openCount: 0, jobs: [] }, fresh: [] };

  roles = [...new Set(roles.map((r) => String(r).trim()).filter(Boolean))];
  const keywords = splitKeywords(company.keywords);
  const list = (brd) => listJobs(brd, fetchImpl, { searchTerms: SEARCHED.has(brd.ats) ? [...roles, ...keywords] : [], now });
  let all;
  try {
    all = await list(b);
  } catch (err) {
    if (!err.notFound) throw err;
    // The board is gone. One Sprout found for itself (from the page or the
    // name) may have moved, so look again; one you linked to, say so.
    const found = b.guessed || b.via ? await findBoard(company, fetchImpl) : null;
    if (found && boardKey(found) !== boardKey(b)) {
      b = found;
      all = await list(b);
    } else if (b.guessed || b.via) {
      return { patch: { board: null, lastCheckedAt: at, checkError: 'no-board', openCount: 0, jobs: [] }, fresh: [] };
    } else {
      throw failure(`That ${ATS_LABEL[b.ats] || 'job'} board isn't there anymore. Check the careers link?`);
    }
  }
  // A different board than last time: its job ids are all new to us, so treat it like a first check.
  const sameBoard = company.board && company.board.ats && boardKey(company.board) === boardKey(b);
  const firstCheck = !company.seen || !sameBoard;
  const seen = new Set(firstCheck ? [] : company.seen);
  const before = new Map((sameBoard ? company.jobs || [] : []).map((j) => [j.id, j]));
  const matching = all.filter((j) => (roles.length || keywords.length ? titleMatches(j.title, roles, keywords) : true));
  const kept = matching
    .map((j) => ({ ...j, firstSeenAt: (before.get(j.id) || {}).firstSeenAt || (seen.has(j.id) || firstCheck ? null : at) }))
    .sort((x, y) => String(y.postedAt || y.firstSeenAt || '').localeCompare(String(x.postedAt || x.firstSeenAt || '')))
    .slice(0, KEEP);
  let budget = DETAIL_BUDGET;
  const jobs = [];
  for (const j of kept) {
    const { text: listed, ...job } = j;
    const prev = before.get(j.id) || {};
    let text = listed;
    if (!text && scoreJob && !prev.fit && budget > 0) {
      budget--;
      text = await jobDetail(b, j, fetchImpl).catch(() => '');
      if (text && !job.pay) job.pay = payFromText(text);
    }
    if (!job.pay && prev.pay) job.pay = prev.pay;
    if (!job.pay) delete job.pay;
    let fit = prev.fit || null;
    if (scoreJob && text && text.length >= 80) {
      try {
        fit = scoreJob({ title: job.title, company: company.name, location: job.location, text }) || null;
      } catch {
        // keep the earlier preview
      }
    }
    if (fit) job.fit = fit;
    jobs.push(job);
  }
  const fresh = firstCheck ? [] : jobs.filter((j) => !seen.has(j.id));
  const ids = [...new Set([...all.map((j) => j.id), ...seen])].slice(0, SEEN);
  const patch = { board: b, lastCheckedAt: at, checkError: null, openCount: all.length, jobs, seen: ids };
  // The very first look at a company you just added: its open roles are all
  // new to you, so standout fits among them are worth a mention too.
  if (!company.seen) patch.firstCheckedAt = at;
  return { patch, fresh, firstLook: !company.seen };
}

module.exports = { ATS_LABEL, siteJobs, listingLinks, http, payFromText, formatPay, yearlyPay, normalizeLink, detectBoard, descriptionFromPage, decodeEntities, boardUrl, boardFromHtml, phenomFromPage, scriptObject, slugsFor, listJobs, jobDetail, htmlToPlain, workdayPosted, titleMatches, findBoard, checkCompany };
